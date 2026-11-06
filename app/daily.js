// heylivo: "Frage des Tages" statt "Schon gewusst?": jeden Tag eine kurze Frage, damit die App täglich etwas zu bieten hat
// und die Liste von selbst wächst. Vier Arten: Vorlage (Titel + Tipp aus templates.js), Jahreszeit (months), Ratgeber, Quiz.
// "Eintragen" öffnet die passende Vorlage. Eine Frage gibt es nur in Sprachen mit Text in DAY_TEXT: Regeln, die nur in
// Deutschland gelten, stehen deshalb nur bei de und en (Zugezogene in Deutschland), Vorlagen mit only: "de" nur bei de.
// Der Stand liegt nur in diesem Browser (localStorage livo.day); bereits eingetragene Vorlagen werden nie mehr gefragt.
// Zum Ansehen: ?demo=1&day=<id>, z. B. q-ausweis, t-reisepass, s-reifen.

var DAY_TPLS = ["personalausweis", "reisepass", "tuev", "zahnarzt", "handy", "versicherung", "geburtstag", "fuehrerschein", "abo", "checkup", "strom",
  "inspektion", "tetanus", "hochzeitstag", "kfzversicherung", "steuer", "reifen", "kinderpass", "kinderarzt", "schule", "aufenthaltstitel", "elterngeld",
  "reiseversicherung", "urlaubstage"];
// Vorlagen, die man mehrfach anlegt: ein vorhandener Eintrag sagt nichts über die Frage
var DAY_MULTI = { eigene: 1, behoerde: 1 };
var DAY_EXTRA = [
  { id: "s-reifen", kind: "s", tpl: "reifen", months: [10, 11] },
  { id: "s-reifen2", kind: "s", tpl: "reifen", months: [3, 4] },
  { id: "s-kfz", kind: "s", tpl: "kfzversicherung", months: [10, 11] },
  { id: "s-steuer", kind: "s", tpl: "steuer", months: [2, 3, 4, 5] },
  { id: "s-zahnarzt", kind: "s", tpl: "zahnarzt", months: [10, 11, 12] },
  { id: "s-urlaub", kind: "s", tpl: "urlaubstage", months: [1, 2] },
  { id: "s-sommer", kind: "s", tpl: "reisepass", months: [4, 5, 6] },
  { id: "r-probeabo", kind: "r", tpl: "abo" },
  { id: "r-handy", kind: "r", tpl: "handy" },
  { id: "r-fuehrerschein", kind: "r", tpl: "fuehrerschein", until: "2027-01-19" },
  { id: "r-gewaehr", kind: "r", tpl: "eigene" },
  { id: "r-rueckgabe", kind: "r", tpl: "eigene" },
  { id: "r-anmeldung", kind: "r", tpl: "behoerde" },
  { id: "q-pass", kind: "q", tpl: "reisepass", right: 1 },
  { id: "q-tetanus", kind: "q", tpl: "tetanus", right: 1 },
  { id: "q-impfung", kind: "q", tpl: "reiseimpfung", right: 1 },
  { id: "q-checkin", kind: "q", tpl: "checkin", right: 0 },
  { id: "q-kindpass", kind: "q", tpl: "kinderpass", right: 0 },
  { id: "q-ausland", kind: "q", tpl: "reiseversicherung", right: 1 },
  { id: "q-ausweis", kind: "q", tpl: "personalausweis", right: 1 },
  { id: "q-tuev", kind: "q", tpl: "tuev", right: 1 },
  { id: "q-fuehrerschein", kind: "q", tpl: "fuehrerschein", right: 1 },
  { id: "q-bonus", kind: "q", tpl: "zahnarzt", right: 0 },
  { id: "q-checkup", kind: "q", tpl: "checkup", right: 0 },
  { id: "q-anmeldung", kind: "q", tpl: "behoerde", right: 0 },
  { id: "q-widerruf", kind: "q", tpl: "eigene", right: 0 },
  { id: "q-steuer", kind: "q", tpl: "steuer", right: 0 },
  { id: "q-elterngeld", kind: "q", tpl: "elterngeld", right: 0 }
];

