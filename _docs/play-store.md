# heylivo im Google Play Store

Stand: 11.11.2026. Ordner mit `_` veröffentlicht Jekyll nicht – diese Notiz steht nur im Repo, nicht auf heylivo.com.
Keine Geheimnisse hier eintragen (Repo ist öffentlich): keine Passwörter, keine Gutschein-Codes.

## Android-App (Trusted Web Activity)

| | |
|---|---|
| Gebaut mit | PWABuilder (pwabuilder.com → Package for stores → Google Play) |
| Package ID | `com.heylivo.reminders` (nie mehr änderbar). **Nicht** `com.heylivo.app`: den hatte die fremde App „LIVO – Live Stream“ (APKPure), Google vergibt Namen nie zweimal |
| Host / Start-URL | `heylivo.com` / `/app/?von=play` |
| Version | `1.0.0.0`, Version code `1` – jedes Update braucht einen höheren Version code |
| Notification delegation | an (Erinnerungen als Android-Benachrichtigung) |
| Fallback | Custom Tabs |
| Signierschlüssel | `signing.keystore` + `signing-key-info.txt` privat gesichert, **nie ins Repo** |

- `.well-known/assetlinks.json` enthält den Fingerabdruck des Upload-Schlüssels. `_config.yml` sorgt dafür,
  dass Jekyll `.well-known` veröffentlicht (seit 11.11. für `com.heylivo.reminders`).
- `app/app.js` (`PLAY`) und `ref.js`: In der Play-App gibt es keinen Stripe-Kauf und keinen „Verlängern“-Link
  (Zahlungsrichtlinie von Google Play). Erkennung über `?von=play` bzw. `android-app://com.heylivo.*`,
  gilt pro Tab – auch wenn ein heylivo.com-Link die App auf einer anderen Seite öffnet. Auf einem Samsung A21s getestet.
  Außerdem führen in der Play-App Logo und „← Startseite“ nicht zur Website (dort stehen Preis und Stripe-Kauf).
- Paket + Schlüssel (`heylivo.aab`, `heylivo.apk`, `signing.keystore`, `signing-key-info.txt`, `source/`):
  ZIP im privaten Google Drive unter „heylivo“. Am Rechner nach `C:\Projekte\heylivo-android` entpacken –
  neben das Repo, nie hinein. Tester-Liste (Gmail-Adressen) ebenfalls nur privat, nie ins Repo.
- FAQ „Wo kann ich heylivo herunterladen?“ (DE/EN): Google zeigte bei „heylivo download“ APKs der fremden LIVO-App.
  Nach dem Start im Play Store dort den Store-Link ergänzen.
- Direkt installierte APK: Play Protect warnt („Trotzdem installieren“). Vor der Installation aus dem
  Play Store deinstallieren – Google signiert die Store-Version mit einem eigenen Schlüssel.

## Weg in den Store

Neues **privates** Entwicklerkonto → Pflicht: geschlossener Test mit mindestens 12 Testern, 14 Tage am Stück,
danach Produktionszugang beantragen. (Organisationskonto erst mit angemeldetem Gewerbe + D-U-N-S-Nummer;
Apps lassen sich später übertragen.) Keine bezahlten Tester-Dienste.

## Tester

- Aufruf am 11.11. auf Facebook und Instagram (angepinnt), DE und EN. Tester schicken ihre Gmail-Adresse per DM.
- Kandidaten auch: Teilnehmer der Gratis-Aktion (ManyChat-Kontakte) – von Hand in der Instagram-App anschreiben.
- Dankeschön: 1 Jahr Livo Plus über einen eigenen Gutschein-Link `heylivo.com/app/?gift=<Code>`, erst **nach**
  den 14 Tagen per DM. Der Code steht in Supabase:
  `select code, max_uses, valid_until from public.gift_codes where code like 'TESTER%';`
  Wer schon Plus hat, bekommt ein Jahr dazu (`redeem_gift` verlängert ab dem alten Ende).
- ManyChat reagiert nur auf FRIST/DEADLINE, die Standardantwort ist gestoppt.

## Offen

- [x] PWABuilder neu gebaut mit `com.heylivo.reminders`, Fingerabdruck in `assetlinks.json` (11.11.)
- [ ] 20–25 Tester-Adressen sammeln
- [ ] Play-Console-Konto anlegen (privat, 25 $, Identitätsprüfung)
- [ ] App anlegen, `heylivo.aab` in den geschlossenen Test laden, Tester eintragen, Einladungslink verschicken
- [ ] Fingerabdruck der Google-App-Signatur (Play Console → App-Integrität → App-Signatur, SHA-256)
      zusätzlich in `.well-known/assetlinks.json` eintragen
- [ ] Store-Eintrag (DE/EN), Formular „Datensicherheit“, Screenshots
- [ ] Nach 14 Tagen: Tester-Link verschicken, Produktionszugang beantragen
- [ ] Später: Livo Plus in der Android-App über Google Play Billing (oder EU-Alternativen) verkaufen
- [ ] Später: Monochrom-Icon für die Statusleiste (PWABuilder „Monochrome icon URL“)
