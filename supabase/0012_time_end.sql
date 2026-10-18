-- heylivo: Termine mit Endzeit ("24.10.2026, 08:00–10:00"). due_time_end ist leer, wenn es keine gibt;
-- sie gilt nur zusammen mit due_time und liegt danach.
-- Die App ab ?v=48 schreibt diese Spalte mit - deshalb VOR dem Hochladen der App ausführen.
-- Darf mehrfach ausgeführt werden.

alter table public.deadlines
  add column if not exists due_time_end time;

-- Kontrolle: die Spalte ist da
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'deadlines' and column_name = 'due_time_end';
