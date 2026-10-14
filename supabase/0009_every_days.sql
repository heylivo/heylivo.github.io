-- heylivo: Wiederholung auch in Tagen (jeden Tag, jede Woche, alle 2 Wochen, eigene Angabe).
-- every_days > 0 heißt "alle N Tage" (Wochen = 7 Tage); sonst gilt wie bisher every_months.
-- Die App ab ?v=22 schreibt diese Spalte mit - deshalb VOR dem Hochladen der App ausführen.
-- Darf mehrfach ausgeführt werden.

alter table public.deadlines
  add column if not exists every_days int not null default 0 check (every_days between 0 and 3650);

-- Kontrolle: die Spalte ist da
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'deadlines' and column_name = 'every_days';
