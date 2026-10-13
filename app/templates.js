// Vorlagen. Jede Vorlage fragt so wenig wie möglich ab und rechnet daraus aus:
// due = Fälligkeit, every = Wiederholung in Monaten (0 = einmalig), lead = wie
// viele Tage vorher erinnert wird.
// from: "done" = nächster Termin zählt ab dem Tag, an dem man "Erledigt" tippt
// (z. B. Zahnarzt), sonst ab der alten Fälligkeit (z. B. TÜV).
// renew: Dokumente bekommen beim Erneuern ein neues "Gültig bis"-Datum.
// dateMeans: was ein gesprochenes Datum in der Vergangenheit bedeutet ("last" = letztes Mal,
// "start" = Vertragsbeginn, "birth" = Geburt). Ein Datum in der Zukunft ist dann direkt der Termin.
// only: Vorlage nur in dieser Sprache (deutsche Regeln wie Kfz-Versicherung bis 30.11.).
// Die Texte stehen unten in TPL_TEXT, je Sprache.

var CATEGORIES = [
  { id: "doc", icon: "🪪" },
  { id: "car", icon: "🚗" },
  { id: "contract", icon: "📄" },
  { id: "health", icon: "🩺" },
  { id: "family", icon: "👪" },
  { id: "money", icon: "💶" },
  { id: "own", icon: "📝" }
];

var EVERY_OPTIONS = [0, 1, 3, 6, 12, 24, 36, 120].map(function (n) { return [n, t("everyopt." + n)]; });
// Fahrzeugprüfung: in den Niederlanden (APK) und Polen bei älteren Autos jedes Jahr, sonst meist alle 2 Jahre
var TUEV_EVERY = { nl: 12, pl: 12 };

function months(v, def) { var n = parseInt(v, 10); return n > 0 ? n : def; }
function dated(v) { return { due: fromISO(v.date), every: 0 }; }
// Jedes Jahr am selben Tag (Geburtstag, Hochzeitstag) - das Jahr im Datum ist egal
function yearly(v) { var d = fromISO(v.date); return { due: nextYearly(d.getMonth() + 1, d.getDate()), every: 12 }; }

var TEMPLATES = [
  // Ausweise & Dokumente
  { id: "personalausweis", cat: "doc", lead: 90, renew: true, fields: [{ key: "date", type: "date" }], compute: dated },
  { id: "reisepass", cat: "doc", lead: 180, renew: true, fields: [{ key: "date", type: "date" }], compute: dated },
  { id: "fuehrerschein", cat: "doc", lead: 90, renew: true, fields: [{ key: "date", type: "date" }], compute: dated },
  { id: "aufenthaltstitel", cat: "doc", lead: 90, renew: true, fields: [{ key: "date", type: "date" }], compute: dated },

  // Auto
  {
    id: "tuev", cat: "car", lead: 30, fields: [{ key: "month", type: "month" }],
    compute: function (v) { return { due: endOfMonth(v.month), every: TUEV_EVERY[LANG] || 24 }; }
  },
  {
    id: "kfzversicherung", cat: "car", lead: 30, only: "de", fields: [],
    compute: function () { return { due: nextYearly(11, 30), every: 12 }; }
  },
  {
    id: "inspektion", cat: "car", lead: 14, from: "done", fields: [{ key: "date", type: "date" }],
    compute: function (v) { return { due: fromISO(v.date), every: 12 }; }
  },
  {
    id: "reifen", cat: "car", lead: 14, only: "de", fields: [],
    compute: function () {
      var a = nextYearly(10, 1), b = nextYearly(4, 1);
      return { due: a < b ? a : b, every: 6 };
    }
  },

  // Verträge & Versicherungen
  {
    id: "handy", cat: "contract", lead: 45, dateMeans: "start",
    fields: [{ key: "what", type: "text", optional: true }, { key: "start", type: "date" }, { key: "term", type: "months", value: 24 }],
    compute: function (v) { return { due: addMonths(fromISO(v.start), months(v.term, 24)), every: 0 }; }
  },
  {
    id: "versicherung", cat: "contract", lead: 30,
    fields: [{ key: "what", type: "text", optional: true }, { key: "end", type: "date" }, { key: "notice", type: "months", value: 3 }],
    compute: function (v) { return { due: addMonths(fromISO(v.end), -months(v.notice, 3)), every: 12 }; }
  },
  {
    id: "strom", cat: "contract", lead: 30, dateMeans: "start",
    fields: [{ key: "what", type: "text", optional: true }, { key: "start", type: "date" }, { key: "term", type: "months", value: 12 }],
    compute: function (v) { return { due: addMonths(fromISO(v.start), months(v.term, 12)), every: 12 }; }
  },
  {
    id: "abo", cat: "contract", lead: 30, dateMeans: "start",
    fields: [{ key: "what", type: "text", optional: true }, { key: "start", type: "date" }, { key: "term", type: "months", value: 12 }],
    compute: function (v) { return { due: addMonths(fromISO(v.start), months(v.term, 12)), every: 0 }; }
  },

  // Gesundheit
  {
    id: "zahnarzt", cat: "health", lead: 14, from: "done", dateMeans: "last", fields: [{ key: "date", type: "date" }],
    compute: function (v) { return { due: addMonths(fromISO(v.date), 6), every: 6 }; }
  },
  {
    id: "checkup", cat: "health", lead: 30, from: "done", dateMeans: "last", fields: [{ key: "date", type: "date" }],
    compute: function (v) { return { due: addMonths(fromISO(v.date), 36), every: 36 }; }
  },
  {
    id: "tetanus", cat: "health", lead: 60, from: "done", dateMeans: "last", fields: [{ key: "date", type: "date" }],
    compute: function (v) { return { due: addMonths(fromISO(v.date), 120), every: 120 }; }
  },
  {
    id: "arzttermin", cat: "health", lead: 1,
    fields: [{ key: "who", type: "text", optional: true }, { key: "date", type: "date" }], compute: dated
  },

  // Familie & Kinder
  {
    id: "geburtstag", cat: "family", lead: 7,
    fields: [{ key: "who", type: "text", optional: true }, { key: "date", type: "date" }], compute: yearly
  },
  { id: "hochzeitstag", cat: "family", lead: 7, fields: [{ key: "date", type: "date" }], compute: yearly },
  {
    id: "kinderarzt", cat: "family", lead: 7,
    fields: [{ key: "who", type: "text", optional: true }, { key: "date", type: "date" }], compute: dated
  },
  {
    id: "schule", cat: "family", lead: 7,
    fields: [{ key: "what", type: "text", optional: true }, { key: "date", type: "date" }], compute: dated
  },
  {
    id: "kinderpass", cat: "family", lead: 90, renew: true,
    fields: [{ key: "who", type: "text", optional: true }, { key: "date", type: "date" }], compute: dated
  },
  {
    // Elterngeld gibt es rückwirkend nur für 3 Lebensmonate: Frist = Geburt + 3 Monate
    id: "elterngeld", cat: "family", lead: 30, only: "de", dateMeans: "birth", fields: [{ key: "date", type: "date" }],
    compute: function (v) { return { due: addMonths(fromISO(v.date), 3), every: 0 }; }
  },

  // Geld & Steuern
  {
    id: "rechnung", cat: "money", lead: 3,
    fields: [{ key: "what", type: "text", optional: true }, { key: "date", type: "date" }], compute: dated
  },
  {
    id: "steuer", cat: "money", lead: 45, only: "de", fields: [],
    compute: function () { return { due: nextYearly(7, 31), every: 12 }; }
  },

  // Eigene
  {
    id: "eigene", cat: "own", lead: 14,
    fields: [{ key: "title", type: "text" }, { key: "date", type: "date" }, { key: "every", type: "select", options: EVERY_OPTIONS, value: 0 }],
    compute: function (v) { return { due: fromISO(v.date), every: parseInt(v.every, 10) || 0 }; }
  }
];

