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
