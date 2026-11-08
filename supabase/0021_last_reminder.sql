-- heylivo: letzte Erinnerung kurz vor Ablauf (send-reminders, lastDays): ab 30 Tagen Vorlauf 7 Tage vorher,
-- ab 3 Tagen Vorlauf 1 Tag vorher. last_notified_for = Fälligkeit, für die sie schon verschickt wurde (wie notified_for).
-- Die Tabelle hat ihre Grants schon (0004): eine neue Spalte braucht keine eigenen.
-- VOR dem Hochladen der Function send-reminders ausführen, sonst schlägt ihre Abfrage fehl.
-- Darf mehrfach ausgeführt werden.

alter table public.deadlines
  add column if not exists last_notified_for date;

-- Kontrolle: die Spalte ist da
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'deadlines' and column_name = 'last_notified_for';