// Texte je Sprache: title, hint, labels/ph (Feldbeschriftung/Beispiel je Feld),
// name = Titel mit {what} (Anbieter, Arzt, …), name0 = Titel ohne
var TPL_TEXT = {
  de: {
    cat: { doc: "Ausweise & Dokumente", car: "Auto", contract: "Verträge & Versicherungen", health: "Gesundheit", family: "Familie & Kinder", money: "Geld & Steuern", own: "Eigene" },
    geburtstag: { title: "Geburtstag", hint: "Livo erinnert dich jedes Jahr eine Woche vorher – Zeit genug für ein Geschenk.", labels: { who: "Wer hat Geburtstag?", date: "Geburtstag (das Jahr ist egal)" }, ph: { who: "z. B. Mama, Anna" }, name: "Geburtstag {what}", name0: "Geburtstag" },
    hochzeitstag: { title: "Hochzeitstag", hint: "Livo erinnert dich jedes Jahr eine Woche vorher.", labels: { date: "Hochzeitsdatum (das Jahr ist egal)" }, name0: "Hochzeitstag" },
    kinderarzt: { title: "Kinderarzt (U-Untersuchung, Impfung)", hint: "Die U-Untersuchungen stehen im gelben Kinderuntersuchungsheft, die Impfungen im Impfpass – den Termin am besten früh ausmachen.", labels: { who: "Für wen?", date: "Termin am" }, ph: { who: "z. B. Lena" }, name: "Kinderarzt – {what}", name0: "Kinderarzt" },
    schule: { title: "Kita & Schule", hint: "Für Anmeldungen gibt es oft feste Fristen – lieber früh eintragen.", labels: { what: "Was?", date: "Datum" }, ph: { what: "z. B. Elternabend, Kita-Anmeldung" }, name: "{what}", name0: "Kita & Schule" },
    kinderpass: { title: "Ausweis / Pass (Kind)", hint: "Kinder brauchen für Reisen ein eigenes Dokument. Neue Ausweise rechtzeitig beantragen – das dauert einige Wochen.", labels: { who: "Für wen?", date: "Gültig bis" }, ph: { who: "z. B. Lena" }, name: "Ausweis / Pass – {what}", name0: "Ausweis / Pass (Kind)" },
    elterngeld: { title: "Elterngeld beantragen", hint: "Elterngeld gibt es rückwirkend nur für die letzten 3 Lebensmonate vor dem Antrag – am besten in den ersten Wochen nach der Geburt beantragen.", labels: { date: "Geburtstag des Kindes" }, name0: "Elterngeld beantragen" },
    personalausweis: { title: "Personalausweis", hint: "Neuen Ausweis rechtzeitig beim Bürgeramt beantragen – die Herstellung dauert einige Wochen.", labels: { date: "Gültig bis" } },
    reisepass: { title: "Reisepass", hint: "Viele Länder verlangen bei der Einreise noch mindestens 6 Monate Gültigkeit.", labels: { date: "Gültig bis" } },
    fuehrerschein: { title: "Führerschein", hint: "Der EU-Kartenführerschein muss alle 15 Jahre erneuert werden.", labels: { date: "Gültig bis (Feld 4b auf der Karte)" } },
    aufenthaltstitel: { title: "Aufenthaltstitel", hint: "Die Verlängerung früh bei der Ausländerbehörde beantragen – Termine sind oft knapp.", labels: { date: "Gültig bis" } },
    tuev: { title: "TÜV / Hauptuntersuchung", hint: "Steht auf der Plakette am hinteren Kennzeichen. Danach meist alle 2 Jahre.", labels: { month: "Nächste HU laut Plakette (Monat und Jahr)" }, ph: { month: "z. B. 2027-04" } },
    kfzversicherung: { title: "Kfz-Versicherung wechseln", hint: "Die meisten Kfz-Versicherungen laufen bis 31.12. – kündigen oder wechseln geht bis 30.11." },
    inspektion: { title: "Inspektion / Auto-Service", hint: "Steht im Serviceheft oder wird im Auto-Display angezeigt.", labels: { date: "Nächste Inspektion fällig am" } },
    reifen: { title: "Reifenwechsel", hint: "Faustregel „von O bis O“: Winterreifen von Oktober bis Ostern." },
    handy: {
      title: "Handy- / Internetvertrag", hint: "Nach der Mindestlaufzeit kannst du meist jederzeit mit 1 Monat Frist kündigen – ein guter Zeitpunkt, Preise zu vergleichen.",
      labels: { what: "Anbieter", start: "Vertragsbeginn", term: "Mindestlaufzeit (Monate)" }, ph: { what: "z. B. Telekom" },
      name: "Handyvertrag {what} – Laufzeit endet", name0: "Handy- / Internetvertrag – Laufzeit endet"
    },
    versicherung: {
      title: "Versicherung (Hausrat, Haftpflicht …)", hint: "Bis zu diesem Tag muss deine Kündigung beim Versicherer angekommen sein. Sonst verlängert sich der Vertrag meist um ein Jahr.",
      labels: { what: "Welche Versicherung?", end: "Vertrag läuft ab am", notice: "Kündigungsfrist (Monate)" }, ph: { what: "z. B. Hausrat" },
      name: "{what} – letzter Kündigungstag", name0: "Versicherung – letzter Kündigungstag"
    },
    strom: {
      title: "Strom- / Gasvertrag", hint: "Nach der Erstlaufzeit kannst du meist mit 1 Monat Frist kündigen. Ein Preisvergleich lohnt sich jedes Jahr.",
      labels: { what: "Anbieter", start: "Vertragsbeginn", term: "Erstlaufzeit (Monate)" }, ph: { what: "z. B. Stadtwerke" },
      name: "Strom/Gas {what} – Preise vergleichen", name0: "Strom / Gas – Preise vergleichen"
    },
    abo: {
      title: "Abo / Fitnessstudio", hint: "Nach der Mindestlaufzeit kannst du meist jederzeit mit 1 Monat Frist kündigen.",
      labels: { what: "Was?", start: "Vertragsbeginn", term: "Mindestlaufzeit (Monate)" }, ph: { what: "z. B. Fitnessstudio" },
      name: "{what} – Laufzeit endet", name0: "Abo – Laufzeit endet"
    },
    zahnarzt: { title: "Zahnarzt-Kontrolle", hint: "Für das Bonusheft zählt bei Erwachsenen eine Kontrolle pro Kalenderjahr.", labels: { date: "Letzte Kontrolle" } },
    checkup: { title: "Gesundheits-Check-up", hint: "Ab 35 zahlt die Krankenkasse den Check-up alle 3 Jahre.", labels: { date: "Letzter Check-up" } },
    tetanus: { title: "Tetanus-Impfung auffrischen", hint: "Tetanus und Diphtherie werden in der Regel alle 10 Jahre aufgefrischt.", labels: { date: "Letzte Impfung" } },
    arzttermin: { title: "Arzttermin", labels: { who: "Bei wem?", date: "Datum" }, ph: { who: "z. B. Hausärztin Dr. Weber" }, name: "Arzttermin – {what}", name0: "Arzttermin" },
    rechnung: { title: "Rechnung bezahlen", labels: { what: "Wofür?", date: "Fällig am" }, ph: { what: "z. B. Stadtwerke" }, name: "Rechnung – {what}", name0: "Rechnung bezahlen" },
    steuer: { title: "Steuererklärung", hint: "Ohne Steuerberater gilt in der Regel der 31. Juli des Folgejahres.", name0: "Steuererklärung abgeben" },
    eigene: { title: "Eigene Frist", labels: { title: "Was?", date: "Fällig am", every: "Wiederholung" }, ph: { title: "z. B. Rundfunkbeitrag prüfen" } },
    demo: { bill: "Stadtwerke", phone: "Telekom" }
  },
  en: {
    cat: { doc: "IDs & documents", car: "Car", contract: "Contracts & insurance", health: "Health", family: "Family & kids", money: "Money", own: "Your own" },
    geburtstag: { title: "Birthday", hint: "Livo reminds you a week before, every year – plenty of time for a present.", labels: { who: "Whose birthday?", date: "Birthday (any year)" }, ph: { who: "e.g. Mum, Anna" }, name: "{what}'s birthday", name0: "Birthday" },
    hochzeitstag: { title: "Wedding anniversary", hint: "Livo reminds you a week before, every year.", labels: { date: "Wedding date (any year)" }, name0: "Wedding anniversary" },
    kinderarzt: { title: "Paediatrician (check-up, vaccination)", hint: "Check-ups and vaccinations are listed in your child's health record – book appointments early.", labels: { who: "For whom?", date: "Appointment on" }, ph: { who: "e.g. Lena" }, name: "Paediatrician – {what}", name0: "Paediatrician" },
    schule: { title: "Nursery & school", hint: "Registrations often have fixed deadlines – better add them early.", labels: { what: "What?", date: "Date" }, ph: { what: "e.g. parents' evening" }, name: "{what}", name0: "Nursery & school" },
    kinderpass: { title: "Child's ID / passport", hint: "Children need their own document to travel. Apply for new documents in good time – it takes a few weeks.", labels: { who: "For whom?", date: "Valid until" }, ph: { who: "e.g. Lena" }, name: "ID / passport – {what}", name0: "Child's ID / passport" },
    personalausweis: { title: "ID card", hint: "Apply for a new ID card in good time – it can take a few weeks.", labels: { date: "Valid until" } },
    reisepass: { title: "Passport", hint: "Many countries require at least 6 months of validity when you enter.", labels: { date: "Valid until" } },
    fuehrerschein: { title: "Driving licence", hint: "Check the expiry date on your licence – EU card licences have to be renewed every 15 years.", labels: { date: "Valid until" } },
    aufenthaltstitel: { title: "Residence permit", hint: "Apply for the extension early – appointments are often hard to get.", labels: { date: "Valid until" } },
    tuev: { title: "Car inspection", hint: "Usually due every 2 years – the date is on your inspection sticker or certificate.", labels: { month: "Next inspection due (month and year)" }, ph: { month: "e.g. 2027-04" } },
    inspektion: { title: "Car service", hint: "It's in the service book or shown on the car's display.", labels: { date: "Next service due on" } },
    handy: {
      title: "Phone / internet contract", hint: "After the minimum term you can usually cancel at short notice – a good time to compare prices.",
      labels: { what: "Provider", start: "Contract start", term: "Minimum term (months)" }, ph: { what: "e.g. Vodafone" },
      name: "{what} contract – minimum term ends", name0: "Phone / internet contract – minimum term ends"
    },
    versicherung: {
      title: "Insurance (home, liability …)", hint: "Your cancellation has to reach the insurer by this day. Otherwise the policy usually renews for another year.",
      labels: { what: "Which insurance?", end: "Policy ends on", notice: "Notice period (months)" }, ph: { what: "e.g. home insurance" },
      name: "{what} – last day to cancel", name0: "Insurance – last day to cancel"
    },
    strom: {
      title: "Electricity / gas contract", hint: "After the initial term you can usually cancel at short notice. Comparing prices once a year pays off.",
      labels: { what: "Provider", start: "Contract start", term: "Initial term (months)" }, ph: { what: "e.g. EDF" },
      name: "{what} energy – compare prices", name0: "Electricity / gas – compare prices"
    },
    abo: {
      title: "Subscription / gym", hint: "After the minimum term you can usually cancel at short notice.",
      labels: { what: "What?", start: "Contract start", term: "Minimum term (months)" }, ph: { what: "e.g. gym" },
      name: "{what} – minimum term ends", name0: "Subscription – minimum term ends"
    },
    zahnarzt: { title: "Dental check-up", hint: "Most dentists recommend a check-up every 6 months.", labels: { date: "Last check-up" } },
    checkup: { title: "Health check-up", hint: "Regular check-ups help to spot problems early.", labels: { date: "Last check-up" } },
    tetanus: { title: "Tetanus booster", hint: "Tetanus and diphtheria boosters are usually recommended every 10 years.", labels: { date: "Last vaccination" } },
    arzttermin: { title: "Doctor's appointment", labels: { who: "With whom?", date: "Date" }, ph: { who: "e.g. Dr Smith" }, name: "Doctor's appointment – {what}", name0: "Doctor's appointment" },
    rechnung: { title: "Pay a bill", labels: { what: "What for?", date: "Due on" }, ph: { what: "e.g. electricity" }, name: "Bill – {what}", name0: "Pay a bill" },
    eigene: { title: "Your own deadline", labels: { title: "What?", date: "Due on", every: "Repeats" }, ph: { title: "e.g. renew parking permit" } },
    demo: { bill: "Electricity", phone: "Vodafone" }
  },
  it: {
    cat: { doc: "Documenti", car: "Auto", contract: "Contratti e assicurazioni", health: "Salute", family: "Famiglia e bambini", money: "Pagamenti", own: "Personalizzata" },
    geburtstag: { title: "Compleanno / onomastico", hint: "Livo ti avvisa ogni anno una settimana prima – c'è tempo per il regalo.", labels: { who: "Di chi è il compleanno?", date: "Data (l'anno non conta)" }, ph: { who: "es. mamma, Anna" }, name: "Compleanno di {what}", name0: "Compleanno" },
    hochzeitstag: { title: "Anniversario di matrimonio", hint: "Livo ti avvisa ogni anno una settimana prima.", labels: { date: "Data del matrimonio (l'anno non conta)" }, name0: "Anniversario di matrimonio" },
    kinderarzt: { title: "Pediatra (controllo, vaccino)", hint: "Controlli e vaccini sono indicati nel libretto sanitario del bambino – prenota per tempo.", labels: { who: "Per chi?", date: "Appuntamento il" }, ph: { who: "es. Giulia" }, name: "Pediatra – {what}", name0: "Pediatra" },
    schule: { title: "Asilo e scuola", hint: "Le iscrizioni hanno spesso scadenze fisse – meglio segnarle presto.", labels: { what: "Cosa?", date: "Data" }, ph: { what: "es. colloquio con le maestre" }, name: "{what}", name0: "Asilo e scuola" },
    kinderpass: { title: "Documento / passaporto (bambino)", hint: "Per viaggiare i bambini hanno bisogno di un documento proprio. Richiedi i nuovi documenti per tempo – ci vogliono alcune settimane.", labels: { who: "Per chi?", date: "Valido fino al" }, ph: { who: "es. Giulia" }, name: "Documento – {what}", name0: "Documento / passaporto (bambino)" },
    personalausweis: { title: "Carta d'identità", hint: "Prenota per tempo il rinnovo in Comune – possono volerci alcune settimane.", labels: { date: "Valida fino al" } },
    reisepass: { title: "Passaporto", hint: "Molti Paesi richiedono almeno 6 mesi di validità residua all'ingresso.", labels: { date: "Valido fino al" } },
    fuehrerschein: { title: "Patente", hint: "La data di scadenza è sulla patente (campo 4b). Per il rinnovo serve una visita medica.", labels: { date: "Valida fino al (campo 4b)" } },
    aufenthaltstitel: { title: "Permesso di soggiorno", hint: "Chiedi il rinnovo per tempo – gli appuntamenti sono spesso pochi.", labels: { date: "Valido fino al" } },
    tuev: { title: "Revisione auto", hint: "Di solito ogni 2 anni – la data è sul libretto di circolazione o sull'ultimo certificato di revisione.", labels: { month: "Prossima revisione (mese e anno)" }, ph: { month: "es. 2027-04" } },
    inspektion: { title: "Tagliando auto", hint: "Lo trovi nel libretto di manutenzione o sul display dell'auto.", labels: { date: "Prossimo tagliando il" } },
    handy: {
      title: "Contratto telefono / internet", hint: "Dopo il vincolo di solito puoi disdire in qualsiasi momento – un buon momento per confrontare le offerte.",
      labels: { what: "Operatore", start: "Inizio contratto", term: "Durata del vincolo (mesi)" }, ph: { what: "es. TIM" },
      name: "Contratto {what} – fine vincolo", name0: "Telefono / internet – fine vincolo"
    },
    versicherung: {
      title: "Assicurazione (casa, RC …)", hint: "Entro questo giorno la disdetta deve arrivare all'assicurazione. Altrimenti di solito il contratto si rinnova per un anno.",
      labels: { what: "Quale assicurazione?", end: "Il contratto scade il", notice: "Preavviso di disdetta (mesi)" }, ph: { what: "es. assicurazione casa" },
      name: "{what} – ultimo giorno per disdire", name0: "Assicurazione – ultimo giorno per disdire"
    },
    strom: {
      title: "Contratto luce / gas", hint: "Puoi cambiare fornitore quando l'offerta scade. Confrontare i prezzi una volta l'anno conviene.",
      labels: { what: "Fornitore", start: "Inizio contratto", term: "Durata dell'offerta (mesi)" }, ph: { what: "es. Enel" },
      name: "Luce/gas {what} – confronta i prezzi", name0: "Luce / gas – confronta i prezzi"
    },
    abo: {
      title: "Abbonamento / palestra", hint: "Dopo la durata minima di solito puoi disdire con breve preavviso.",
      labels: { what: "Cosa?", start: "Inizio", term: "Durata minima (mesi)" }, ph: { what: "es. palestra" },
      name: "{what} – fine durata minima", name0: "Abbonamento – fine durata minima"
    },
    zahnarzt: { title: "Controllo dal dentista", hint: "Molti dentisti consigliano un controllo ogni 6 mesi.", labels: { date: "Ultimo controllo" } },
    checkup: { title: "Check-up", hint: "Controlli regolari aiutano a scoprire i problemi in tempo.", labels: { date: "Ultimo check-up" } },
    tetanus: { title: "Richiamo antitetanica", hint: "Il richiamo per tetano e difterite di solito si fa ogni 10 anni.", labels: { date: "Ultima vaccinazione" } },
    arzttermin: { title: "Visita medica", labels: { who: "Da chi?", date: "Data" }, ph: { who: "es. dott.ssa Rossi" }, name: "Visita – {what}", name0: "Visita medica" },
    rechnung: { title: "Pagare una bolletta", labels: { what: "Per cosa?", date: "Scade il" }, ph: { what: "es. luce" }, name: "Bolletta – {what}", name0: "Pagare una bolletta" },
    eigene: { title: "Scadenza personalizzata", labels: { title: "Cosa?", date: "Scade il", every: "Ripetizione" }, ph: { title: "es. rinnovare il permesso ZTL" } },
    demo: { bill: "Luce", phone: "TIM" }
  },
  el: {
    cat: { doc: "Έγγραφα", car: "Αυτοκίνητο", contract: "Συμβόλαια & ασφάλειες", health: "Υγεία", family: "Οικογένεια & παιδιά", money: "Πληρωμές", own: "Δικές σου" },
    geburtstag: { title: "Γενέθλια / γιορτή", hint: "Το Livo σε ειδοποιεί κάθε χρόνο μία εβδομάδα πριν – έχεις χρόνο για δώρο.", labels: { who: "Ποιος γιορτάζει;", date: "Ημερομηνία (το έτος δεν παίζει ρόλο)" }, ph: { who: "π.χ. μαμά, Μαρία" }, name: "Γενέθλια – {what}", name0: "Γενέθλια" },
    hochzeitstag: { title: "Επέτειος γάμου", hint: "Το Livo σε ειδοποιεί κάθε χρόνο μία εβδομάδα πριν.", labels: { date: "Ημερομηνία γάμου (το έτος δεν παίζει ρόλο)" }, name0: "Επέτειος γάμου" },
    kinderarzt: { title: "Παιδίατρος (έλεγχος, εμβόλιο)", hint: "Οι έλεγχοι και τα εμβόλια γράφονται στο βιβλιάριο υγείας του παιδιού – κλείσε ραντεβού νωρίς.", labels: { who: "Για ποιον;", date: "Ραντεβού στις" }, ph: { who: "π.χ. Ελένη" }, name: "Παιδίατρος – {what}", name0: "Παιδίατρος" },
    schule: { title: "Παιδικός σταθμός & σχολείο", hint: "Οι εγγραφές έχουν συχνά σταθερές προθεσμίες – καλύτερα να τις καταχωρίσεις νωρίς.", labels: { what: "Τι;", date: "Ημερομηνία" }, ph: { what: "π.χ. συνάντηση γονέων" }, name: "{what}", name0: "Παιδικός σταθμός & σχολείο" },
    kinderpass: { title: "Ταυτότητα / διαβατήριο (παιδί)", hint: "Τα παιδιά χρειάζονται δικό τους έγγραφο για ταξίδια. Κάνε αίτηση για νέα έγγραφα έγκαιρα – χρειάζονται μερικές εβδομάδες.", labels: { who: "Για ποιον;", date: "Ισχύει έως" }, ph: { who: "π.χ. Ελένη" }, name: "Ταυτότητα / διαβατήριο – {what}", name0: "Ταυτότητα / διαβατήριο (παιδί)" },
    personalausweis: { title: "Ταυτότητα", hint: "Κλείσε έγκαιρα ραντεβού για νέα ταυτότητα – μπορεί να χρειαστούν μερικές εβδομάδες.", labels: { date: "Ισχύει έως" } },
    reisepass: { title: "Διαβατήριο", hint: "Πολλές χώρες ζητούν τουλάχιστον 6 μήνες ισχύ κατά την είσοδο.", labels: { date: "Ισχύει έως" } },
    fuehrerschein: { title: "Δίπλωμα οδήγησης", hint: "Η ημερομηνία λήξης γράφεται στο δίπλωμα (πεδίο 4β).", labels: { date: "Ισχύει έως (πεδίο 4β)" } },
    aufenthaltstitel: { title: "Άδεια διαμονής", hint: "Κάνε νωρίς την αίτηση ανανέωσης – τα ραντεβού συχνά αργούν.", labels: { date: "Ισχύει έως" } },
    tuev: { title: "ΚΤΕΟ", hint: "Συνήθως κάθε 2 χρόνια – η ημερομηνία γράφεται στο δελτίο του τελευταίου ελέγχου.", labels: { month: "Επόμενο ΚΤΕΟ (μήνας και έτος)" }, ph: { month: "π.χ. 2027-04" } },
    inspektion: { title: "Σέρβις αυτοκινήτου", hint: "Θα το βρεις στο βιβλίο σέρβις ή στην οθόνη του αυτοκινήτου.", labels: { date: "Επόμενο σέρβις στις" } },
    handy: {
      title: "Συμβόλαιο κινητού / internet", hint: "Μετά τη δέσμευση μπορείς συνήθως να το λύσεις οποτεδήποτε – καλή στιγμή για σύγκριση τιμών.",
      labels: { what: "Πάροχος", start: "Έναρξη συμβολαίου", term: "Διάρκεια δέσμευσης (μήνες)" }, ph: { what: "π.χ. Cosmote" },
      name: "Συμβόλαιο {what} – λήξη δέσμευσης", name0: "Κινητό / internet – λήξη δέσμευσης"
    },
    versicherung: {
      title: "Ασφάλεια (σπιτιού, αστική ευθύνη …)", hint: "Μέχρι αυτή τη μέρα πρέπει να φτάσει η καταγγελία στην ασφαλιστική. Αλλιώς το συμβόλαιο συνήθως ανανεώνεται για έναν χρόνο.",
      labels: { what: "Ποια ασφάλεια;", end: "Το συμβόλαιο λήγει στις", notice: "Προθεσμία καταγγελίας (μήνες)" }, ph: { what: "π.χ. ασφάλεια σπιτιού" },
      name: "{what} – τελευταία μέρα καταγγελίας", name0: "Ασφάλεια – τελευταία μέρα καταγγελίας"
    },
    strom: {
      title: "Ρεύμα / φυσικό αέριο", hint: "Μπορείς να αλλάξεις πάροχο όταν λήξει η προσφορά. Η σύγκριση τιμών μία φορά τον χρόνο αξίζει.",
      labels: { what: "Πάροχος", start: "Έναρξη συμβολαίου", term: "Διάρκεια προσφοράς (μήνες)" }, ph: { what: "π.χ. ΔΕΗ" },
      name: "Ρεύμα/αέριο {what} – σύγκρινε τιμές", name0: "Ρεύμα / αέριο – σύγκρινε τιμές"
    },
    abo: {
      title: "Συνδρομή / γυμναστήριο", hint: "Μετά την ελάχιστη διάρκεια μπορείς συνήθως να ακυρώσεις με σύντομη προειδοποίηση.",
      labels: { what: "Τι;", start: "Έναρξη", term: "Ελάχιστη διάρκεια (μήνες)" }, ph: { what: "π.χ. γυμναστήριο" },
      name: "{what} – λήξη ελάχιστης διάρκειας", name0: "Συνδρομή – λήξη ελάχιστης διάρκειας"
    },
    zahnarzt: { title: "Έλεγχος στον οδοντίατρο", hint: "Οι περισσότεροι οδοντίατροι προτείνουν έλεγχο κάθε 6 μήνες.", labels: { date: "Τελευταίος έλεγχος" } },
    checkup: { title: "Τσεκ-απ υγείας", hint: "Οι τακτικές εξετάσεις βοηθούν να εντοπιστούν προβλήματα έγκαιρα.", labels: { date: "Τελευταίο τσεκ-απ" } },
    tetanus: { title: "Αναμνηστικό αντιτετανικό", hint: "Η αναμνηστική δόση για τέτανο και διφθερίτιδα γίνεται συνήθως κάθε 10 χρόνια.", labels: { date: "Τελευταίο εμβόλιο" } },
    arzttermin: { title: "Ραντεβού με γιατρό", labels: { who: "Με ποιον;", date: "Ημερομηνία" }, ph: { who: "π.χ. Δρ. Παπαδόπουλος" }, name: "Γιατρός – {what}", name0: "Ραντεβού με γιατρό" },
    rechnung: { title: "Πληρωμή λογαριασμού", labels: { what: "Για τι;", date: "Λήγει στις" }, ph: { what: "π.χ. ρεύμα" }, name: "Λογαριασμός – {what}", name0: "Πληρωμή λογαριασμού" },
    eigene: { title: "Δική σου προθεσμία", labels: { title: "Τι;", date: "Λήγει στις", every: "Επανάληψη" }, ph: { title: "π.χ. ανανέωση κάρτας στάθμευσης" } },
    demo: { bill: "ΔΕΗ", phone: "Cosmote" }
  },
  es: {
    cat: { doc: "Documentos", car: "Coche", contract: "Contratos y seguros", health: "Salud", family: "Familia e hijos", money: "Pagos", own: "Personalizado" },
    geburtstag: { title: "Cumpleaños", hint: "Livo te avisa cada año una semana antes – hay tiempo para el regalo.", labels: { who: "¿De quién es el cumpleaños?", date: "Cumpleaños (da igual el año)" }, ph: { who: "p. ej. mamá, Ana" }, name: "Cumpleaños de {what}", name0: "Cumpleaños" },
    hochzeitstag: { title: "Aniversario de boda", hint: "Livo te avisa cada año una semana antes.", labels: { date: "Fecha de la boda (da igual el año)" }, name0: "Aniversario de boda" },
    kinderarzt: { title: "Pediatra (revisión, vacuna)", hint: "Las revisiones y vacunas están en la cartilla de salud del niño – pide cita con tiempo.", labels: { who: "¿Para quién?", date: "Cita el" }, ph: { who: "p. ej. Lucía" }, name: "Pediatra – {what}", name0: "Pediatra" },
    schule: { title: "Guardería y colegio", hint: "Las inscripciones suelen tener plazos fijos – mejor anotarlas pronto.", labels: { what: "¿Qué?", date: "Fecha" }, ph: { what: "p. ej. reunión de padres" }, name: "{what}", name0: "Guardería y colegio" },
    kinderpass: { title: "DNI / pasaporte (niño)", hint: "Los niños necesitan su propio documento para viajar. Solicita los nuevos documentos con tiempo – tarda unas semanas.", labels: { who: "¿Para quién?", date: "Válido hasta" }, ph: { who: "p. ej. Lucía" }, name: "DNI / pasaporte – {what}", name0: "DNI / pasaporte (niño)" },
    personalausweis: { title: "DNI / documento de identidad", hint: "Pide cita para renovarlo con tiempo – a veces tarda unas semanas.", labels: { date: "Válido hasta" } },
    reisepass: { title: "Pasaporte", hint: "Muchos países exigen al menos 6 meses de validez al entrar.", labels: { date: "Válido hasta" } },
    fuehrerschein: { title: "Carnet de conducir", hint: "La fecha de caducidad está en el carnet (campo 4b). Para renovarlo hace falta un reconocimiento médico.", labels: { date: "Válido hasta (campo 4b)" } },
    aufenthaltstitel: { title: "Permiso de residencia", hint: "Solicita la renovación con tiempo – las citas suelen escasear.", labels: { date: "Válido hasta" } },
    tuev: { title: "ITV", hint: "Según la antigüedad del coche, cada 1 o 2 años – la fecha está en la tarjeta ITV o en la pegatina.", labels: { month: "Próxima ITV (mes y año)" }, ph: { month: "p. ej. 2027-04" } },
    inspektion: { title: "Revisión del coche", hint: "Viene en el libro de mantenimiento o aparece en la pantalla del coche.", labels: { date: "Próxima revisión el" } },
    handy: {
      title: "Contrato de móvil / internet", hint: "Al terminar la permanencia normalmente puedes darte de baja cuando quieras – buen momento para comparar precios.",
      labels: { what: "Compañía", start: "Inicio del contrato", term: "Permanencia (meses)" }, ph: { what: "p. ej. Movistar" },
      name: "Contrato {what} – fin de permanencia", name0: "Móvil / internet – fin de permanencia"
    },
    versicherung: {
      title: "Seguro (hogar, responsabilidad civil …)", hint: "Tu baja tiene que llegar a la aseguradora antes de este día. Si no, la póliza suele renovarse un año más.",
      labels: { what: "¿Qué seguro?", end: "La póliza vence el", notice: "Preaviso (meses)" }, ph: { what: "p. ej. seguro de hogar" },
      name: "{what} – último día para darse de baja", name0: "Seguro – último día para darse de baja"
    },
    strom: {
      title: "Contrato de luz / gas", hint: "Puedes cambiar de compañía cuando termine la oferta. Comparar precios una vez al año compensa.",
      labels: { what: "Compañía", start: "Inicio del contrato", term: "Duración de la oferta (meses)" }, ph: { what: "p. ej. Iberdrola" },
      name: "Luz/gas {what} – comparar precios", name0: "Luz / gas – comparar precios"
    },
    abo: {
      title: "Suscripción / gimnasio", hint: "Tras la permanencia mínima normalmente puedes darte de baja con poca antelación.",
      labels: { what: "¿Qué?", start: "Inicio", term: "Permanencia mínima (meses)" }, ph: { what: "p. ej. gimnasio" },
      name: "{what} – fin de permanencia", name0: "Suscripción – fin de permanencia"
    },
    zahnarzt: { title: "Revisión dental", hint: "La mayoría de los dentistas recomienda una revisión cada 6 meses.", labels: { date: "Última revisión" } },
    checkup: { title: "Chequeo médico", hint: "Los chequeos regulares ayudan a detectar problemas a tiempo.", labels: { date: "Último chequeo" } },
    tetanus: { title: "Refuerzo del tétanos", hint: "El refuerzo de tétanos y difteria suele recomendarse cada 10 años.", labels: { date: "Última vacuna" } },
    arzttermin: { title: "Cita médica", labels: { who: "¿Con quién?", date: "Fecha" }, ph: { who: "p. ej. Dra. García" }, name: "Cita médica – {what}", name0: "Cita médica" },
    rechnung: { title: "Pagar una factura", labels: { what: "¿De qué?", date: "Vence el" }, ph: { what: "p. ej. luz" }, name: "Factura – {what}", name0: "Pagar una factura" },
    eigene: { title: "Plazo personalizado", labels: { title: "¿Qué?", date: "Vence el", every: "Repetición" }, ph: { title: "p. ej. renovar la tarjeta de aparcamiento" } },
    demo: { bill: "Luz", phone: "Movistar" }
  },
  fr: {
    cat: { doc: "Papiers d'identité", car: "Voiture", contract: "Contrats et assurances", health: "Santé", family: "Famille & enfants", money: "Paiements", own: "Personnalisé" },
    geburtstag: { title: "Anniversaire", hint: "Livo vous prévient chaque année une semaine avant – le temps de trouver un cadeau.", labels: { who: "L'anniversaire de qui ?", date: "Date d'anniversaire (peu importe l'année)" }, ph: { who: "p. ex. maman, Léa" }, name: "Anniversaire de {what}", name0: "Anniversaire" },
    hochzeitstag: { title: "Anniversaire de mariage", hint: "Livo vous prévient chaque année une semaine avant.", labels: { date: "Date du mariage (peu importe l'année)" }, name0: "Anniversaire de mariage" },
    kinderarzt: { title: "Pédiatre (visite, vaccin)", hint: "Les visites et les vaccins figurent dans le carnet de santé de l'enfant – prenez rendez-vous tôt.", labels: { who: "Pour qui ?", date: "Rendez-vous le" }, ph: { who: "p. ex. Léa" }, name: "Pédiatre – {what}", name0: "Pédiatre" },
    schule: { title: "Crèche & école", hint: "Les inscriptions ont souvent des dates limites – mieux vaut les noter tôt.", labels: { what: "Quoi ?", date: "Date" }, ph: { what: "p. ex. réunion parents-profs" }, name: "{what}", name0: "Crèche & école" },
    kinderpass: { title: "Pièce d'identité / passeport (enfant)", hint: "Les enfants ont besoin de leur propre document pour voyager. Demandez les nouveaux documents à temps – cela prend quelques semaines.", labels: { who: "Pour qui ?", date: "Valable jusqu'au" }, ph: { who: "p. ex. Léa" }, name: "Identité / passeport – {what}", name0: "Pièce d'identité / passeport (enfant)" },
    personalausweis: { title: "Carte d'identité", hint: "Prenez rendez-vous à temps pour le renouvellement – les délais peuvent atteindre plusieurs semaines.", labels: { date: "Valable jusqu'au" } },
    reisepass: { title: "Passeport", hint: "Beaucoup de pays exigent au moins 6 mois de validité à l'entrée.", labels: { date: "Valable jusqu'au" } },
    fuehrerschein: { title: "Permis de conduire", hint: "La date de fin de validité figure sur le permis (case 4b). Le permis au format carte se renouvelle tous les 15 ans.", labels: { date: "Valable jusqu'au (case 4b)" } },
    aufenthaltstitel: { title: "Titre de séjour", hint: "Demandez le renouvellement tôt – les rendez-vous sont souvent rares.", labels: { date: "Valable jusqu'au" } },
    tuev: { title: "Contrôle technique", hint: "En général tous les 2 ans – la date figure sur le dernier procès-verbal de contrôle.", labels: { month: "Prochain contrôle (mois et année)" }, ph: { month: "ex. 2027-04" } },
    inspektion: { title: "Révision de la voiture", hint: "Indiquée dans le carnet d'entretien ou sur l'écran de la voiture.", labels: { date: "Prochaine révision le" } },
    handy: {
      title: "Forfait mobile / box internet", hint: "Après la durée d'engagement, vous pouvez généralement résilier à tout moment – le bon moment pour comparer les prix.",
      labels: { what: "Opérateur", start: "Début du contrat", term: "Durée d'engagement (mois)" }, ph: { what: "ex. Orange" },
      name: "Forfait {what} – fin d'engagement", name0: "Mobile / internet – fin d'engagement"
    },
    versicherung: {
      title: "Assurance (habitation, responsabilité …)", hint: "Votre résiliation doit parvenir à l'assureur avant ce jour. Sinon, le contrat est souvent reconduit pour un an.",
      labels: { what: "Quelle assurance ?", end: "Le contrat se termine le", notice: "Préavis (mois)" }, ph: { what: "ex. assurance habitation" },
      name: "{what} – dernier jour pour résilier", name0: "Assurance – dernier jour pour résilier"
    },
    strom: {
      title: "Électricité / gaz", hint: "Vous pouvez changer de fournisseur. Comparer les prix une fois par an vaut la peine.",
      labels: { what: "Fournisseur", start: "Début du contrat", term: "Durée de l'offre (mois)" }, ph: { what: "ex. EDF" },
      name: "Énergie {what} – comparer les prix", name0: "Électricité / gaz – comparer les prix"
    },
    abo: {
      title: "Abonnement / salle de sport", hint: "Après la durée minimale, vous pouvez généralement résilier avec un court préavis.",
      labels: { what: "Quoi ?", start: "Début", term: "Durée minimale (mois)" }, ph: { what: "ex. salle de sport" },
      name: "{what} – fin de la durée minimale", name0: "Abonnement – fin de la durée minimale"
    },
    zahnarzt: { title: "Contrôle chez le dentiste", hint: "Beaucoup de dentistes conseillent un contrôle tous les 6 mois.", labels: { date: "Dernier contrôle" } },
    checkup: { title: "Bilan de santé", hint: "Des bilans réguliers aident à détecter les problèmes tôt.", labels: { date: "Dernier bilan" } },
    tetanus: { title: "Rappel du tétanos", hint: "Le rappel tétanos-diphtérie se fait en général tous les 10 ans environ.", labels: { date: "Dernière vaccination" } },
    arzttermin: { title: "Rendez-vous médical", labels: { who: "Avec qui ?", date: "Date" }, ph: { who: "ex. Dr Martin" }, name: "Rendez-vous – {what}", name0: "Rendez-vous médical" },
    rechnung: { title: "Payer une facture", labels: { what: "Pour quoi ?", date: "À payer le" }, ph: { what: "ex. électricité" }, name: "Facture – {what}", name0: "Payer une facture" },
    eigene: { title: "Échéance personnalisée", labels: { title: "Quoi ?", date: "Échéance le", every: "Répétition" }, ph: { title: "ex. renouveler la carte de stationnement" } },
    demo: { bill: "Électricité", phone: "Orange" }
  },
  nl: {
    cat: { doc: "Documenten", car: "Auto", contract: "Contracten & verzekeringen", health: "Gezondheid", family: "Gezin & kinderen", money: "Betalingen", own: "Eigen" },
    geburtstag: { title: "Verjaardag", hint: "Livo herinnert je elk jaar een week van tevoren – genoeg tijd voor een cadeau.", labels: { who: "Wie is er jarig?", date: "Verjaardag (het jaar maakt niet uit)" }, ph: { who: "bijv. mama, Emma" }, name: "Verjaardag {what}", name0: "Verjaardag" },
    hochzeitstag: { title: "Trouwdag", hint: "Livo herinnert je elk jaar een week van tevoren.", labels: { date: "Trouwdatum (het jaar maakt niet uit)" }, name0: "Trouwdag" },
    kinderarzt: { title: "Consultatiebureau / kinderarts", hint: "Controles en vaccinaties staan in het groeiboekje of het vaccinatieoverzicht – maak op tijd een afspraak.", labels: { who: "Voor wie?", date: "Afspraak op" }, ph: { who: "bijv. Emma" }, name: "Kinderarts – {what}", name0: "Kinderarts" },
    schule: { title: "Opvang & school", hint: "Voor inschrijvingen gelden vaak vaste termijnen – zet ze er op tijd in.", labels: { what: "Wat?", date: "Datum" }, ph: { what: "bijv. ouderavond" }, name: "{what}", name0: "Opvang & school" },
    kinderpass: { title: "ID / paspoort (kind)", hint: "Kinderen hebben een eigen reisdocument nodig. Vraag nieuwe documenten op tijd aan – dat duurt een paar weken.", labels: { who: "Voor wie?", date: "Geldig tot" }, ph: { who: "bijv. Emma" }, name: "ID / paspoort – {what}", name0: "ID / paspoort (kind)" },
    personalausweis: { title: "Identiteitskaart", hint: "Vraag op tijd een nieuwe aan bij de gemeente – het maken duurt een paar weken.", labels: { date: "Geldig tot" } },
    reisepass: { title: "Paspoort", hint: "Veel landen eisen bij inreis nog minstens 6 maanden geldigheid.", labels: { date: "Geldig tot" } },
    fuehrerschein: { title: "Rijbewijs", hint: "De vervaldatum staat op je rijbewijs (veld 4b). Een rijbewijs is meestal 10 jaar geldig.", labels: { date: "Geldig tot (veld 4b)" } },
    aufenthaltstitel: { title: "Verblijfsvergunning", hint: "Vraag de verlenging op tijd aan – afspraken zijn vaak schaars.", labels: { date: "Geldig tot" } },
    tuev: { title: "APK / autokeuring", hint: "Bij oudere auto's meestal elk jaar – de vervaldatum staat op je keuringsbewijs.", labels: { month: "Volgende keuring (maand en jaar)" }, ph: { month: "bijv. 2027-04" } },
    inspektion: { title: "Onderhoudsbeurt", hint: "Staat in je onderhoudsboekje of op het display van de auto.", labels: { date: "Volgende beurt op" } },
    handy: {
      title: "Telefoon- / internetabonnement", hint: "Na de minimale looptijd kun je meestal maandelijks opzeggen – een goed moment om prijzen te vergelijken.",
      labels: { what: "Provider", start: "Start contract", term: "Minimale looptijd (maanden)" }, ph: { what: "bijv. KPN" },
      name: "Abonnement {what} – looptijd eindigt", name0: "Telefoon / internet – looptijd eindigt"
    },
    versicherung: {
      title: "Verzekering (inboedel, aansprakelijkheid …)", hint: "Vóór deze dag moet je opzegging bij de verzekeraar binnen zijn. Anders wordt de polis meestal verlengd.",
      labels: { what: "Welke verzekering?", end: "Polis loopt af op", notice: "Opzegtermijn (maanden)" }, ph: { what: "bijv. inboedelverzekering" },
      name: "{what} – laatste dag om op te zeggen", name0: "Verzekering – laatste dag om op te zeggen"
    },
    strom: {
      title: "Energiecontract", hint: "Na de looptijd kun je overstappen. Eén keer per jaar prijzen vergelijken loont.",
      labels: { what: "Leverancier", start: "Start contract", term: "Looptijd (maanden)" }, ph: { what: "bijv. Eneco" },
      name: "Energie {what} – prijzen vergelijken", name0: "Energie – prijzen vergelijken"
    },
    abo: {
      title: "Abonnement / sportschool", hint: "Na de minimale looptijd kun je meestal met een korte termijn opzeggen.",
      labels: { what: "Wat?", start: "Start", term: "Minimale looptijd (maanden)" }, ph: { what: "bijv. sportschool" },
      name: "{what} – looptijd eindigt", name0: "Abonnement – looptijd eindigt"
    },
    zahnarzt: { title: "Tandartscontrole", hint: "De meeste tandartsen raden elke 6 maanden een controle aan.", labels: { date: "Laatste controle" } },
    checkup: { title: "Gezondheidscheck", hint: "Regelmatige checks helpen om problemen vroeg te ontdekken.", labels: { date: "Laatste check" } },
    tetanus: { title: "Tetanusprik herhalen", hint: "Een herhaling tegen tetanus en difterie wordt meestal elke 10 jaar aangeraden.", labels: { date: "Laatste prik" } },
    arzttermin: { title: "Doktersafspraak", labels: { who: "Bij wie?", date: "Datum" }, ph: { who: "bijv. huisarts Jansen" }, name: "Afspraak – {what}", name0: "Doktersafspraak" },
    rechnung: { title: "Rekening betalen", labels: { what: "Waarvoor?", date: "Betalen vóór" }, ph: { what: "bijv. energie" }, name: "Rekening – {what}", name0: "Rekening betalen" },
    eigene: { title: "Eigen deadline", labels: { title: "Wat?", date: "Datum", every: "Herhalen" }, ph: { title: "bijv. parkeervergunning verlengen" } },
    demo: { bill: "Energie", phone: "KPN" }
  },
  pt: {
    cat: { doc: "Documentos", car: "Carro", contract: "Contratos e seguros", health: "Saúde", family: "Família e filhos", money: "Pagamentos", own: "Personalizado" },
    geburtstag: { title: "Aniversário", hint: "O Livo envia um lembrete todos os anos, uma semana antes – há tempo para o presente.", labels: { who: "De quem é o aniversário?", date: "Aniversário (o ano não importa)" }, ph: { who: "p. ex. mãe, Ana" }, name: "Aniversário de {what}", name0: "Aniversário" },
    hochzeitstag: { title: "Aniversário de casamento", hint: "O Livo envia um lembrete todos os anos, uma semana antes.", labels: { date: "Data do casamento (o ano não importa)" }, name0: "Aniversário de casamento" },
    kinderarzt: { title: "Pediatra (consulta, vacina)", hint: "As consultas e vacinas constam do boletim de saúde da criança – marque a consulta com antecedência.", labels: { who: "Para quem?", date: "Consulta a" }, ph: { who: "p. ex. Inês" }, name: "Pediatra – {what}", name0: "Pediatra" },
    schule: { title: "Creche e escola", hint: "As inscrições têm muitas vezes prazos fixos – é melhor registá-los cedo.", labels: { what: "O quê?", date: "Data" }, ph: { what: "p. ex. reunião de pais" }, name: "{what}", name0: "Creche e escola" },
    kinderpass: { title: "Documento / passaporte (criança)", hint: "As crianças precisam do seu próprio documento para viajar. Peça os novos documentos a tempo – demora algumas semanas.", labels: { who: "Para quem?", date: "Válido até" }, ph: { who: "p. ex. Inês" }, name: "Documento – {what}", name0: "Documento / passaporte (criança)" },
    personalausweis: { title: "Cartão de Cidadão / identidade", hint: "Peça a renovação com antecedência – pode demorar algumas semanas.", labels: { date: "Válido até" } },
    reisepass: { title: "Passaporte", hint: "Muitos países exigem pelo menos 6 meses de validade à entrada.", labels: { date: "Válido até" } },
    fuehrerschein: { title: "Carta de condução", hint: "A data de validade está na carta (campo 4b). Renove a tempo para poder continuar a conduzir.", labels: { date: "Válida até (campo 4b)" } },
    aufenthaltstitel: { title: "Autorização de residência", hint: "Peça a renovação cedo – as marcações costumam ser difíceis.", labels: { date: "Válida até" } },
    tuev: { title: "Inspeção do carro", hint: "Conforme a idade do carro, a cada 1 ou 2 anos – a data está no último certificado de inspeção.", labels: { month: "Próxima inspeção (mês e ano)" }, ph: { month: "ex.: 2027-04" } },
    inspektion: { title: "Revisão do carro", hint: "Está no livro de manutenção ou aparece no painel do carro.", labels: { date: "Próxima revisão em" } },
    handy: {
      title: "Contrato de telemóvel / internet", hint: "Depois do período de fidelização pode normalmente cancelar a qualquer momento – boa altura para comparar preços.",
      labels: { what: "Operadora", start: "Início do contrato", term: "Fidelização (meses)" }, ph: { what: "ex.: MEO" },
      name: "Contrato {what} – fim da fidelização", name0: "Telemóvel / internet – fim da fidelização"
    },
    versicherung: {
      title: "Seguro (casa, responsabilidade civil …)", hint: "O cancelamento tem de chegar à seguradora até este dia. Caso contrário, a apólice costuma renovar por mais um ano.",
      labels: { what: "Que seguro?", end: "A apólice termina em", notice: "Pré-aviso (meses)" }, ph: { what: "ex.: seguro de casa" },
      name: "{what} – último dia para cancelar", name0: "Seguro – último dia para cancelar"
    },
    strom: {
      title: "Contrato de luz / gás", hint: "Pode mudar de fornecedor. Comparar preços uma vez por ano compensa.",
      labels: { what: "Fornecedor", start: "Início do contrato", term: "Duração da oferta (meses)" }, ph: { what: "ex.: EDP" },
      name: "Luz/gás {what} – comparar preços", name0: "Luz / gás – comparar preços"
    },
    abo: {
      title: "Subscrição / ginásio", hint: "Depois do período mínimo pode normalmente cancelar com pouco pré-aviso.",
      labels: { what: "O quê?", start: "Início", term: "Período mínimo (meses)" }, ph: { what: "ex.: ginásio" },
      name: "{what} – fim do período mínimo", name0: "Subscrição – fim do período mínimo"
    },
    zahnarzt: { title: "Consulta no dentista", hint: "A maioria dos dentistas recomenda uma consulta a cada 6 meses.", labels: { date: "Última consulta" } },
    checkup: { title: "Check-up", hint: "Exames regulares ajudam a detetar problemas cedo.", labels: { date: "Último check-up" } },
    tetanus: { title: "Reforço do tétano", hint: "O reforço contra tétano e difteria costuma ser recomendado a cada 10 anos.", labels: { date: "Última vacina" } },
    arzttermin: { title: "Consulta médica", labels: { who: "Com quem?", date: "Data" }, ph: { who: "ex.: Dra. Silva" }, name: "Consulta – {what}", name0: "Consulta médica" },
    rechnung: { title: "Pagar uma fatura", labels: { what: "De quê?", date: "Vence em" }, ph: { what: "ex.: luz" }, name: "Fatura – {what}", name0: "Pagar uma fatura" },
    eigene: { title: "Prazo personalizado", labels: { title: "O quê?", date: "Data", every: "Repetição" }, ph: { title: "ex.: renovar o dístico de estacionamento" } },
    demo: { bill: "Luz", phone: "MEO" }
  },
  tr: {
    cat: { doc: "Belgeler", car: "Araç", contract: "Sözleşmeler ve sigortalar", health: "Sağlık", family: "Aile & çocuklar", money: "Ödemeler", own: "Kendi" },
    geburtstag: { title: "Doğum günü", hint: "Livo her yıl bir hafta önceden hatırlatır – hediye için zaman kalır.", labels: { who: "Kimin doğum günü?", date: "Doğum günü (yıl önemli değil)" }, ph: { who: "ör. annem, Ayşe" }, name: "{what} – doğum günü", name0: "Doğum günü" },
    hochzeitstag: { title: "Evlilik yıldönümü", hint: "Livo her yıl bir hafta önceden hatırlatır.", labels: { date: "Evlilik tarihi (yıl önemli değil)" }, name0: "Evlilik yıldönümü" },
    kinderarzt: { title: "Çocuk doktoru (kontrol, aşı)", hint: "Kontroller ve aşılar çocuğun aşı kartında yazar – randevuyu erken al.", labels: { who: "Kimin için?", date: "Randevu tarihi" }, ph: { who: "ör. Elif" }, name: "Çocuk doktoru – {what}", name0: "Çocuk doktoru" },
    schule: { title: "Kreş & okul", hint: "Kayıtların çoğu zaman sabit son tarihleri olur – erkenden ekle.", labels: { what: "Ne?", date: "Tarih" }, ph: { what: "ör. veli toplantısı" }, name: "{what}", name0: "Kreş & okul" },
    kinderpass: { title: "Kimlik / pasaport (çocuk)", hint: "Çocukların seyahat için kendi belgesi olmalı. Yeni belgeye zamanında başvur – birkaç hafta sürer.", labels: { who: "Kimin için?", date: "Geçerlilik tarihi" }, ph: { who: "ör. Elif" }, name: "Kimlik / pasaport – {what}", name0: "Kimlik / pasaport (çocuk)" },
    personalausweis: { title: "Kimlik kartı", hint: "Yenilemek için zamanında randevu al – birkaç hafta sürebilir.", labels: { date: "Geçerlilik tarihi" } },
    reisepass: { title: "Pasaport", hint: "Birçok ülke girişte en az 6 ay geçerlilik ister.", labels: { date: "Geçerlilik tarihi" } },
    fuehrerschein: { title: "Ehliyet", hint: "Son geçerlilik tarihi ehliyetin üzerinde yazar (4b alanı).", labels: { date: "Geçerlilik tarihi (4b alanı)" } },
    aufenthaltstitel: { title: "Oturma izni", hint: "Uzatma başvurusunu erken yap – randevu bulmak çoğu zaman zor.", labels: { date: "Geçerlilik tarihi" } },
    tuev: { title: "Araç muayenesi", hint: "Genelde 2 yılda bir – tarih ruhsatta veya son muayene raporunda yazar.", labels: { month: "Sonraki muayene (ay ve yıl)" }, ph: { month: "örn. 2027-04" } },
    inspektion: { title: "Araç bakımı", hint: "Bakım kitapçığında veya aracın ekranında görünür.", labels: { date: "Sonraki bakım tarihi" } },
    handy: {
      title: "Telefon / internet sözleşmesi", hint: "Taahhüt bitince çoğu zaman istediğin zaman iptal edebilirsin – fiyatları karşılaştırmak için iyi bir an.",
      labels: { what: "Operatör", start: "Sözleşme başlangıcı", term: "Taahhüt süresi (ay)" }, ph: { what: "örn. Turkcell" },
      name: "{what} sözleşmesi – taahhüt bitiyor", name0: "Telefon / internet – taahhüt bitiyor"
    },
    versicherung: {
      title: "Sigorta (konut, kasko …)", hint: "İptal talebin bu güne kadar sigorta şirketine ulaşmalı. Yoksa poliçe genelde bir yıl daha yenilenir.",
      labels: { what: "Hangi sigorta?", end: "Poliçe bitiş tarihi", notice: "İptal bildirim süresi (ay)" }, ph: { what: "örn. konut sigortası" },
      name: "{what} – iptal için son gün", name0: "Sigorta – iptal için son gün"
    },
    strom: {
      title: "Elektrik / doğalgaz", hint: "Sözleşme bitince tedarikçini değiştirebilirsin. Yılda bir fiyat karşılaştırmak kazandırır.",
      labels: { what: "Tedarikçi", start: "Sözleşme başlangıcı", term: "Sözleşme süresi (ay)" }, ph: { what: "örn. Enerjisa" },
      name: "Enerji {what} – fiyatları karşılaştır", name0: "Elektrik / doğalgaz – fiyatları karşılaştır"
    },
    abo: {
      title: "Abonelik / spor salonu", hint: "Asgari süre bitince genelde kısa sürede iptal edebilirsin.",
      labels: { what: "Ne?", start: "Başlangıç", term: "Asgari süre (ay)" }, ph: { what: "örn. spor salonu" },
      name: "{what} – asgari süre bitiyor", name0: "Abonelik – asgari süre bitiyor"
    },
    zahnarzt: { title: "Diş kontrolü", hint: "Çoğu diş hekimi 6 ayda bir kontrol önerir.", labels: { date: "Son kontrol" } },
    checkup: { title: "Check-up", hint: "Düzenli kontroller sorunları erken fark etmeye yardımcı olur.", labels: { date: "Son check-up" } },
    tetanus: { title: "Tetanoz rapel aşısı", hint: "Tetanoz ve difteri rapel aşısı genelde 10 yılda bir önerilir.", labels: { date: "Son aşı" } },
    arzttermin: { title: "Doktor randevusu", labels: { who: "Kimde?", date: "Tarih" }, ph: { who: "örn. Dr. Yılmaz" }, name: "Doktor – {what}", name0: "Doktor randevusu" },
    rechnung: { title: "Fatura ödemesi", labels: { what: "Ne için?", date: "Son ödeme tarihi" }, ph: { what: "örn. elektrik" }, name: "Fatura – {what}", name0: "Fatura öde" },
    eigene: { title: "Kendi tarihin", labels: { title: "Ne?", date: "Tarih", every: "Tekrar" }, ph: { title: "örn. otopark kartını yenile" } },
    demo: { bill: "Elektrik", phone: "Turkcell" }
  },
  pl: {
    cat: { doc: "Dokumenty", car: "Samochód", contract: "Umowy i ubezpieczenia", health: "Zdrowie", family: "Rodzina i dzieci", money: "Płatności", own: "Własne" },
    geburtstag: { title: "Urodziny / imieniny", hint: "Livo przypomni co roku tydzień wcześniej – zdążysz z prezentem.", labels: { who: "Czyje urodziny?", date: "Data (rok nie ma znaczenia)" }, ph: { who: "np. mama, Ania" }, name: "Urodziny – {what}", name0: "Urodziny" },
    hochzeitstag: { title: "Rocznica ślubu", hint: "Livo przypomni co roku tydzień wcześniej.", labels: { date: "Data ślubu (rok nie ma znaczenia)" }, name0: "Rocznica ślubu" },
    kinderarzt: { title: "Pediatra (bilans, szczepienie)", hint: "Bilanse i szczepienia są w książeczce zdrowia dziecka – umów wizytę wcześniej.", labels: { who: "Dla kogo?", date: "Wizyta dnia" }, ph: { who: "np. Zosia" }, name: "Pediatra – {what}", name0: "Pediatra" },
    schule: { title: "Przedszkole i szkoła", hint: "Zapisy mają często stałe terminy – lepiej wpisz je wcześniej.", labels: { what: "Co?", date: "Data" }, ph: { what: "np. zebranie z rodzicami" }, name: "{what}", name0: "Przedszkole i szkoła" },
    kinderpass: { title: "Dowód / paszport (dziecko)", hint: "Dzieci potrzebują własnego dokumentu do podróży. Złóż wniosek o nowy dokument na czas – to trwa kilka tygodni.", labels: { who: "Dla kogo?", date: "Ważny do" }, ph: { who: "np. Zosia" }, name: "Dowód / paszport – {what}", name0: "Dowód / paszport (dziecko)" },
    personalausweis: { title: "Dowód osobisty", hint: "Złóż wniosek o nowy dowód z wyprzedzeniem – wydanie trwa zwykle kilka tygodni.", labels: { date: "Ważny do" } },
    reisepass: { title: "Paszport", hint: "Wiele krajów wymaga przy wjeździe co najmniej 6 miesięcy ważności.", labels: { date: "Ważny do" } },
    fuehrerschein: { title: "Prawo jazdy", hint: "Datę ważności znajdziesz na prawie jazdy (pole 4b). Prawo jazdy wymienia się zwykle co 15 lat.", labels: { date: "Ważne do (pole 4b)" } },
    aufenthaltstitel: { title: "Karta pobytu", hint: "Złóż wniosek o przedłużenie wcześnie – terminy bywają odległe.", labels: { date: "Ważna do" } },
    tuev: { title: "Przegląd techniczny", hint: "Zwykle co roku – termin jest w dowodzie rejestracyjnym lub na zaświadczeniu z ostatniego przeglądu.", labels: { month: "Następny przegląd (miesiąc i rok)" }, ph: { month: "np. 2027-04" } },
    inspektion: { title: "Serwis samochodu", hint: "Termin znajdziesz w książce serwisowej lub na wyświetlaczu auta.", labels: { date: "Następny serwis" } },
    handy: {
      title: "Umowa na telefon / internet", hint: "Po okresie umowy zwykle możesz ją wypowiedzieć w każdej chwili – dobry moment, by porównać ceny.",
      labels: { what: "Operator", start: "Początek umowy", term: "Okres umowy (miesiące)" }, ph: { what: "np. Orange" },
      name: "Umowa {what} – koniec okresu umowy", name0: "Telefon / internet – koniec okresu umowy"
    },
    versicherung: {
      title: "Ubezpieczenie (mieszkanie, OC …)", hint: "Do tego dnia wypowiedzenie musi dotrzeć do ubezpieczyciela. Inaczej polisa zwykle odnawia się na kolejny rok.",
      labels: { what: "Jakie ubezpieczenie?", end: "Polisa kończy się", notice: "Okres wypowiedzenia (miesiące)" }, ph: { what: "np. ubezpieczenie mieszkania" },
      name: "{what} – ostatni dzień na wypowiedzenie", name0: "Ubezpieczenie – ostatni dzień na wypowiedzenie"
    },
    strom: {
      title: "Prąd / gaz", hint: "Po okresie umowy możesz zmienić sprzedawcę. Porównanie cen raz w roku się opłaca.",
      labels: { what: "Sprzedawca", start: "Początek umowy", term: "Okres umowy (miesiące)" }, ph: { what: "np. PGE" },
      name: "Prąd/gaz {what} – porównaj ceny", name0: "Prąd / gaz – porównaj ceny"
    },
    abo: {
      title: "Subskrypcja / siłownia", hint: "Po minimalnym okresie zwykle możesz zrezygnować z krótkim wypowiedzeniem.",
      labels: { what: "Co?", start: "Początek", term: "Minimalny okres (miesiące)" }, ph: { what: "np. siłownia" },
      name: "{what} – koniec minimalnego okresu", name0: "Subskrypcja – koniec minimalnego okresu"
    },
    zahnarzt: { title: "Kontrola u dentysty", hint: "Większość dentystów zaleca kontrolę co 6 miesięcy.", labels: { date: "Ostatnia kontrola" } },
    checkup: { title: "Badania kontrolne", hint: "Regularne badania pomagają wcześnie wykryć problemy.", labels: { date: "Ostatnie badania" } },
    tetanus: { title: "Szczepienie przypominające – tężec", hint: "Dawkę przypominającą przeciw tężcowi i błonicy zaleca się zwykle co 10 lat.", labels: { date: "Ostatnie szczepienie" } },
    arzttermin: { title: "Wizyta u lekarza", labels: { who: "U kogo?", date: "Data" }, ph: { who: "np. dr Kowalska" }, name: "Wizyta – {what}", name0: "Wizyta u lekarza" },
    rechnung: { title: "Zapłacić rachunek", labels: { what: "Za co?", date: "Termin płatności" }, ph: { what: "np. prąd" }, name: "Rachunek – {what}", name0: "Zapłacić rachunek" },
    eigene: { title: "Własny termin", labels: { title: "Co?", date: "Data", every: "Powtarzanie" }, ph: { title: "np. przedłużyć abonament parkingowy" } },
    demo: { bill: "Prąd", phone: "Orange" }
  }
};

