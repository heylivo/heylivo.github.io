-- heylivo: Kalender-Abo für Livo Plus. Jeder Nutzer bekommt auf Wunsch einen geheimen Link,
-- über den Google, Apple oder Outlook die nächsten Termine seiner Fristen abholt
-- (Edge Function "calendar", .../functions/v1/calendar/<token>.ics). Ohne aktives Livo Plus
-- liefert der Link einen leeren Kalender. Die App holt den Link über calendar_feed().
-- Darf mehrfach ausgeführt werden. VOR dem Hochladen der App ausführen.

create table if not exists public.calendar_feeds (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- 64 Hex-Zeichen aus zwei Zufalls-UUIDs (kein Zusatzmodul nötig)
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  lang text not null default 'de' check (char_length(lang) <= 5),
  created_at timestamptz not null default now()
);
alter table public.calendar_feeds enable row level security;
drop policy if exists "read own calendar feed" on public.calendar_feeds;
create policy "read own calendar feed" on public.calendar_feeds for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.calendar_feeds to authenticated;
grant select, insert, update, delete on public.calendar_feeds to service_role;

-- Link holen, beim ersten Mal anlegen. renew = true macht einen neuen Link (der alte geht dann nicht mehr).
create or replace function public.calendar_feed(feed_lang text default 'de', renew boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  result text;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  insert into public.calendar_feeds (user_id, lang) values (uid, left(coalesce(feed_lang, 'de'), 5))
  on conflict (user_id) do update set
    lang = excluded.lang,
    token = case when renew then replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
                 else public.calendar_feeds.token end
  returning token into result;
  return result;
end $$;
revoke all on function public.calendar_feed(text, boolean) from public, anon;
grant execute on function public.calendar_feed(text, boolean) to authenticated;

-- Kontrolle: Tabelle und Funktion sind da (zwei Zeilen)
select 'calendar_feeds' as name, count(*)::text as info from public.calendar_feeds
union all
select 'calendar_feed()', pg_get_function_identity_arguments('public.calendar_feed(text, boolean)'::regprocedure);