// q = Frage, h = Tipp (Jahreszeit, Ratgeber); Quiz: o = zwei Antworten, a = Auflösung, ask = Frage zum Eintragen
// t-<Vorlage> mit h: eigener Tipp für die Karte, wenn der Tipp der Vorlage ein Datumsfeld voraussetzt ("bis zu diesem Tag")
var DAY_TEXT = {
  de: {
    "t-versicherung": { h: "Die Kündigung muss rechtzeitig beim Versicherer ankommen. Sonst verlängert sich der Vertrag meist um ein Jahr." },
    "s-reifen": { q: "Schon Winterreifen drauf?", h: "Faustregel „von O bis O“: Winterreifen von Oktober bis Ostern." },
    "s-reifen2": { q: "Schon an die Sommerreifen gedacht?", h: "Faustregel „von O bis O“: Ab Ostern können die Winterreifen wieder runter." },
    "s-kfz": { q: "Läuft deine Kfz-Versicherung zum Jahresende?", h: "Dann muss die Kündigung bis 30.11. beim Versicherer sein. Ob das für dich gilt, steht im Versicherungsschein." },
    "s-steuer": { q: "Steuererklärung schon auf dem Plan?", h: "Ohne Steuerberater gilt in der Regel der 31. Juli des Folgejahres." },
    "s-zahnarzt": { q: "Dieses Jahr schon beim Zahnarzt?", h: "Für das Bonusheft zählt bei Erwachsenen eine Kontrolle pro Kalenderjahr." },
    "s-urlaub": { q: "Urlaub fürs neue Jahr schon geplant?", h: "Trag deine Urlaubstage ein – Livo zählt die Arbeitstage und erinnert dich." },
    "s-sommer": { q: "Sommerurlaub geplant? Ist dein Pass noch gültig?", h: "Viele Länder verlangen bei der Einreise noch mindestens 6 Monate Gültigkeit." },
    "r-probeabo": { q: "Läuft bei dir gerade ein Probeabo?", h: "Viele verlängern sich von selbst. Trag ein, bis wann du kündigen musst, bevor es etwas kostet." },
    "r-handy": { q: "Weißt du, wann dein Handyvertrag endet?", h: "Wer den Termin kennt, kann rechtzeitig vergleichen und kündigen." },
    "r-fuehrerschein": { q: "Muss dein Führerschein umgetauscht werden?", h: "Nächste Frist: 19.01.2027 für Karten, die 2002 bis 2004 ausgestellt wurden (Feld 4a)." },
    "r-gewaehr": { q: "Gerät gekauft? Bis wann hast du Gewährleistung?", h: "Beim Neukauf gelten in der Regel 2 Jahre. Trag das Ende ein, dann verpasst du es nicht." },
    "r-rueckgabe": { q: "Online bestellt und es passt nicht?", h: "Meist hast du 14 Tage zum Widerrufen. Trag das Datum ein, dann bleibt genug Zeit." },
    "r-anmeldung": { q: "Frisch umgezogen?", h: "Die Anmeldung beim Amt ist in der Regel innerhalb von 2 Wochen fällig." },
    "q-pass": { q: "Wie lange sollte dein Reisepass bei vielen Reisezielen noch gültig sein?", o: ["3 Monate", "6 Monate"], a: "Viele Länder verlangen bei der Einreise noch mindestens 6 Monate.", ask: "Wann läuft deiner ab?" },
    "q-tetanus": { q: "Wie oft wird die Tetanus-Impfung in der Regel aufgefrischt?", o: ["Alle 5 Jahre", "Alle 10 Jahre"], a: "In der Regel alle 10 Jahre.", ask: "Wann war deine letzte?" },
    "q-impfung": { q: "Wann solltest du dich vor einer Fernreise wegen Impfungen beraten lassen?", o: ["1 Woche vorher", "6–8 Wochen vorher"], a: "Am besten 6 bis 8 Wochen vorher, manche Impfungen brauchen mehrere Termine.", ask: "Steht bei dir eine Reise an?" },
    "q-checkin": { q: "Wann öffnet bei vielen Airlines der Online-Check-in?", o: ["24–48 Stunden vorher", "2 Wochen vorher"], a: "Meist 24 bis 48 Stunden vor Abflug.", ask: "Fliegst du bald?" },
    "q-kindpass": { q: "Brauchen Kinder für Reisen ein eigenes Dokument?", o: ["Ja", "Nein"], a: "Ja, Kinder brauchen für Reisen ein eigenes Dokument.", ask: "Wann läuft es bei deinem Kind ab?" },
    "q-ausland": { q: "Zahlt die normale Krankenversicherung im Ausland immer alles?", o: ["Ja", "Nein"], a: "Nein, oft nur einen Teil oder gar nichts, zum Beispiel keinen Rücktransport.", ask: "Steht bei dir eine Reise an?" },
    "q-ausweis": { q: "Wie lange gilt der Personalausweis ab 24 Jahren?", o: ["6 Jahre", "10 Jahre"], a: "Ab 24 Jahren gilt er 10 Jahre, darunter 6 Jahre.", ask: "Wann läuft deiner ab?" },
    "q-tuev": { q: "Wann muss ein Neuwagen zum ersten Mal zur Hauptuntersuchung?", o: ["Nach 2 Jahren", "Nach 3 Jahren"], a: "Nach 3 Jahren, danach in der Regel alle 2 Jahre.", ask: "Wann ist dein Auto dran?" },
    "q-fuehrerschein": { q: "Wie lange gilt der EU-Kartenführerschein?", o: ["10 Jahre", "15 Jahre"], a: "Das Dokument gilt 15 Jahre, das Datum steht in Feld 4b.", ask: "Wann läuft deiner ab?" },
    "q-bonus": { q: "Wie oft musst du als Erwachsener zum Zahnarzt, damit das Bonusheft zählt?", o: ["Einmal im Jahr", "Alle 2 Jahre"], a: "Eine Kontrolle pro Kalenderjahr reicht.", ask: "Wann warst du zuletzt da?" },
    "q-checkup": { q: "Ab welchem Alter zahlt die Krankenkasse den Check-up alle 3 Jahre?", o: ["Ab 35", "Ab 50"], a: "Ab 35 Jahren alle 3 Jahre.", ask: "Wann war dein letzter?" },
    "q-anmeldung": { q: "Wie lange hast du in Deutschland nach einem Umzug Zeit für die Anmeldung?", o: ["2 Wochen", "2 Monate"], a: "In der Regel 2 Wochen.", ask: "Steht bei dir ein Termin beim Amt an?" },
    "q-widerruf": { q: "Wie lange kannst du Online-Bestellungen in der Regel widerrufen?", o: ["14 Tage", "30 Tage"], a: "In der Regel 14 Tage.", ask: "Hast du gerade etwas bestellt?" },
    "q-steuer": { q: "Bis wann muss die Steuererklärung ohne Steuerberater in der Regel abgegeben werden?", o: ["31. Juli des Folgejahres", "31. Dezember"], a: "In der Regel bis 31. Juli des Folgejahres, wenn du abgeben musst.", ask: "Ist sie bei dir eingeplant?" },
    "q-elterngeld": { q: "Für wie viele Monate rückwirkend gibt es Elterngeld?", o: ["3 Monate", "12 Monate"], a: "Nur für die letzten 3 Lebensmonate vor dem Antrag.", ask: "Erwartet ihr ein Kind?" }
  },
  en: {
    "t-versicherung": { h: "Your cancellation has to reach the insurer in time. Otherwise the policy usually renews for another year." },
    "s-zahnarzt": { q: "Been to the dentist this year?", h: "For the German Bonusheft, adults need one check-up per calendar year." },
    "s-urlaub": { q: "Planned your days off for the new year?", h: "Add your days off – Livo counts the working days and reminds you." },
    "s-sommer": { q: "Summer trip planned? Is your passport still valid?", h: "Many countries require at least 6 months of validity on entry." },
    "r-probeabo": { q: "Are you on a free trial right now?", h: "Many renew by themselves. Add the date you need to cancel by, before it costs you." },
    "r-handy": { q: "Do you know when your phone contract ends?", h: "If you know the date, you can compare and cancel in time." },
    "r-fuehrerschein": { q: "Does your German driving licence need replacing?", h: "Next deadline: 19 Jan 2027 for cards issued from 2002 to 2004 (field 4a)." },
    "r-gewaehr": { q: "Bought a device? When does your statutory warranty end?", h: "New purchases usually have 2 years. Add the end date so you don't miss it." },
    "r-rueckgabe": { q: "Ordered online and it doesn't fit?", h: "You usually have 14 days to withdraw. Add the date so there's time left." },
    "r-anmeldung": { q: "Just moved?", h: "In Germany you usually have to register your address (Anmeldung) within 2 weeks." },
    "q-pass": { q: "How long should your passport still be valid for many destinations?", o: ["3 months", "6 months"], a: "Many countries require at least 6 months on entry.", ask: "When does yours expire?" },
    "q-tetanus": { q: "How often is a tetanus booster usually needed?", o: ["Every 5 years", "Every 10 years"], a: "Usually every 10 years.", ask: "When was your last one?" },
    "q-impfung": { q: "When should you get vaccination advice before a long-distance trip?", o: ["1 week before", "6–8 weeks before"], a: "Ideally 6 to 8 weeks before, as some vaccines need several appointments.", ask: "Have you got a trip coming up?" },
    "q-checkin": { q: "When does online check-in open at many airlines?", o: ["24–48 hours before", "2 weeks before"], a: "Usually 24 to 48 hours before departure.", ask: "Flying soon?" },
    "q-kindpass": { q: "Do children need their own travel document?", o: ["Yes", "No"], a: "Yes, children need their own document to travel.", ask: "When does your child's expire?" },
    "q-ausland": { q: "Does your regular health cover always pay everything abroad?", o: ["Yes", "No"], a: "No, often only part of it or nothing, for example no repatriation.", ask: "Have you got a trip coming up?" },
    "q-ausweis": { q: "How long is a German ID card valid from age 24?", o: ["6 years", "10 years"], a: "From age 24 it's valid for 10 years, under 24 for 6 years.", ask: "When does yours expire?" },
    "q-tuev": { q: "When does a new car in Germany need its first inspection (TÜV)?", o: ["After 2 years", "After 3 years"], a: "After 3 years, then usually every 2 years.", ask: "When is your car due?" },
    "q-fuehrerschein": { q: "How long is the EU card driving licence valid in Germany?", o: ["10 years", "15 years"], a: "The document is valid for 15 years, the date is in field 4b.", ask: "When does yours expire?" },
    "q-bonus": { q: "How often must adults see the dentist for the German Bonusheft to count?", o: ["Once a year", "Every 2 years"], a: "One check-up per calendar year is enough.", ask: "When did you last go?" },
    "q-checkup": { q: "From what age does German health insurance pay a check-up every 3 years?", o: ["From 35", "From 50"], a: "From age 35, every 3 years.", ask: "When was your last one?" },
    "q-anmeldung": { q: "How long do you have to register your address after moving in Germany?", o: ["2 weeks", "2 months"], a: "Usually 2 weeks.", ask: "Have you got an appointment coming up?" },
    "q-widerruf": { q: "How long can you usually withdraw from online orders?", o: ["14 days", "30 days"], a: "Usually 14 days.", ask: "Just ordered something?" }
  },
  it: {
    "t-versicherung": { h: "La disdetta deve arrivare all'assicurazione in tempo. Altrimenti di solito il contratto si rinnova per un anno." },
    "s-urlaub": { q: "Hai già pianificato le ferie per il nuovo anno?", h: "Inserisci i giorni di ferie: Livo conta i giorni lavorativi e te lo ricorda." },
    "s-sommer": { q: "Vacanze estive in vista? Il passaporto è ancora valido?", h: "Molti Paesi richiedono almeno 6 mesi di validità all'ingresso." },
    "r-probeabo": { q: "Hai una prova gratuita in corso?", h: "Molte si rinnovano da sole. Inserisci entro quando disdire, prima che costi." },
    "r-handy": { q: "Sai quando scade il tuo contratto telefonico?", h: "Se conosci la data, puoi confrontare e disdire in tempo." },
    "q-pass": { q: "Quanto deve essere ancora valido il passaporto per molte destinazioni?", o: ["3 mesi", "6 mesi"], a: "Molti Paesi richiedono almeno 6 mesi all'ingresso.", ask: "Quando scade il tuo?" },
    "q-tetanus": { q: "Ogni quanto si fa di solito il richiamo del tetano?", o: ["Ogni 5 anni", "Ogni 10 anni"], a: "Di solito ogni 10 anni.", ask: "Quando hai fatto l'ultimo?" },
    "q-impfung": { q: "Quando chiedere consiglio sui vaccini prima di un viaggio lontano?", o: ["1 settimana prima", "6–8 settimane prima"], a: "Meglio 6-8 settimane prima: alcuni vaccini richiedono più appuntamenti.", ask: "Hai un viaggio in programma?" },
    "q-checkin": { q: "Quando apre il check-in online di molte compagnie aeree?", o: ["24–48 ore prima", "2 settimane prima"], a: "Di solito 24-48 ore prima della partenza.", ask: "Parti presto?" },
    "q-kindpass": { q: "I bambini hanno bisogno di un proprio documento per viaggiare?", o: ["Sì", "No"], a: "Sì, i bambini hanno bisogno di un proprio documento.", ask: "Quando scade quello di tuo figlio?" },
    "q-ausland": { q: "L'assistenza sanitaria pubblica paga sempre tutto all'estero?", o: ["Sì", "No"], a: "No, spesso solo una parte o niente, ad esempio non il rimpatrio.", ask: "Hai un viaggio in programma?" }
  },
  el: {
    "t-versicherung": { h: "Η καταγγελία πρέπει να φτάσει έγκαιρα στην ασφαλιστική. Αλλιώς το συμβόλαιο συνήθως ανανεώνεται για έναν χρόνο." },
    "s-urlaub": { q: "Έχεις ήδη σχεδιάσει την άδειά σου για τη νέα χρονιά;", h: "Πρόσθεσε τις ημέρες άδειας – το Livo μετράει τις εργάσιμες και σου το θυμίζει." },
    "s-sommer": { q: "Καλοκαιρινό ταξίδι; Ισχύει ακόμα το διαβατήριό σου;", h: "Πολλές χώρες ζητούν ισχύ τουλάχιστον 6 μηνών κατά την είσοδο." },
    "r-probeabo": { q: "Έχεις αυτή τη στιγμή δωρεάν δοκιμή;", h: "Πολλές ανανεώνονται μόνες τους. Γράψε έως πότε πρέπει να την ακυρώσεις, πριν σου κοστίσει." },
    "r-handy": { q: "Ξέρεις πότε λήγει το συμβόλαιο του κινητού σου;", h: "Αν ξέρεις την ημερομηνία, μπορείς να συγκρίνεις και να ακυρώσεις έγκαιρα." },
    "q-pass": { q: "Πόσο πρέπει να ισχύει ακόμα το διαβατήριο για πολλούς προορισμούς;", o: ["3 μήνες", "6 μήνες"], a: "Πολλές χώρες ζητούν τουλάχιστον 6 μήνες κατά την είσοδο.", ask: "Πότε λήγει το δικό σου;" },
    "q-tetanus": { q: "Κάθε πότε γίνεται συνήθως η αναμνηστική δόση για τον τέτανο;", o: ["Κάθε 5 χρόνια", "Κάθε 10 χρόνια"], a: "Συνήθως κάθε 10 χρόνια.", ask: "Πότε έκανες την τελευταία;" },
    "q-impfung": { q: "Πότε να ζητήσεις συμβουλή για εμβόλια πριν από ένα μακρινό ταξίδι;", o: ["1 εβδομάδα πριν", "6–8 εβδομάδες πριν"], a: "Καλύτερα 6 έως 8 εβδομάδες πριν, κάποια εμβόλια θέλουν πολλά ραντεβού.", ask: "Έχεις κάποιο ταξίδι μπροστά σου;" },
    "q-checkin": { q: "Πότε ανοίγει σε πολλές αεροπορικές το online check-in;", o: ["24–48 ώρες πριν", "2 εβδομάδες πριν"], a: "Συνήθως 24 έως 48 ώρες πριν από την πτήση.", ask: "Πετάς σύντομα;" },
    "q-kindpass": { q: "Χρειάζονται τα παιδιά δικό τους έγγραφο για ταξίδια;", o: ["Ναι", "Όχι"], a: "Ναι, τα παιδιά χρειάζονται δικό τους έγγραφο.", ask: "Πότε λήγει του παιδιού σου;" },
    "q-ausland": { q: "Πληρώνει πάντα τα πάντα η δημόσια ασφάλιση στο εξωτερικό;", o: ["Ναι", "Όχι"], a: "Όχι, συχνά μόνο ένα μέρος ή τίποτα, για παράδειγμα όχι τον επαναπατρισμό.", ask: "Έχεις κάποιο ταξίδι μπροστά σου;" }
  },
  es: {
    "t-versicherung": { h: "Tu baja tiene que llegar a tiempo a la aseguradora. Si no, la póliza suele renovarse un año más." },
    "s-urlaub": { q: "¿Ya has planificado tus vacaciones del nuevo año?", h: "Añade tus días de vacaciones: Livo cuenta los días laborables y te lo recuerda." },
    "s-sommer": { q: "¿Viaje de verano? ¿Tu pasaporte sigue siendo válido?", h: "Muchos países exigen al menos 6 meses de validez al entrar." },
    "r-probeabo": { q: "¿Tienes ahora una prueba gratuita?", h: "Muchas se renuevan solas. Añade hasta cuándo debes cancelarla, antes de que te cueste." },
    "r-handy": { q: "¿Sabes cuándo termina tu contrato de móvil?", h: "Si conoces la fecha, puedes comparar y cancelar a tiempo." },
    "q-pass": { q: "¿Cuánta validez debe tener aún el pasaporte para muchos destinos?", o: ["3 meses", "6 meses"], a: "Muchos países exigen al menos 6 meses al entrar.", ask: "¿Cuándo caduca el tuyo?" },
    "q-tetanus": { q: "¿Cada cuánto se suele poner el refuerzo del tétanos?", o: ["Cada 5 años", "Cada 10 años"], a: "Normalmente cada 10 años.", ask: "¿Cuándo fue el último?" },
    "q-impfung": { q: "¿Cuándo pedir consejo sobre vacunas antes de un viaje lejano?", o: ["1 semana antes", "6–8 semanas antes"], a: "Mejor 6 a 8 semanas antes: algunas vacunas necesitan varias citas.", ask: "¿Tienes un viaje a la vista?" },
    "q-checkin": { q: "¿Cuándo abre el check-in online en muchas aerolíneas?", o: ["24–48 horas antes", "2 semanas antes"], a: "Normalmente 24 a 48 horas antes de la salida.", ask: "¿Vuelas pronto?" },
    "q-kindpass": { q: "¿Necesitan los niños su propio documento para viajar?", o: ["Sí", "No"], a: "Sí, los niños necesitan su propio documento.", ask: "¿Cuándo caduca el de tu hijo?" },
    "q-ausland": { q: "¿La sanidad pública lo paga siempre todo en el extranjero?", o: ["Sí", "No"], a: "No, a menudo solo una parte o nada, por ejemplo la repatriación no.", ask: "¿Tienes un viaje a la vista?" }
  },
  fr: {
    "t-versicherung": { h: "Votre résiliation doit parvenir à temps à l'assureur. Sinon, le contrat est souvent reconduit pour un an." },
    "s-urlaub": { q: "Avez-vous déjà prévu vos congés de la nouvelle année ?", h: "Ajoutez vos jours de congé : Livo compte les jours ouvrés et vous le rappelle." },
    "s-sommer": { q: "Vacances d'été prévues ? Votre passeport est-il encore valable ?", h: "Beaucoup de pays exigent au moins 6 mois de validité à l'entrée." },
    "r-probeabo": { q: "Avez-vous un essai gratuit en cours ?", h: "Beaucoup se renouvellent tout seuls. Ajoutez la date limite pour résilier avant que cela coûte." },
    "r-handy": { q: "Savez-vous quand votre forfait mobile se termine ?", h: "Si vous connaissez la date, vous pouvez comparer et résilier à temps." },
    "q-pass": { q: "Quelle validité restante faut-il au passeport pour beaucoup de destinations ?", o: ["3 mois", "6 mois"], a: "Beaucoup de pays exigent au moins 6 mois à l'entrée.", ask: "Quand expire le vôtre ?" },
    "q-tetanus": { q: "À quelle fréquence fait-on en général le rappel du tétanos ?", o: ["Tous les 5 ans", "Tous les 10 ans"], a: "En général tous les 10 ans.", ask: "À quand remonte le dernier ?" },
    "q-impfung": { q: "Quand demander conseil pour les vaccins avant un long voyage ?", o: ["1 semaine avant", "6–8 semaines avant"], a: "Idéalement 6 à 8 semaines avant : certains vaccins demandent plusieurs rendez-vous.", ask: "Un voyage en vue ?" },
    "q-checkin": { q: "Quand ouvre l'enregistrement en ligne chez beaucoup de compagnies ?", o: ["24–48 heures avant", "2 semaines avant"], a: "En général 24 à 48 heures avant le départ.", ask: "Vous partez bientôt ?" },
    "q-kindpass": { q: "Les enfants ont-ils besoin de leur propre document pour voyager ?", o: ["Oui", "Non"], a: "Oui, les enfants ont besoin de leur propre document.", ask: "Quand expire celui de votre enfant ?" },
    "q-ausland": { q: "L'assurance maladie paie-t-elle toujours tout à l'étranger ?", o: ["Oui", "Non"], a: "Non, souvent seulement une partie ou rien, par exemple pas le rapatriement.", ask: "Un voyage en vue ?" }
  },
  nl: {
    "t-versicherung": { h: "Je opzegging moet op tijd bij de verzekeraar binnen zijn. Anders wordt de polis meestal verlengd." },
    "s-urlaub": { q: "Heb je je vrije dagen voor het nieuwe jaar al gepland?", h: "Voeg je vrije dagen toe: Livo telt de werkdagen en herinnert je eraan." },
    "s-sommer": { q: "Zomervakantie gepland? Is je paspoort nog geldig?", h: "Veel landen eisen bij binnenkomst nog minstens 6 maanden geldigheid." },
    "r-probeabo": { q: "Loopt er bij jou nu een gratis proefperiode?", h: "Veel worden vanzelf verlengd. Voeg toe wanneer je uiterlijk moet opzeggen, voordat het geld kost." },
    "r-handy": { q: "Weet je wanneer je telefoonabonnement afloopt?", h: "Als je de datum kent, kun je op tijd vergelijken en opzeggen." },
    "q-pass": { q: "Hoe lang moet je paspoort voor veel bestemmingen nog geldig zijn?", o: ["3 maanden", "6 maanden"], a: "Veel landen eisen bij binnenkomst nog minstens 6 maanden.", ask: "Wanneer verloopt dat van jou?" },
    "q-tetanus": { q: "Hoe vaak is een tetanus-herhaling meestal nodig?", o: ["Om de 5 jaar", "Om de 10 jaar"], a: "Meestal om de 10 jaar.", ask: "Wanneer was je laatste?" },
    "q-impfung": { q: "Wanneer vraag je advies over vaccinaties voor een verre reis?", o: ["1 week ervoor", "6–8 weken ervoor"], a: "Het liefst 6 tot 8 weken ervoor: sommige vaccinaties vragen meerdere afspraken.", ask: "Staat er een reis gepland?" },
    "q-checkin": { q: "Wanneer opent bij veel luchtvaartmaatschappijen de online check-in?", o: ["24–48 uur ervoor", "2 weken ervoor"], a: "Meestal 24 tot 48 uur voor vertrek.", ask: "Vlieg je binnenkort?" },
    "q-kindpass": { q: "Hebben kinderen een eigen reisdocument nodig?", o: ["Ja", "Nee"], a: "Ja, kinderen hebben een eigen document nodig.", ask: "Wanneer verloopt dat van je kind?" },
    "q-ausland": { q: "Vergoedt je zorgverzekering in het buitenland altijd alles?", o: ["Ja", "Nee"], a: "Nee, vaak maar een deel of niets, bijvoorbeeld geen repatriëring.", ask: "Staat er een reis gepland?" }
  },
  pt: {
    "t-versicherung": { h: "O cancelamento tem de chegar a tempo à seguradora. Caso contrário, a apólice costuma renovar por mais um ano." },
    "s-urlaub": { q: "Já planeou as férias do novo ano?", h: "Adicione os seus dias de férias: o Livo conta os dias úteis e lembra-o." },
    "s-sommer": { q: "Férias de verão à vista? O seu passaporte ainda é válido?", h: "Muitos países exigem pelo menos 6 meses de validade à entrada." },
    "r-probeabo": { q: "Tem agora um período de teste gratuito?", h: "Muitos renovam-se sozinhos. Adicione até quando tem de cancelar, antes que custe dinheiro." },
    "r-handy": { q: "Sabe quando termina o seu contrato de telemóvel?", h: "Se souber a data, pode comparar e cancelar a tempo." },
    "q-pass": { q: "Que validade deve ter ainda o passaporte para muitos destinos?", o: ["3 meses", "6 meses"], a: "Muitos países exigem pelo menos 6 meses à entrada.", ask: "Quando expira o seu?" },
    "q-tetanus": { q: "De quanto em quanto tempo se faz normalmente o reforço do tétano?", o: ["A cada 5 anos", "A cada 10 anos"], a: "Normalmente a cada 10 anos.", ask: "Quando foi o último?" },
    "q-impfung": { q: "Quando pedir conselho sobre vacinas antes de uma viagem longa?", o: ["1 semana antes", "6–8 semanas antes"], a: "De preferência 6 a 8 semanas antes: algumas vacinas precisam de várias consultas.", ask: "Tem uma viagem à vista?" },
    "q-checkin": { q: "Quando abre o check-in online em muitas companhias aéreas?", o: ["24–48 horas antes", "2 semanas antes"], a: "Normalmente 24 a 48 horas antes da partida.", ask: "Vai voar em breve?" },
    "q-kindpass": { q: "As crianças precisam de um documento próprio para viajar?", o: ["Sim", "Não"], a: "Sim, as crianças precisam de um documento próprio.", ask: "Quando expira o do seu filho?" },
    "q-ausland": { q: "O serviço público de saúde paga sempre tudo no estrangeiro?", o: ["Sim", "Não"], a: "Não, muitas vezes só uma parte ou nada, por exemplo o repatriamento não.", ask: "Tem uma viagem à vista?" }
  },
  tr: {
    "t-versicherung": { h: "İptal talebin sigorta şirketine zamanında ulaşmalı. Yoksa poliçe genelde bir yıl daha yenilenir." },
    "s-urlaub": { q: "Yeni yılın iznini planladın mı?", h: "İzin günlerini ekle: Livo iş günlerini sayar ve sana hatırlatır." },
    "s-sommer": { q: "Yaz tatili mi var? Pasaportun hâlâ geçerli mi?", h: "Birçok ülke girişte en az 6 ay geçerlilik ister." },
    "r-probeabo": { q: "Şu anda ücretsiz denemen var mı?", h: "Çoğu kendiliğinden yenilenir. Ücret ödemeden önce en geç ne zaman iptal etmen gerektiğini ekle." },
    "r-handy": { q: "Telefon sözleşmenin ne zaman bittiğini biliyor musun?", h: "Tarihi bilirsen zamanında karşılaştırıp iptal edebilirsin." },
    "q-pass": { q: "Birçok ülke için pasaportun ne kadar daha geçerli olmalı?", o: ["3 ay", "6 ay"], a: "Birçok ülke girişte en az 6 ay ister.", ask: "Seninki ne zaman bitiyor?" },
    "q-tetanus": { q: "Tetanos aşısı genellikle ne sıklıkla tekrarlanır?", o: ["5 yılda bir", "10 yılda bir"], a: "Genellikle 10 yılda bir.", ask: "Sonuncusu ne zamandı?" },
    "q-impfung": { q: "Uzak bir seyahatten önce aşılar için ne zaman danışmalısın?", o: ["1 hafta önce", "6–8 hafta önce"], a: "En iyisi 6 ila 8 hafta önce; bazı aşılar birkaç randevu gerektirir.", ask: "Yaklaşan bir seyahatin var mı?" },
    "q-checkin": { q: "Birçok havayolunda online check-in ne zaman açılır?", o: ["24–48 saat önce", "2 hafta önce"], a: "Genellikle kalkıştan 24 ila 48 saat önce.", ask: "Yakında uçuyor musun?" },
    "q-kindpass": { q: "Çocukların seyahat için kendi belgesi gerekir mi?", o: ["Evet", "Hayır"], a: "Evet, çocukların kendi belgesi gerekir.", ask: "Çocuğununki ne zaman bitiyor?" },
    "q-ausland": { q: "Genel sağlık sigortası yurt dışında her zaman her şeyi öder mi?", o: ["Evet", "Hayır"], a: "Hayır, çoğu zaman sadece bir kısmını ya da hiçbirini; örneğin geri dönüş nakli ödenmez.", ask: "Yaklaşan bir seyahatin var mı?" }
  },
  pl: {
    "t-versicherung": { h: "Wypowiedzenie musi dotrzeć do ubezpieczyciela na czas. Inaczej polisa zwykle odnawia się na kolejny rok." },
    "s-urlaub": { q: "Zaplanowałeś już urlop na nowy rok?", h: "Dodaj dni urlopu: Livo liczy dni robocze i przypomina." },
    "s-sommer": { q: "Wakacje w planach? Czy twój paszport jest jeszcze ważny?", h: "Wiele krajów wymaga co najmniej 6 miesięcy ważności przy wjeździe." },
    "r-probeabo": { q: "Masz teraz darmowy okres próbny?", h: "Wiele odnawia się samo. Dodaj, do kiedy trzeba zrezygnować, zanim zacznie kosztować." },
    "r-handy": { q: "Wiesz, kiedy kończy się twoja umowa na telefon?", h: "Jeśli znasz datę, możesz na czas porównać oferty i wypowiedzieć umowę." },
    "q-pass": { q: "Jak długo paszport powinien być jeszcze ważny w wielu krajach?", o: ["3 miesiące", "6 miesięcy"], a: "Wiele krajów wymaga przy wjeździe co najmniej 6 miesięcy.", ask: "Kiedy traci ważność twój?" },
    "q-tetanus": { q: "Jak często zwykle powtarza się szczepienie przeciw tężcowi?", o: ["Co 5 lat", "Co 10 lat"], a: "Zwykle co 10 lat.", ask: "Kiedy było ostatnie?" },
    "q-impfung": { q: "Kiedy zasięgnąć porady o szczepieniach przed daleką podróżą?", o: ["1 tydzień wcześniej", "6–8 tygodni wcześniej"], a: "Najlepiej 6 do 8 tygodni wcześniej: niektóre szczepienia wymagają kilku wizyt.", ask: "Masz w planach podróż?" },
    "q-checkin": { q: "Kiedy w wielu liniach lotniczych otwiera się odprawa online?", o: ["24–48 godzin wcześniej", "2 tygodnie wcześniej"], a: "Zwykle 24 do 48 godzin przed wylotem.", ask: "Lecisz wkrótce?" },
    "q-kindpass": { q: "Czy dzieci potrzebują własnego dokumentu w podróży?", o: ["Tak", "Nie"], a: "Tak, dzieci potrzebują własnego dokumentu.", ask: "Kiedy traci ważność dokument dziecka?" },
    "q-ausland": { q: "Czy publiczne ubezpieczenie za granicą zawsze pokrywa wszystko?", o: ["Tak", "Nie"], a: "Nie, często tylko część albo nic, na przykład transportu do kraju nie.", ask: "Masz w planach podróż?" }
  }
};