function tplText(tp) { return (TPL_TEXT[LANG] && TPL_TEXT[LANG][tp.id]) || TPL_TEXT.de[tp.id] || {}; }
function tplTitle(tp) { return tplText(tp).title || tp.id; }
function tplHint(tp) { return tplText(tp).hint || ""; }
function fieldLabel(tp, f) { var x = tplText(tp); return (x.labels && x.labels[f.key]) || f.key; }
function fieldPh(tp, f) { var x = tplText(tp); return (x.ph && x.ph[f.key]) || ""; }
function catName(c) { return ((TPL_TEXT[LANG] || TPL_TEXT.en).cat || TPL_TEXT.de.cat)[c.id]; }
function demoWord(key) { return ((TPL_TEXT[LANG] || TPL_TEXT.en).demo || TPL_TEXT.de.demo)[key]; }
// Titel einer neuen Frist: mit Anbieter/Arzt ("Handyvertrag Telekom – …") oder ohne
function tplName(tp, v) {
  if (tp.id === "eigene") return v.title || tplTitle(tp);
  var x = tplText(tp), w = v.what || v.who;
  if (w && x.name) return x.name.replace("{what}", w);
  return x.name0 || tplTitle(tp);
}
// Vorlagen, die es in der App-Sprache gibt
function visibleTemplates() { return TEMPLATES.filter(function (tp) { return !tp.only || tp.only === LANG; }); }
