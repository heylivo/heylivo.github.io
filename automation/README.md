# Tägliche Instagram-Posts für heylivo

Jeden Tag um 15:00 UTC (`.github/workflows/daily-post.yml`):

1. `get_day_number.py` bestimmt den Tag im Plan (`content_calendar.csv`, 60 Posts, danach von vorn).
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

- Lokal ohne Python: `__preview-cards.html?day=1` (nicht im Repo) über den lokalen Server öffnen.
- Ein bestimmter Tag sofort: Actions → „Daily Instagram post“ → „Run workflow“ → Tag eintragen.
- Ersten Post-Tag ändern: `START_DATE` in `get_day_number.py`.
