# Tägliche Instagram-Posts für heylivo

Jeden Tag um 15:00 UTC (`.github/workflows/daily-post.yml`):

1. `get_day_number.py` bestimmt Tag und Sprache: 60 Posts, Deutsch (`content_calendar.csv`) und Englisch (`content_calendar_en.csv`) täglich im Wechsel; im nächsten Durchlauf tauschen die Sprachen, danach von vorn.
2. `render_card.py` füllt `templates/card.html` mit Kategorie, Hook, Sub und Push-Text und macht ein Bild (1080 × 1350).
3. `to_jpeg.py` wandelt es in JPEG um, das Bild wird nach `output/` committet (Instagram braucht eine öffentliche Adresse).
4. `post_instagram.py` veröffentlicht es mit Text aus Hook, Caption, Link-Hinweis und Hashtags.

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

## Pinterest

Jeden Tag um 14:30 UTC macht `.github/workflows/pinterest-pins.yml` mit `make_pins.py` zwei Pins (Deutsch und Englisch, derselbe Tag aus beiden Plänen): die Instagram-Karte im Pinterest-Format 2:3 (1080 × 1620, `templates/pin.css`). Bilder, `items-de/en.json` und die RSS-Feeds liegen in `pinterest/`, die 30 neuesten je Sprache bleiben.

Pinterest liest die Feeds selbst („Auto-publish“ im Pinterest-Unternehmenskonto, je Feed eine Pinnwand) – keine Pinterest-API, keine Secrets:
- Deutsch: https://heylivo.com/automation/pinterest/feed-de.xml
- Englisch: https://heylivo.com/automation/pinterest/feed-en.xml

Jeder Pin verlinkt auf die Startseite mit `?pin=<sprache>-<datum>`. Test: Actions → „Daily Pinterest pins“ → „Run workflow“ (optional Tag). Lokale Vorschau: `__preview-cards.html?day=1&lang=de&pin=1`.
