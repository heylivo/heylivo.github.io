-- heylivo: Gratis-Jahr beim Anmelden mitnehmen.
-- Der Link aus der Instagram-DM öffnet oft im eingebauten Browser von Instagram. Der kennt das Konto nicht,
-- die App legt dort ein neues anonymes Konto an, und redeem_gift() schreibt das Gratis-Jahr diesem Konto gut.
-- Wer heylivo schon mit E-Mail nutzt und sich danach dort anmeldet, bekam bisher nur seine Fristen mit,
-- nicht das Plus (Bericht vom 04.11.2026: zwei Nutzer brauchten einen zweiten Anlauf).
-- Jetzt: Vor dem Anmelden holt sich die App als anonymes Konto mit prepare_carry() einen Einmal-Schlüssel,
-- nach dem Anmelden zieht claim_carry(Schlüssel) das restliche Plus samt Einlösung ins richtige Konto um.
-- Der Schlüssel gilt 30 Minuten und nur einmal; das anonyme Konto verliert das Plus dabei.
-- Nutzer lesen und schreiben die Tabelle nie direkt, nur über die Funktionen. Darf mehrfach ausgeführt werden.

create table if not exists public.plus_carry (
  token uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.plus_carry enable row level security;
revoke all on public.plus_carry from anon, authenticated;
grant select, insert, update, delete on public.plus_carry to service_role;

-- Antwort: Schlüssel (uuid) oder null, wenn es nichts mitzunehmen gibt (kein anonymes Konto, kein laufendes Plus)
create or replace function public.prepare_carry()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  tok uuid;
  berlin_today date := (now() at time zone 'Europe/Berlin')::date;
begin
  if uid is null then return null; end if;
  if not exists (select 1 from auth.users where id = uid and is_anonymous) then return null; end if;
  if not exists (select 1 from public.plans where user_id = uid and plus_until >= berlin_today) then return null; end if;
  delete from public.plus_carry where from_user = uid or created_at < now() - interval '1 day';
  insert into public.plus_carry (from_user) values (uid) returning token into tok;
  return tok;
end $$;
revoke all on function public.prepare_carry() from public, anon;
grant execute on function public.prepare_carry() to authenticated;

-- Antwort: {"ok": true, "plus_until": "2027-11-04"} oder {"ok": false, "error": "invalid" | "already"}
create or replace function public.claim_carry(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  src uuid;
  src_until date;
  current_until date;
  new_until date;
  berlin_today date := (now() at time zone 'Europe/Berlin')::date;
begin
  if uid is null or p_token is null then return json_build_object('ok', false, 'error', 'invalid'); end if;
  delete from public.plus_carry where token = p_token and created_at > now() - interval '30 minutes'
    returning from_user into src;
  if src is null or src = uid then return json_build_object('ok', false, 'error', 'invalid'); end if;
  select plus_until into src_until from public.plans where user_id = src for update;
  if src_until is null or src_until < berlin_today then return json_build_object('ok', false, 'error', 'invalid'); end if;
  select plus_until into current_until from public.plans where user_id = uid for update;
  -- Hatte das richtige Konto denselben Code schon eingelöst: kein zweites Jahr, die Doppel-Einlösung wird frei
  if exists (select 1 from public.gift_redemptions a join public.gift_redemptions b on a.code = b.code
             where a.user_id = src and b.user_id = uid) then
    delete from public.gift_redemptions where user_id = src;
    delete from public.plans where user_id = src;
    return json_build_object('ok', false, 'error', 'already', 'plus_until', current_until);
  end if;
  -- Die restlichen Tage kommen dazu - ab heute oder ab dem Ende eines schon laufenden Plus (wie redeem_gift)
  new_until := greatest(coalesce(current_until, berlin_today), berlin_today) + (src_until - berlin_today);
  insert into public.plans (user_id, plus_until, updated_at, paid_cents) values (uid, new_until, now(), 0)
  on conflict (user_id) do update set plus_until = excluded.plus_until, updated_at = now();
  update public.gift_redemptions set user_id = uid, plus_until = new_until where user_id = src;
  delete from public.plans where user_id = src;
  return json_build_object('ok', true, 'plus_until', new_until);
end $$;
revoke all on function public.claim_carry(uuid) from public, anon;
grant execute on function public.claim_carry(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Prüfung: beide Funktionen und die Tabelle sind da
select 'plus_carry' as was, count(*)::text as ergebnis from public.plus_carry
union all
select p.proname, 'ok' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('prepare_carry', 'claim_carry');
