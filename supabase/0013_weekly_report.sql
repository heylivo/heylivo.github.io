-- heylivo: Wochenbericht an den Inhaber - jeden Montag um 6:00 UTC (7:00/8:00 Uhr deutscher Zeit)
-- die Edge Function weekly-report aufrufen. Sie zählt die Nutzer in der Testphase (ohne und mit
-- E-Mail) und mit Livo Plus und schickt die Übersicht an das Function-Secret OWNER_EMAIL.
-- Das Geheimnis kommt aus dem Vault (siehe 0003). Keine neue Tabelle, nur ein Cron-Job.
-- Darf mehrfach ausgeführt werden: cron.schedule mit einem vorhandenen Namen ersetzt den Job.
-- Zum Testen sofort einmal auslösen: das select net.http_post(...) aus dem Job allein ausführen.

select cron.schedule(
  'livo-weekly-report',
  '0 6 * * 1',
  $job$
  select net.http_post(
    url := 'https://fkhngrvqxlpqxpllrnoj.supabase.co/functions/v1/weekly-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_Ya83flK2efxCxi1WecSCwA_wbC_njXD',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'livo_cron_secret')
    ),
    body := '{"action":"report"}'::jsonb,
    timeout_milliseconds := 30000
  ) as request_id;
  $job$
);

-- Kontrolle: alle heylivo-Jobs
select jobname, schedule, active from cron.job where jobname like 'livo-%' order by jobname;