var dayState = { seen: {}, day: "", id: "", done: "", streak: 0, count: 0, hide: "", pushHour: null, pushOptOut: false };
try { dayState = Object.assign(dayState, JSON.parse(localStorage.getItem("livo.day") || "{}")); } catch (e) {}
var dayQuizPick = null;  // gewählte Antwort des laufenden Quiz (Auflösung sichtbar)
function daySave() {
  if (DEMO) return;
  try { localStorage.setItem("livo.day", JSON.stringify(dayState)); } catch (e) {}
}
function dayHasTpl(tid) { return !DAY_MULTI[tid] && items.some(function (it) { return it.tpl === tid; }); }
function dayTplOk(tid) { var tp = find(TEMPLATES, tid); return !!tp && (!tp.only || tp.only === LANG); }
function dayText(id) { return (DAY_TEXT[LANG] || {})[id]; }

// Alle Fragen, die es in dieser Sprache gibt
function dayAll() {
  var month = new Date().getMonth() + 1, iso = toISO(today());
  var tpls = DAY_TPLS.filter(dayTplOk).map(function (tid) { return { id: "t-" + tid, kind: "t", tpl: tid }; });
  var extra = DAY_EXTRA.filter(function (q) {
    return dayText(q.id) && dayTplOk(q.tpl) && (!q.months || q.months.indexOf(month) >= 0) && (!q.until || iso <= q.until);
  });
  return tpls.concat(extra);
}
// Noch offen: nicht beantwortet oder "Später" abgelaufen. Was schon in der Liste steht, fragt nur noch das Quiz.
function dayOpen(q) {
  var s = dayState.seen[q.id];
  if (s === "x" || (s && s > toISO(today()))) return false;
  return q.kind === "q" || q.kind === "z" || !dayHasTpl(q.tpl);
}
// Die nächste Frage: zuerst die Jahreszeit, dann das Quiz mit Ratgeber (quiz.js), danach jede 3. ein kurzes Quiz und jede 6. aus dem Ratgeber
function dayNext() {
  var open = dayAll().filter(dayOpen);
  function of(kind) { return open.filter(function (q) { return q.kind === kind; })[0]; }
  var n = dayState.count % 6;
  return of("s") || of("z") || (n === 2 || n === 5 ? of("q") : n === 4 ? of("r") : of("t")) || of("t") || of("q") || of("r") || null;
}
function dayCurrent() {
  var forced = DEMO && params.get("day");
  if (forced) return dayAll().concat(DAY_EXTRA).filter(function (q) { return q.id === forced; })[0] || (forced.slice(0, 2) === "t-" ? { id: forced, kind: "t", tpl: forced.slice(2) } : null);
  var iso = toISO(today());
  if (dayState.day === iso && dayState.id) {
    var cur = dayAll().filter(function (q) { return q.id === dayState.id; })[0];
    if (cur && (dayQuizPick !== null || dayOpen(cur))) return cur;
  }
  var q = dayNext();
  dayState.day = iso;
  dayState.id = q ? q.id : "";
  daySave();
  return q;
}
// "12 von 24 Bereichen geklärt": eingetragen oder mit "Hab ich nicht" beantwortet
function dayProgress() {
  var all = DAY_TPLS.filter(dayTplOk), n = all.filter(function (tid) { return dayHasTpl(tid) || dayState.seen["t-" + tid] === "x"; }).length;
  return '<div class="day-bar"><i style="width:' + Math.round(n / all.length * 100) + '%"></i></div><div class="day-foot">' + esc(t("day.progress", { a: n, b: all.length })) + '</div>';
}
function dayTitle(q) {
  return q.kind === "t" ? t("day.q", { x: tplTitle(find(TEMPLATES, q.tpl)) }) : (dayText(q.id) || {}).q || "";
}
function dayHTML() {
  if (!canEdit()) return "";
  var iso = toISO(today()), forced = DEMO && params.get("day");
  if (dayState.hide === iso && !forced) return "";
  var streak = dayState.streak >= 2 && (dayState.done === iso || dayState.done === toISO(addDays(today(), -1)))
    ? '<span class="day-streak">🔥 ' + esc(t("day.streak", { d: dayState.streak })) + '</span>' : "";
  // Ergebnis des Quiz mit Ratgeber bleibt stehen, bis man es schließt, auch nach einem Neustart der App
  var zDone = dayState.zShow === iso && dayState.zId ? DAY_EXTRA.filter(function (e) { return e.id === dayState.zId; })[0] : null;
  if (zDone && dayText(zDone.id)) return dayZHTML(zDone, streak);
  // Für heute beantwortet: nur noch eine kleine Zeile. Höchstens eine Frage am Tag, die nächste kommt morgen.
  if (dayState.done === iso && dayQuizPick === null && !forced) {
    return '<div class="day day-mini"><div class="day-mini-l"><span>' + esc(t("day.finished")) + '</span>' + streak + '</div>' + dayBellHTML() + '</div>';
  }
  var q = dayCurrent();
  if (!q) return "";
  if (q.kind === "z") return dayZHTML(q, streak);
  var tp = find(TEMPLATES, q.tpl), x = dayText(q.id) || {};
  var head = { t: "💡 " + t("day.title"), s: "🍂 " + t("day.season"), r: "📖 " + t("day.guide"), q: "🧠 " + t("day.quiz") }[q.kind];
  var top = '<div class="day-top"><span>' + esc(head) + '</span>' + streak + '</div>' +
    '<button type="button" class="tipbox-x" data-act="dayClose" aria-label="' + esc(t("cancel")) + '">×</button>';
  var addBtn = '<button type="button" class="day-btn main" data-act="dayAdd">' + esc(t("day.add")) + '</button>';
  var laterBtn = '<button type="button" class="day-btn" data-act="dayLater">' + esc(t("day.later")) + '</button>';
  if (q.kind === "q") {
    var picked = dayQuizPick !== null;
    var opts = x.o.map(function (o, i) {
      var cls = !picked ? "" : i === q.right ? " ok" : i === dayQuizPick ? " no" : "";
      return '<button type="button" class="day-opt' + cls + '" data-act="dayAns" data-i="' + i + '"' + (picked ? " disabled" : "") + '>' + esc(o) + '</button>';
    }).join("");
    var res = !picked ? "" : '<div class="day-res"><b>' + esc(t(dayQuizPick === q.right ? "day.right" : "day.wrong")) + '</b> ' + esc(x.a) +
      (dayHasTpl(q.tpl) ? "" : " " + esc(x.ask)) + '</div><div class="day-btns">' +
      (dayHasTpl(q.tpl) ? '<button type="button" class="day-btn main" data-act="dayOk">OK</button>' : addBtn + laterBtn) + '</div>';
    return '<div class="day">' + top + '<div class="day-q">' + esc(x.q) + '</div><div class="day-opts">' + opts + '</div>' + res + dayProgress() + '</div>';
  }
  var hint = x.h || (q.kind === "t" ? tplHint(tp) : "");
  return '<div class="day">' + top + '<div class="day-q">' + esc(dayTitle(q)) + '</div>' + (hint ? '<div class="day-hint">' + esc(hint) + '</div>' : "") +
    '<div class="day-btns">' + addBtn + '<button type="button" class="day-btn" data-act="dayNo">' + esc(t(q.kind === "s" ? "day.done" : "day.no")) + '</button>' + laterBtn + '</div>' + dayProgress() + '</div>';
}
// Beantwortet: Serie hochzählen (einmal am Tag), die nächste Frage kommt morgen
function dayAnswered() {
  var iso = toISO(today());
  if (dayState.done !== iso) {
    dayState.streak = dayState.done === toISO(addDays(today(), -1)) ? dayState.streak + 1 : 1;
    dayState.done = iso;
  }
  dayState.count++;
  daySave();
}
function dayLaterDate(days) { return toISO(addDays(today(), days)); }
function dayAct(act, el) {
  if (act === "dayPush") return dayPushShow();
  if (act === "dayPushToggle") return dayPushToggle(el);
  if (act === "dayBell") return dayBell(el);
  if (act === "dayZAns" || act === "dayZClose" || act === "dayZAdd") return dayZAct(act, el);
  if (act === "dayClose") { dayState.hide = toISO(today()); daySave(); return render(); }
  var q = dayCurrent();
  if (!q) return render();
  if (act === "dayAns") {
    var pick = +el.getAttribute("data-i");
    dayQuizPick = pick;
    // Falsch beantwortet: kommt in 3 Wochen noch einmal
    dayState.seen[q.id] = pick === q.right ? "x" : dayLaterDate(21);
    dayAnswered();
    return render();
  }
  dayQuizPick = null;
  if (act === "dayOk") return render();
  var wasQuiz = q.kind === "q";
  if (act === "dayNo") dayState.seen[q.id] = "x";
  else if (!wasQuiz) dayState.seen[q.id] = DAY_MULTI[q.tpl] && act === "dayAdd" ? "x" : dayLaterDate(7); // "Eintragen" abgebrochen: fragt in einer Woche wieder
  if (!wasQuiz) dayAnswered(); else daySave();
  render();
  if (act === "dayAdd") showNew(q.tpl);
}

