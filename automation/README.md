# Tägliche Instagram-Posts für heylivo

Jeden Tag um 15:00 UTC (`.github/workflows/daily-post.yml`):

1. `get_day_number.py` bestimmt Tag und Sprache: 60 Posts, Deutsch (`content_calendar.csv`) und Englisch (`content_calendar_en.csv`) täglich im Wechsel; im nächsten Durchlauf tauschen die Sprachen, danach von vorn.
2. `render_card.py` füllt `templates/card.html` mit Kategorie, Hook, Sub und Push-Text und macht ein Bild (1080 × 1350).
3. `to_jpeg.py` wandelt es in JPEG um, das Bild wird nach `output/` committet (Instagram braucht eine öffentliche Adresse).
4. `post_instagram.py` veröffentlicht es mit Text aus Hook, Caption, Link-Hinweis und Hashtags.

## Sonderposts mit festem Datum

`specials.csv` (Spalten wie der Plan, dazu `Datum`, `Sprache` und `Link`; Tag-Nummern ab 101) ersetzt an seinem Datum den Post des Plans – Instagram und den Pinterest-Pin derselben Sprache; der Pin der anderen Sprache und der Plan ab dem nächsten Tag laufen normal weiter. `Link` ist das Ziel des Pins. Erster Einsatz: Kfz-Countdown zum 30.11.2026 (Tage 101–105, 02./09./16./23./29.11.), Kurzlink in den Texten: `heylivo.com/kfz` (`/kfz/index.html` leitet auf den Ratgeber weiter). Vorschau: `__preview-reel.html?day=101&t=7.5`, `__preview-cards.html?day=101&pin=1`.

Zweimal im Monat verlängert `refresh-instagram-token.yml` den Instagram-Schlüssel (er gilt nur 60 Tage).

## Secrets im Repo (Settings → Secrets and variables → Actions)

- `INSTAGRAM_USER_ID` – die Instagram-Nutzer-ID von heylivo.app (aus der Meta-App)
- `INSTAGRAM_ACCESS_TOKEN` – der Zugangsschlüssel von heylivo.app (aus der Meta-App)
- `GH_SECRETS_TOKEN` – GitHub-Token (fine-grained) nur für dieses Repo mit „Secrets: Read and write“; damit speichert die Verlängerung den neuen Schlüssel

Ohne die ersten beiden Secrets postet die Automatik nichts.

## Vorschau und Test

- Lokal ohne Python: `__preview-cards.html?day=1&lang=en` (nicht im Repo) über den lokalen Server öffnen.
- Ein bestimmter Tag sofort: Actions → „Daily Instagram post“ → „Run workflow“ → Tag und Sprache (de/en) eintragen.
- Ersten Post-Tag ändern: `START_DATE` in `get_day_number.py`.

## Reels

`render_reel.py` macht aus derselben Zeile ein 8-Sekunden-Video (1080 × 1920, `templates/reel.html`, Bild für Bild aufgenommen, ffmpeg). In `daily-post.yml` steht `DEFAULT_FORMAT` (`image` oder `reel`). Videos gehen über heylivo.com an Instagram (dort als video/mp4), nur die 7 neuesten bleiben im Repo. Test ohne Posten: „Run workflow“ mit format `reel` und post `no`. Lokale Einzelbilder: `__preview-reel.html?day=1&t=3`.

Musik: `music.py` wählt je Tag eins von drei 9-Sekunden-Stücken aus `assets/music/` (Kevin MacLeod, incompetech.com, CC BY 4.0 – siehe `assets/music/CREDITS.md`). Die Lizenz verlangt eine Nennung, deshalb steht unter jedem Reel „🎵 Musik: … von Kevin MacLeod (incompetech.com), CC BY 4.0“.

## Ratgeber-Reels (seit 30.10.2026)

Zusätzlich zum Kalender-Post kommt jeden Tag ein Ratgeber-Reel (`.github/workflows/ratgeber-post.yml`, 06:00 UTC, GitHub startet meist später): eine Frage, drei Fakten und eine Livo-Erinnerung mit Link, Deutsch und Englisch im Wechsel. Der Plan steht in `ratgeber/ratgeber.csv`, eine Zeile pro Datum (Spalten Hook, Sub, T1/F1 … T3/F3, Push, Link, Caption, Hashtags; „Gepostet“ füllt der Bot mit der Media-ID). Gepostet wird immer die neueste fällige Zeile ohne Eintrag in „Gepostet“, ältere übrig gebliebene Zeilen werden „ausgelassen“.

`render_ratgeber.py` füllt `templates/ratgeber.html`, fotografiert die 5 Tafeln einzeln und blendet sie mit ffmpeg zu einem ca. 20-Sekunden-Video über 25-Sekunden-Ausschnitten derselben Musik (`assets/music/long/`, Nennung in der Bildunterschrift). Zu lange Wörter verkleinert die Vorlage selbst, damit nichts rechts in Instagrams Knöpfe ragt. Ohne eigene Ratgeberseite verlinkt eine Folge auf `heylivo.com` bzw. `heylivo.com/en` („Kostenlos testen“). Kurzlinks für die Tafeln: `/fuehrerschein`, `/ausweis`, `/expats` (wie `/kfz`). Lokale Vorschau einer Tafel: die gefüllte Vorlage im Browser mit `?slide=0` … `?slide=4`.

## Pinterest

Jeden Tag um 14:30 UTC macht `.github/workflows/pinterest-pins.yml` mit `make_pins.py` zwei Pins (Deutsch und Englisch, derselbe Tag aus beiden Plänen): die Instagram-Karte im Pinterest-Format 2:3 (1080 × 1620, `templates/pin.css`). Bilder, `items-de/en.json` und die RSS-Feeds liegen in `pinterest/`, die 30 neuesten je Sprache bleiben.

Pinterest liest die Feeds selbst („Auto-publish“ im Pinterest-Unternehmenskonto, je Feed eine Pinnwand) – keine Pinterest-API, keine Secrets:
- Deutsch: https://heylivo.com/automation/pinterest/feed-de.xml
- Englisch: https://heylivo.com/automation/pinterest/feed-en.xml

Jeder Pin verlinkt mit `?pin=<sprache>-<datum>` auf die Startseite – Pins zu Ausweis, TÜV und Kfz-Versicherung auf den passenden Ratgeber, englische Pins zu Deutschland-Themen auf `/en/deadlines-germany/` (`GUIDES` in `make_pins.py`, Stichwort am Wortanfang im Hook; Begrüßungs- und Anleitungs-Pins bleiben auf der Startseite). Ein Pin pro Sprache und Tag: Läuft die Automatik am selben Tag noch einmal, bleibt der Feed unverändert (sonst legt Pinterest womöglich ein Doppel an; `make_pins.py <tag> --force` ersetzt ihn trotzdem). Test: Actions → „Daily Pinterest pins“ → „Run workflow“ (optional Tag). Lokale Vorschau: `__preview-cards.html?day=1&lang=de&pin=1`.
