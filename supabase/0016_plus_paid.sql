-- heylivo: Der Wochenbericht (Edge Function weekly-report) trennt „Livo Plus gekauft“ und „geschenkt“.
-- plans.paid_cents = Betrag der letzten Stripe-Buchung in Cent: 1199 = gekauft, 0 = Gratis-Aktionscode.
-- Der Stripe-Webhook schreibt ihn bei jeder Buchung. Geschenke mit einem Tipp (?gift=, redeem_gift aus 0015)
-- erkennt der Bericht an gift_redemptions, dafür ändert sich hier nichts. Leer = Buchung von vor dieser Spalte.
-- Darf mehrfach ausgeführt werden. Bericht und Webhook laufen auch ohne die Spalte (dann zählt alles als gekauft).

alter table public.plans add column if not exists paid_cents int;

-- Nachtrag für die Buchungen davor: Alle Stripe-Buchungen vom 23.10. (erster Aktionscode) bis 01.11.2026 waren
-- Gratis-Aktionscodes (Inhaber-Mails „Livo Plus per Gratis-Code eingelöst“). Der einzige echte Kauf (16.10.2026,
-- eigener Test) wurde am 23.10. per Test-Aktionscode verlängert und zählt deshalb hier mit.
update public.plans set paid_cents = 0
where paid_cents is null and stripe_session_id is not null
  and updated_at >= '2026-10-23 00:00:00 Europe/Berlin' and updated_at < '2026-11-02 00:00:00 Europe/Berlin';

-- Die API (PostgREST) soll die neue Spalte sofort kennen
notify pgrst, 'reload schema';

-- Kontrolle mit derselben Regel wie der Bericht: Livo Plus läuft - geschenkt (Aktionscode oder Geschenk-Link)
-- oder gekauft; "davon_unbekannt" = ohne Betrag und ohne Geschenk, zählt im Bericht als gekauft
select count(*) filter (where p.paid_cents = 0 or r.user_id is not null) as geschenkt,
       count(*) filter (where coalesce(p.paid_cents, -1) <> 0 and r.user_id is null) as gekauft,
       count(*) filter (where p.paid_cents is null and r.user_id is null) as davon_unbekannt
from public.plans p
left join public.gift_redemptions r on r.user_id = p.user_id and r.plus_until = p.plus_until
where p.plus_until >= (now() at time zone 'Europe/Berlin')::date;
