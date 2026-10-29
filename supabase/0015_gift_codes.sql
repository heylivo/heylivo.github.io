-- heylivo: Gratis-Aktion ohne Stripe. Der Link aus der Instagram-DM (heylivo.com/app/?gift=<Code>)
-- öffnet in der App das Fenster "Geschenkt: 1 Jahr Livo Plus"; ein Tipp ruft redeem_gift() auf.
-- Die Funktion prüft den Code (gültig bis, höchstens N Einlösungen, einmal pro Konto) und
-- verlängert plans.plus_until um ein Jahr - ab heute oder ab dem alten Ende, wie der Stripe-Webhook.
-- Nutzer lesen und schreiben die beiden Tabellen nie direkt, nur über die Funktion.
-- Darf mehrfach ausgeführt werden. VOR dem neuen DM-Link in ManyChat ausführen.

create table if not exists public.gift_codes (
  code text primary key,
  max_uses int not null,
  valid_until timestamptz not null
);
alter table public.gift_codes enable row level security;
revoke all on public.gift_codes from anon, authenticated;
grant select, insert, update, delete on public.gift_codes to service_role;

create table if not exists public.gift_redemptions (
  id bigint generated always as identity primary key,
  code text not null references public.gift_codes (code),
  -- gelöschte Konten zählen weiter mit (sonst würde ein Platz wieder frei)
  user_id uuid references auth.users (id) on delete set null,
  plus_until date not null,
  redeemed_at timestamptz not null default now(),
  unique (code, user_id)
);
alter table public.gift_redemptions enable row level security;
revoke all on public.gift_redemptions from anon, authenticated;
grant select, insert, update, delete on public.gift_redemptions to service_role;

-- HEYLIVO25: die 25 Gratis-Jahre der Aktion (Teilnahmebedingungen: einlösbar bis 31.12.2026).
-- GIFTTEST: 3 Einlösungen nur zum Testen.
insert into public.gift_codes (code, max_uses, valid_until) values
  ('HEYLIVO25', 25, '2026-12-31 23:59:59 Europe/Berlin'),
  ('GIFTTEST', 3, '2026-12-31 23:59:59 Europe/Berlin')
on conflict (code) do nothing;

-- Antwort: {"ok": true, "plus_until": "2027-10-29"} oder {"ok": false, "error": "invalid" | "expired" | "used_up" | "already"}
create or replace function public.redeem_gift(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g public.gift_codes;
  used int;
  berlin_today date := (now() at time zone 'Europe/Berlin')::date;
  current_until date;
  new_until date;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  -- "for update": zwei gleichzeitige Einlösungen warten aufeinander, so bleibt es bei höchstens max_uses
  select * into g from public.gift_codes where code = upper(trim(coalesce(p_code, ''))) for update;
  if not found then return json_build_object('ok', false, 'error', 'invalid'); end if;
  select plus_until into current_until from public.plans where user_id = uid;
  if exists (select 1 from public.gift_redemptions where code = g.code and user_id = uid) then
    return json_build_object('ok', false, 'error', 'already', 'plus_until', current_until);
  end if;
  if now() > g.valid_until then return json_build_object('ok', false, 'error', 'expired'); end if;
  select count(*) into used from public.gift_redemptions where code = g.code;
  if used >= g.max_uses then return json_build_object('ok', false, 'error', 'used_up'); end if;
  new_until := (greatest(coalesce(current_until, berlin_today), berlin_today) + interval '1 year')::date;
  insert into public.plans (user_id, plus_until, updated_at) values (uid, new_until, now())
  on conflict (user_id) do update set plus_until = excluded.plus_until, updated_at = now();
  insert into public.gift_redemptions (code, user_id, plus_until) values (g.code, uid, new_until);
  return json_build_object('ok', true, 'plus_until', new_until);
end $$;
revoke all on function public.redeem_gift(text) from public, anon;
grant execute on function public.redeem_gift(text) to authenticated;

-- Selbsttest mit einem vorhandenen Konto. Alles wird danach zurückgenommen.
create temp table if not exists gift_test (pruefung text, ergebnis text);
truncate gift_test;
do $$
declare u uuid; r1 json; r2 json; r3 json;
begin
  select id into u from auth.users order by created_at limit 1;
  if u is null then insert into gift_test values ('Testkonto', 'keines vorhanden'); return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  begin
    r1 := public.redeem_gift('gifttest');
    r2 := public.redeem_gift('GIFTTEST');
    r3 := public.redeem_gift('FALSCH');
    raise exception 'ok_rollback';
  exception when others then
    -- erst hier eintragen: alles im Block oben ist zurückgenommen, die Variablen bleiben
    if sqlerrm = 'ok_rollback' then
      insert into gift_test values ('1. Einlösen (muss ok sein)', r1::text),
        ('2. Nochmal einlösen (muss already sein)', r2::text), ('3. Falscher Code (muss invalid sein)', r3::text);
    else
      insert into gift_test values ('FEHLER', sqlerrm);
    end if;
  end;
end $$;
select * from gift_test
union all
select 'Code ' || c.code, (select count(*) from public.gift_redemptions r where r.code = c.code) || ' von ' || c.max_uses || ' eingelöst'
from public.gift_codes c;
