-- heylivo: freiwillige Notiz zu jeder Frist (bis 500 Zeichen). Leer bei allen bisherigen Fristen.
-- Die Tabelle hat ihre Grants schon (0004): eine neue Spalte braucht keine eigenen.
-- Die App ab ?v=102 schreibt diese Spalte immer mit, deshalb VOR dem Hochladen der App ausführen.
-- Darf mehrfach ausgeführt werden.

alter table public.deadlines
  add column if not exists note text;

alter table public.deadlines drop constraint if exists deadlines_note_check;
alter table public.deadlines
  add constraint deadlines_note_check check (note is null or char_length(note) <= 500);

-- Kontrolle: die Spalte ist da
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'deadlines' and column_name = 'note';
