-- heylivo: "Frage des Tages" als freiwillige tägliche Nachricht (app/daily.js, send-reminders action "daily").
-- Pro Gerät in push_subscriptions, alles leer, solange man es nicht einschaltet:
--   daily_hour    = gewählte Stunde (leer = aus, die Voreinstellung)
--   daily_tz      = Zeitzone des Geräts
--   daily_q       = Text der nächsten Frage, wie sie die App zeigen würde (leer = keine Frage offen, also keine Nachricht)
--   daily_sent_on = Tag der letzten Nachricht; die App setzt ihn auch, wenn die Frage heute schon beantwortet wurde
--   daily_seen_on = Tag, an dem die App zuletzt geöffnet wurde (mehr als 7 Tage her: keine Nachricht)
-- Die Tabelle hat ihre Grants und die Regel "own push subscriptions" schon (0001, 0004): neue Spalten brauchen keine eigenen.
-- Dazu ein Cron-Job, der jede volle Stunde send-reminders mit action "daily" aufruft. Das Geheimnis kommt aus dem Vault (siehe 0003).
-- Darf mehrfach ausgeführt werden.

alter table public.push_subscriptions
  add column if not exists daily_hour smallint check (daily_hour between 0 and 23),
  add column if not exists daily_tz text check (char_length(daily_tz) <= 64),
  add column if not exists daily_q text check (char_length(daily_q) <= 200),
  add column if not exists daily_sent_on date,
  add column if not exists daily_seen_on date;

select cron.schedule(
  'livo-daily',
  '0 * * * *',
  $job$
  select net.http_post(
    url := 'https://fkhngrvqxlpqxpllrnoj.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_Ya83flK2efxCxi1WecSCwA_wbC_njXD',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'livo_cron_secret')
    ),
    body := '{"action":"daily"}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $job$
);

-- Kontrolle: spalten = 5, zeitplan = 0 * * * *
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'push_subscriptions' and column_name like 'daily%') as spalten,
  (select schedule from cron.job where jobname = 'livo-daily') as zeitplan;
