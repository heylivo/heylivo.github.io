# Mail-Vorlagen für Supabase (heylivo)

Eingetragen in Supabase unter Authentication → Emails → Templates. Jeweils den Betreff („Subject heading“) und den Inhalt („Message body“, Ansicht „Source“) komplett ersetzen, dann speichern.

| Supabase-Vorlage | Betreff | Inhalt | wofür |
|---|---|---|---|
| Change email address | `change-email-address.subject.txt` | `change-email-address.html` | „Konto sichern“: das anonyme Konto bekommt eine E-Mail-Adresse |
| Magic link | `magic-link.subject.txt` | `magic-link.html` | „Anmelden“ auf einem neuen Gerät |

- Beide Mails enthalten nur den 6-stelligen Code (`{{ .Token }}`), keinen Link. Ein Link würde auf dem Handy den Browser statt der installierten App öffnen.
- Die Sprache kommt aus `user_metadata.lang` (`{{ .Data.lang }}`). Die App setzt sie vor jedem Anfordern eines Codes. Fehlt sie, kommt die Mail auf Englisch.
- Der Betreff ist in allen Sprachen gleich („123456 – heylivo“): Supabase lehnt lange Betreffzeilen ab („subject too big“), für zehn Sprachen reicht der Platz nicht.
- Dazu in Supabase: Authentication → Sign In / Providers → „Confirm email“ an, und beim E-Mail-Anbieter „Email OTP Length“ = 6.