/* ---------- Quiz mit Ratgeber (Texte in quiz.js): 4 Antworten, 3 Versuche ---------- */
// Richtig: Der Ratgeber öffnet sich, danach führt die Karte zur passenden Frist. Dreimal falsch: Die richtige Antwort wird gezeigt,
// der Ratgeber bleibt zu und die Frage kommt nach 3 Wochen wieder. Die Versuche gelten für einen Tag.
var DAY_Z_TRIES = 3, DAY_Z_ICON = { geld: "💶", essen: "🥦", bewegung: "🏃", schlaf: "😴", stress: "🧘" };
function dayZPicks(q) { return dayState.zId === q.id && dayState.zDay === toISO(today()) ? dayState.zPicks || [] : []; }
function dayZTopic(q) { return DAY_Z_ICON[q.topic] + " " + t("day.t." + q.topic); }
function dayZHTML(q, streak) {
  var x = dayText(q.id);
  if (!x) return "";
  var picks = dayZPicks(q), won = picks.indexOf(q.right) >= 0, lost = !won && picks.length >= DAY_Z_TRIES;
  var opts = x.o.map(function (o, i) {
    var cls = i === q.right && (won || lost) ? " ok" : picks.indexOf(i) >= 0 ? " no" : "";
    return '<button type="button" class="day-opt' + cls + '" data-act="dayZAns" data-i="' + i + '"' + (won || lost || picks.indexOf(i) >= 0 ? " disabled" : "") + '>' + esc(o) + '</button>';
  }).join("");
  var html = '<div class="day"><div class="day-top"><span>🧠 ' + esc(t("day.quiz")) + '</span>' + streak + '</div>' +
    '<button type="button" class="tipbox-x" data-act="dayClose" aria-label="' + esc(t("cancel")) + '">×</button>' +
    '<div class="day-q">' + esc(x.q) + '</div><div class="day-opts">' + opts + '</div>';
  if (won) {
    var ok = '<button type="button" class="day-btn main" data-act="dayZClose">OK</button>';
    html += '<div class="day-guide"><div class="day-gh">🎁 ' + esc(t("day.zWon", { x: dayZTopic(q) })) + '</div><div class="day-gt">' + esc(x.title) + '</div><div class="day-gx">' + esc(x.text) + '</div>' +
      '<div class="day-src">' + esc(t("day.zSrc", { x: x.src })) + (q.med ? " · " + esc(t("day.zMed")) : "") + '</div></div>' +
      (dayHasTpl(q.tpl) ? '<div class="day-btns">' + ok + '</div>'
        : '<div class="day-ask">' + esc(x.ask) + '</div><div class="day-btns"><button type="button" class="day-btn main" data-act="dayZAdd">' + esc(t("day.add")) + '</button>' +
          '<button type="button" class="day-btn" data-act="dayZClose">' + esc(t("day.later")) + '</button></div>');
  } else if (lost) {
    html += '<div class="day-res"><b>' + esc(t("day.zLost", { x: x.o[q.right] })) + '</b> ' + esc(t("day.zLostMore")) + '</div><div class="day-btns"><button type="button" class="day-btn main" data-act="dayZClose">OK</button></div>';
  } else if (picks.length) {
    var left = DAY_Z_TRIES - picks.length;
    html += '<div class="day-try">' + esc(left === 1 ? t("day.zLeft1") : t("day.zLeft", { c: left })) + '</div>';
  } else {
    html += '<div class="day-foot day-tries">' + esc(t("day.zTries", { x: dayZTopic(q) })) + '</div>';
  }
  return html + '</div>';
}
function dayZAct(act, el) {
  var iso = toISO(today());
  if (act === "dayZAns") {
    var q = dayCurrent();
    if (!q || q.kind !== "z") return render();
    if (dayState.zId !== q.id || dayState.zDay !== iso) { dayState.zId = q.id; dayState.zDay = iso; dayState.zPicks = []; }
    var pick = +el.getAttribute("data-i");
    if (dayState.zPicks.indexOf(pick) < 0) dayState.zPicks.push(pick);
    var won = pick === q.right;
    if (won || dayState.zPicks.length >= DAY_Z_TRIES) {
      dayState.seen[q.id] = won ? "x" : dayLaterDate(21);
      dayState.zShow = iso;
      dayAnswered();
    } else daySave();
    return render();
  }
  var done = DAY_EXTRA.filter(function (e) { return e.id === dayState.zId; })[0];
  dayState.zShow = "";
  daySave();
  render();
  if (act === "dayZAdd" && done) showNew(done.tpl);
}

