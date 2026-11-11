# heylivo – Werbung, Botschaft und Messung

Stand: 11.11.2026. Ordner mit `_` veröffentlicht Jekyll nicht – diese Notiz steht nur im Repo, nicht auf heylivo.com.
Keine Geheimnisse hier eintragen (Repo ist öffentlich).

## Was die Zahlen am 11.11. gezeigt haben

Supabase SQL-Editor, Herkunft = `auth.users.raw_user_meta_data->>'src'` (setzt `ref.js` beim ersten Öffnen):

| Herkunft | Konten | mit Frist |
|---|---|---|
| direkt | 113 | 12 (teils eigene Test-Konten) |
| fbwerbung + fbwerbung2 + facebook (Gratis-Werbung, Gratis-Beitrag) | ~104 | **0** |
| google | 3 | 0 |

- Nur 3 von ~100 Werbe-Besuchern haben das Gratis-Jahr (HEYLIVO25) eingelöst – ein einziger Tipp.
- ~⅔ kamen im Browser von Facebook/Instagram (dort keine Erinnerungen, keine Spracheingabe), ~11 waren Bots.
- Schluss: Fremde verstehen in den ersten Sekunden nicht, wofür heylivo gut ist. „Gratis Livo Plus“ zieht
  Schnäppchenjäger an; für die erste Frist braucht man ein Datum, das man gerade nicht zur Hand hat.

## Was seitdem geändert ist (live)

- Geschenk-Link (`?gift=`): Wer noch keine Frist hat, sieht „1 Jahr Livo Plus wartet auf dich“ →
  „Erste Frist eintragen“; nach der ersten Frist wird das Geschenk automatisch eingelöst.
  „Ohne Frist einlösen“ bleibt (Teilnahmebedingungen). Facebook/Instagram-Browser auf Android: erst „In Chrome öffnen“.
  Ansehen ohne echte Einlösung: `/app/?demo=1&empty=1&gift=GIFTTEST` (bzw. `&inapp=android`).
- Messung: Der Knopf „In Chrome öffnen“ nimmt `?von=` mit; `my.many.chat` zählt als instagram;
  Links aus Android-Apps zählen als facebook / instagram / whatsapp / gmail.
- Noch nicht gebaut (Idee): „Datum gerade nicht zur Hand? Erinnere mich heute 19:00 ans Nachschauen.“

## Botschafts-Test A gegen B (kostenlos, ab 11.11.)

Hauptbotschaft soll der Alltag + Sprache werden („Elternabend, Zahnarzt …“), Dokumente bleiben Zusatz.
Nie „kostenlos“ schreiben – richtig ist „30 Tage kostenlos testen“.
Bilder: `automation/werbung/werbung-a-alltag.png`, `automation/werbung/werbung-b-ausweis.png` (4:5).

**A – Alltag + Sprache** (gepostet 11.11.: Instagram-Beitrag + Story mit Link-Sticker, Facebook-Seite)
```text
Elternabend, Zahnarzt, Geburtstag – einfach sagen, heylivo erinnert dich. 🎙️

„Hey Livo, Elternabend am Dienstag um 19 Uhr.“ Livo versteht Tag, Uhrzeit und worum es geht – und meldet sich rechtzeitig auf deinem Handy. Teilen mit der Familie? Ein Tipp, per WhatsApp.

Und an Ausweis, TÜV & Co. denkt Livo auch.
30 Tage kostenlos testen, ohne Anmeldung.
```
Links (öffnen direkt „Habe ich das richtig verstanden? – Elternabend, Dienstag, 19:00“, klappt auch ohne Mikrofon):
- Instagram-Story: `https://heylivo.com/app/?say=Elternabend%20am%20Dienstag%20um%2019%20Uhr&von=alltag-ig`
- Facebook-Seite: `https://heylivo.com/app/?say=Elternabend%20am%20Dienstag%20um%2019%20Uhr&von=alltag-fb`

**B – Ausweis** (geplant ~13.11., gleich wie A)
```text
Weißt du, wann dein Personalausweis abläuft? 🪪

Die meisten merken es erst, wenn sie ihn brauchen – am Flughafen, bei der Bank oder beim Amt.

heylivo erinnert dich 3 Monate vorher – genug Zeit für einen Termin beim Bürgeramt. Genauso bei Reisepass, Führerschein, TÜV und Versicherungen.

30 Tage kostenlos testen, ohne Anmeldung.
```
Links (öffnen direkt das Formular „Personalausweis“):
- Instagram-Story: `https://heylivo.com/app/?show=form:personalausweis&von=ausweis-ig`
- Facebook-Seite: `https://heylivo.com/app/?show=form:personalausweis&von=ausweis-fb`

Instagram: In der Bildunterschrift sind Links nicht anklickbar („👉 Link in der Story“), Story-Link-Sticker
geht nur in der App am Handy. Facebook: Seiten-Beitrag, nicht über das private Profil teilen (Wunsch).
Instagram hat nur ~5 Follower, die Facebook-Seite 0 – kostenlos kommen also nur wenige Besucher.

**Auswertung nach ~1 Woche** (eigene Test-Klicks abziehen):
```sql
select u.raw_user_meta_data->>'src' as herkunft, count(*) as konten,
  count(*) filter (where exists (select 1 from public.deadlines d where d.user_id = u.id)) as mit_frist
from auth.users u
where u.raw_user_meta_data->>'src' like 'alltag-%' or u.raw_user_meta_data->>'src' like 'ausweis-%'
group by 1 order by 1;
```

**Wenn die Zahlen zu klein sind:** bezahlter Test im Werbeanzeigenmanager (nicht „Boost“): Ziel Traffic,
Advantage-Kampagnenbudget aus, zwei Anzeigengruppen à 3 €/Tag, 4 Tage, Deutschland 25–55,
Links mit `von=fballtag` / `von=fbausweis`.

## Allgemeine Abfrage: Fristen je Herkunft
```sql
select coalesce(nullif(u.raw_user_meta_data->>'src', ''), 'direkt') as herkunft, count(*) as konten,
  count(*) filter (where exists (select 1 from public.deadlines d where d.user_id = u.id)) as mit_frist
from auth.users u group by 1 order by 2 desc;
```
