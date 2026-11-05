-- heylivo: Zeitraum von–bis (Vorlage "Urlaubstage": "22.12.2026 – 02.01.2027"). due ist der erste Tag,
-- due_end der letzte; leer bei allen anderen Fristen. Die Tabelle hat ihre Grants schon (0004) - eine neue
-- Spalte braucht keine eigenen.
-- Die App ab ?v=90 schreibt diese Spalte bei Urlaubstagen mit - deshalb VOR dem Hochladen der App ausführen.
-- Darf mehrfach ausgeführt werden.

alter table public.deadlines
  add column if not exists due_end date;

alter table public.deadlines drop constraint if exists deadlines_due_end_check;
alter table public.deadlines
  add constraint deadlines_due_end_check check (due_end is null or due_end >= due);

-- Kontrolle: die Spalte ist da
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'deadlines' and column_name = 'due_end';