/* ---------- Als Nachricht: pro Gerät, kommt beim Einschalten der Erinnerungen mit (dayPushAutoOn), einzeln abschaltbar ---------- */
// Die gewählte Stunde liegt in livo.day (pushHour) und zusätzlich in der eigenen Zeile von push_subscriptions, zusammen mit
// der nächsten Frage, denn die kennt nur die App. Verschickt wird sie von send-reminders (action "daily", siehe dort die Regeln).
// Getrennt vom Speichern des Abos (saveSubscription): klemmt etwas an diesen Feldern, bleiben die Erinnerungen davon unberührt.
var DAY_PUSH_HOURS = [8, 10, 12, 18, 20], DAY_PUSH_DEFAULT = 10;
var dayPushLast = ""; // was zuletzt geschrieben wurde: nur bei einer Änderung neu schreiben
function dayPushOn() { return pushState === "on" && dayState.pushHour != null; }
function dayPushClock(hour) { return (hour < 10 ? "0" : "") + hour + ":00"; }
// Die Frage, die die Karte als Nächstes zeigt: die heutige, solange sie offen ist, sonst die folgende
function dayPushQuestion() {
  var iso = toISO(today()), q = null;
  if (dayState.done !== iso && dayState.day === iso && dayState.id) {
    q = dayAll().filter(function (c) { return c.id === dayState.id; })[0] || null;
    if (q && !dayOpen(q)) q = null;
  }
  q = q || dayNext();
  return q ? dayTitle(q).split(String.fromCharCode(173)).join("").slice(0, 200) : "";
}
function dayPushFields() {
  var iso = toISO(today());
  var fields = { daily_hour: dayState.pushHour, daily_tz: TIME_ZONE.slice(0, 64), daily_q: dayPushQuestion() || null, daily_seen_on: iso };
  // Heute beantwortet oder weggeklickt: heute keine Nachricht mehr
  if (dayState.done === iso || dayState.hide === iso) fields.daily_sent_on = iso;
  return fields;
}
async function dayPushWrite(fields) {
  if (DEMO) return true;
  if (!pushEndpoint) return false;
  try {
    var r = await sb.from("push_subscriptions").update(fields).eq("endpoint", pushEndpoint);
    return !r.error;
  } catch (e) { return false; }
}
// Bei jedem Anzeigen: hat sich etwas geändert (Frage beantwortet, neuer Tag, neue Frist), bekommt es der Server. Klappt das
// nicht (offline), holt es der nächste Start nach.
function dayPushSync() {
  if (DEMO || !dayPushOn() || !pushEndpoint) return;
  var fields = dayPushFields(), key = JSON.stringify(fields);
  if (key === dayPushLast) return;
  dayPushLast = key;
  dayPushWrite(fields);
}
// Erinnerungen auf diesem Gerät aus oder abgemeldet: die Zeile ist schon gelöscht. Beim Abmelden (all) zählt auch
// "bewusst abgeschaltet" nicht mehr, denn danach kann jemand anderes den Browser nutzen.
function dayPushForget(all) {
  dayState.pushHour = null;
  dayPushLast = "";
  pushEndpoint = "";
  if (all) dayState.pushOptOut = false;
  daySave();
}
// Erinnerungen gerade eingeschaltet: Die Frage des Tages kommt mit, außer sie wurde auf diesem Gerät bewusst abgeschaltet.
// Geräte, auf denen die Erinnerungen schon an waren, bleiben, wie sie sind (dort wurde nur nach den Fristen gefragt).
async function dayPushAutoOn() {
  if (dayState.pushHour != null || dayState.pushOptOut || !canEdit()) return false;
  return dayPushSet(DAY_PUSH_DEFAULT);
}
// Hinweis beim Einschalten der Erinnerungen
function dayPushCardAdd() {
  return dayState.pushOptOut ? "" : " " + t("day.pushCardAdd");
}
// hour: gewählte Stunde oder null = aus. Es gilt erst, wenn der Server es hat: sonst käme die Nachricht weiter, obwohl "aus" dasteht.
async function dayPushSet(hour) {
  var before = dayState.pushHour;
  dayState.pushHour = hour;
  var fields = hour === null ? { daily_hour: null, daily_tz: null, daily_q: null, daily_sent_on: null, daily_seen_on: null } : dayPushFields();
  if (!(await dayPushWrite(fields))) {
    dayState.pushHour = before;
    toast(t("toast.retry"));
    return false;
  }
  dayPushLast = hour === null ? "" : JSON.stringify(fields);
  dayState.pushOptOut = hour === null;
  daySave();
  return true; // Rückmeldung ist der Schalter selbst, der erst jetzt umspringt
}
async function dayPushEnable() {
  if (DEMO) { pushState = "on"; return true; }
  try { return await enablePush(); } catch (e) { return false; }
}
async function dayPushToggle(el) {
  el.disabled = true;
  if (dayPushOn()) await dayPushSet(null);
  // Erinnerungen noch aus: erst die Erlaubnis holen, das muss direkt aus dem Tippen kommen
  else if (pushState === "on" || await dayPushEnable()) await dayPushSet(DAY_PUSH_DEFAULT);
  else toast(t(pushState === "blocked" ? "toast.pushBlocked" : "toast.pushOff"));
  render();
  if (!sheet.hidden) dayPushShow();
}
function dayPushShow() {
  var why = { "ios-install": "push.ios", blocked: "push.blocked", unsupported: "push.unsupported" }[pushState];
  var html = '<h3>🔔 ' + esc(t("day.pushOffer")) + '</h3>';
  if (why) html += '<div class="pushinfo">' + t(why) + '</div>';
  else {
    var on = dayPushOn();
    html += '<button type="button" class="day-set" role="switch" aria-checked="' + on + '" data-act="dayPushToggle">' +
      '<span><b>💡 ' + esc(t("day.title")) + '</b><small>' + esc(t("day.pushNote")) + '</small></span><i class="day-sw"></i></button>';
    if (on) html += '<label class="day-set"><b>' + esc(t("day.pushTime")) + '</b><select id="dayTime">' + DAY_PUSH_HOURS.map(function (h) {
      return '<option value="' + h + '"' + (h === dayState.pushHour ? " selected" : "") + '>' + dayPushClock(h) + '</option>';
    }).join("") + '</select></label>';
  }
  openSheet(html + '<button type="button" class="btn light" data-act="close">OK</button>');
  var sel = document.getElementById("dayTime");
  if (sel) sel.addEventListener("change", function () {
    dayPushSet(+sel.value).then(function (ok) {
      render();
      if (!ok) dayPushShow();
    });
  });
}
// Glocke in der kleinen Zeile "Für heute erledigt": schaltet die tägliche Nachricht an und aus, auch ohne Frist (dann gibt es
// die große Glocke nicht). Die Uhrzeit ändert man unter der großen Glocke.
function dayBellHTML() {
  if ((DEMO && !params.get("icons")) || pushState === "unsupported") return "";
  var on = dayPushOn(), label = esc(t("day.pushOffer"));
  if (!on && !dayAll().filter(dayOpen).length) return ""; // keine Frage mehr offen: es käme ohnehin nichts
  return '<button type="button" class="day-bell' + (on ? " on" : "") + '" data-act="dayBell" aria-pressed="' + on + '" aria-label="' + label + '" title="' + label + '">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true">' + INFO_SVG[on ? "bell" : "belloff"] + '</svg></button>';
}
async function dayBell(el) {
  if (pushState === "blocked" || pushState === "ios-install") return dayPushShow(); // erklärt, was zu tun ist
  var was = dayPushOn();
  await dayPushToggle(el);
  if (dayPushOn() !== was) toast(was ? t("day.bellOff") : t("day.bellOn", { time: dayPushClock(dayState.pushHour) }));
}
// Zweite Zeile unter der Glocke, wenn die Erinnerungen an sind
function dayPushLineHTML() {
  var on = dayPushOn();
  return '<p class="quota">' + esc(on ? t("day.pushLine", { time: dayPushClock(dayState.pushHour) }) : t("day.pushLineOff")) +
    ' · <button type="button" class="linkbtn" data-act="dayPush">' + esc(t(on ? "day.pushChange" : "day.pushEnable")) + '</button></p>';
}
