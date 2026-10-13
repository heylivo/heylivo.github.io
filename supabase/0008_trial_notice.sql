-- heylivo: Hinweise zum Ende der Testphase (send-reminders, Aktion "run").
-- trial_notice = zuletzt verschickter Hinweis: 0 keiner, 1 "endet in 7 Tagen",
-- 2 "endet heute", 3 "ist vorbei". So kommt jeder Hinweis höchstens einmal.
-- Darf mehrfach ausgeführt werden.

alter table public.usage add column if not exists trial_notice smallint not null default 0;

-- Kontrolle: die Spalte ist da
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'usage' and column_name = 'trial_notice';
