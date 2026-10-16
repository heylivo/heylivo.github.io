-- heylivo: Hinweise vor dem Ablauf von Livo Plus (send-reminders, Aktion "run").
-- plus_notice = zuletzt verschickter Hinweis für das Enddatum plus_notice_until:
-- 0 keiner, 1 "endet in n Tagen" (ab 30 Tage vorher), 2 "endet bald" (ab 7 Tage vorher),
-- 3 "ist abgelaufen" (bis 3 Tage danach). Nach einer Verlängerung (neues plus_until) gilt wieder 0.
-- Darf mehrfach ausgeführt werden. VOR dem Veröffentlichen der neuen send-reminders ausführen.

alter table public.plans add column if not exists plus_notice smallint not null default 0;
alter table public.plans add column if not exists plus_notice_until date;

-- Kontrolle: zwei Zeilen
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'plans' and column_name in ('plus_notice', 'plus_notice_until')
order by column_name;
