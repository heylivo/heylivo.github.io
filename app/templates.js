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
  { id: "travel", icon: "✈️" },
  { id: "money", icon: "💶" },
  { id: "own", icon: "📝" }
];

// Wiederholung: Monate ("m12") oder Tage ("d7"), "0" = einmalig, dazu "custom" = eigene Angabe.
// Gespeichert wird every (Monate) bzw. everyDays (Tage) - nie beides.
var REPEAT_OPTIONS = ["0", "d1", "d7", "d14", "m1", "m3", "m6", "m12", "m24", "m36", "m120"];
function repeatOptionText(v) { return t("everyopt." + (v.charAt(0) === "m" ? v.slice(1) : v)); }
function parseRepeatValue(v) {
  var m = /^([md])(\d+)$/.exec(String(v || ""));
  return { every: m && m[1] === "m" ? +m[2] : 0, everyDays: m && m[1] === "d" ? +m[2] : 0 };
}
function repeatValue(r) { return r.everyDays > 0 ? "d" + r.everyDays : r.every > 0 ? "m" + r.every : "0"; }
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

  // Reisen & Urlaub
  {
    id: "reise", cat: "travel", lead: 14,
    fields: [{ key: "what", type: "text", optional: true }, { key: "date", type: "date" }], compute: dated
  },
  {
    // Livo erinnert am Tag vor dem Abflug - dann ist der Online-Check-in meist offen
    id: "checkin", cat: "travel", lead: 1,
    fields: [{ key: "what", type: "text", optional: true }, { key: "date", type: "date" }], compute: dated
  },
  {
    id: "storno", cat: "travel", lead: 3,
    fields: [{ key: "what", type: "text", optional: true }, { key: "date", type: "date" }], compute: dated
  },
  {
    // Manche Impfungen brauchen mehrere Termine: Frist = Abreise - 6 Wochen
    id: "reiseimpfung", cat: "travel", lead: 7, fields: [{ key: "date", type: "date" }],
    compute: function (v) { return { due: addDays(fromISO(v.date), -42), every: 0 }; }
  },
  {
    id: "einreise", cat: "travel", lead: 60, renew: true,
    fields: [{ key: "what", type: "text", optional: true }, { key: "date", type: "date" }], compute: dated
  },
  {
    id: "reiseversicherung", cat: "travel", lead: 30,
    fields: [{ key: "what", type: "text", optional: true }, { key: "date", type: "date" }],
    compute: function (v) { return { due: fromISO(v.date), every: 12 }; }
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
    fields: [{ key: "title", type: "text" }, { key: "date", type: "date" }, { key: "every", type: "repeat", value: "0" }],
    compute: function (v) {
      var r = v.every && typeof v.every === "object" ? v.every : parseRepeatValue(v.every);
      return { due: fromISO(v.date), every: r.every, everyDays: r.everyDays };
    }
  }
];

// Texte je Sprache: title, hint, labels/ph (Feldbeschriftung/Beispiel je Feld),
// name = Titel mit {what} (Anbieter, Arzt, …), name0 = Titel ohne
var TPL_TEXT = {
  de: {
    cat: { doc: "Ausweise & Dokumente", car: "Auto", contract: "Verträge & Versicherungen", health: "Gesundheit", family: "Familie & Kinder", travel: "Reisen & Urlaub", money: "Geld & Steuern", own: "Eigene" },
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
    reise: { title: "Reise / Urlaub", hint: "Livo erinnert dich 2 Wochen vorher – Zeit für Pass, Koffer, Haustier, Pflanzen und Post.", labels: { what: "Wohin?", date: "Abreise am" }, ph: { what: "z. B. Mallorca" }, name: "Urlaub – {what}", name0: "Reise / Urlaub" },
    checkin: { title: "Online-Check-in", hint: "Bei vielen Airlines öffnet der Online-Check-in 24 bis 48 Stunden vor Abflug. Livo erinnert dich am Tag vorher.", labels: { what: "Welcher Flug?", date: "Abflug am" }, ph: { what: "z. B. Lufthansa nach Rom" }, name: "Online-Check-in – {what}", name0: "Online-Check-in" },
    storno: { title: "Kostenlos stornieren bis", hint: "Viele Hotels und Ferienwohnungen lassen sich nur bis zu einem bestimmten Tag kostenlos stornieren. Das Datum steht in der Buchungsbestätigung.", labels: { what: "Welche Buchung?", date: "Kostenlos stornierbar bis" }, ph: { what: "z. B. Hotel in Rom" }, name: "{what} – kostenlos stornieren bis", name0: "Buchung – kostenlos stornieren bis" },
    reiseimpfung: { title: "Reiseimpfung", hint: "Manche Impfungen brauchen mehrere Termine. Lass dich am besten 6 bis 8 Wochen vor der Reise beim Hausarzt oder in einer reisemedizinischen Praxis beraten.", labels: { date: "Abreise am" }, name0: "Reiseimpfung – Beratung beim Arzt" },
    einreise: { title: "Einreise-Erlaubnis / Visum", hint: "Länder wie die USA (ESTA), Kanada (eTA) und Großbritannien (ETA) verlangen vor der Reise eine Online-Genehmigung. Sie gilt je nach Land 2 bis 5 Jahre – endet aber, wenn dein Pass abläuft.", labels: { what: "Für welches Land?", date: "Gültig bis" }, ph: { what: "z. B. ESTA USA" }, name: "{what} – gültig bis", name0: "Einreise-Erlaubnis / Visum" },
    reiseversicherung: { title: "Auslandskrankenversicherung", hint: "Die gesetzliche Krankenkasse zahlt im Ausland oft nur einen Teil oder gar nichts – zum Beispiel keinen Rücktransport. Prüf rechtzeitig, ob deine Versicherung noch läuft.", labels: { what: "Welche Versicherung?", date: "Läuft ab am" }, ph: { what: "z. B. Jahres-Reiseversicherung" }, name: "{what} – läuft ab", name0: "Auslandskrankenversicherung – läuft ab" },
    demo: { bill: "Stadtwerke", phone: "Telekom" }
  },
  en: {
    cat: { doc: "IDs & documents", car: "Car", contract: "Contracts & insurance", health: "Health", family: "Family & kids", travel: "Travel & holidays", money: "Money", own: "Your own" },
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
    reise: { title: "Trip / holiday", hint: "Livo reminds you 2 weeks before – time to sort out passport, luggage, pets, plants and post.", labels: { what: "Where to?", date: "Departure on" }, ph: { what: "e.g. Mallorca" }, name: "Trip – {what}", name0: "Trip / holiday" },
    checkin: { title: "Online check-in", hint: "Many airlines open online check-in 24 to 48 hours before departure. Livo reminds you the day before.", labels: { what: "Which flight?", date: "Departure on" }, ph: { what: "e.g. easyJet to Rome" }, name: "Check-in – {what}", name0: "Online check-in" },
    storno: { title: "Free cancellation until", hint: "Many hotels and holiday rentals can only be cancelled free of charge up to a certain day. You'll find it in your booking confirmation.", labels: { what: "Which booking?", date: "Free cancellation until" }, ph: { what: "e.g. hotel in Rome" }, name: "{what} – free cancellation until", name0: "Booking – free cancellation until" },
    reiseimpfung: { title: "Travel vaccinations", hint: "Some vaccinations need several appointments. Ideally get advice from your GP or a travel clinic 6 to 8 weeks before you travel.", labels: { date: "Departure on" }, name0: "Travel vaccinations – see a doctor" },
    einreise: { title: "Travel authorisation / visa", hint: "Countries such as the USA (ESTA), Canada (eTA) and the UK (ETA) require an online travel authorisation before you travel. Depending on the country it's valid for 2 to 5 years – but it ends when your passport expires.", labels: { what: "For which country?", date: "Valid until" }, ph: { what: "e.g. ESTA USA" }, name: "{what} – valid until", name0: "Travel authorisation / visa" },
    reiseversicherung: { title: "Travel health insurance", hint: "Your regular health cover often pays only part of the costs abroad, or nothing – for example no repatriation. Check in good time that your cover is still running.", labels: { what: "Which insurance?", date: "Expires on" }, ph: { what: "e.g. annual travel insurance" }, name: "{what} – expires", name0: "Travel health insurance – expires" },
    demo: { bill: "Electricity", phone: "Vodafone" }
  },
  it: {
    cat: { doc: "Documenti", car: "Auto", contract: "Contratti e assicurazioni", health: "Salute", family: "Famiglia e bambini", travel: "Viaggi e vacanze", money: "Pagamenti", own: "Personalizzata" },
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
    reise: { title: "Viaggio / vacanza", hint: "Livo ti avvisa 2 settimane prima – il tempo per passaporto, valigie, animali, piante e posta.", labels: { what: "Dove?", date: "Partenza il" }, ph: { what: "es. Sardegna" }, name: "Viaggio – {what}", name0: "Viaggio / vacanza" },
    checkin: { title: "Check-in online", hint: "Molte compagnie aeree aprono il check-in online da 24 a 48 ore prima della partenza. Livo ti avvisa il giorno prima.", labels: { what: "Quale volo?", date: "Partenza il" }, ph: { what: "es. ITA per Parigi" }, name: "Check-in – {what}", name0: "Check-in online" },
    storno: { title: "Cancellazione gratuita entro", hint: "Molti hotel e case vacanza si possono cancellare gratis solo fino a un certo giorno. La data è nella conferma di prenotazione.", labels: { what: "Quale prenotazione?", date: "Cancellazione gratuita entro il" }, ph: { what: "es. hotel a Roma" }, name: "{what} – cancellazione gratuita entro", name0: "Prenotazione – cancellazione gratuita entro" },
    reiseimpfung: { title: "Vaccinazioni per il viaggio", hint: "Alcuni vaccini richiedono più appuntamenti. Meglio chiedere consiglio al medico o a un ambulatorio di medicina dei viaggi 6–8 settimane prima della partenza.", labels: { date: "Partenza il" }, name0: "Vaccinazioni per il viaggio – dal medico" },
    einreise: { title: "Autorizzazione di viaggio / visto", hint: "Paesi come gli USA (ESTA), il Canada (eTA) e il Regno Unito (ETA) richiedono un'autorizzazione online prima del viaggio. Vale da 2 a 5 anni a seconda del Paese, ma scade insieme al passaporto.", labels: { what: "Per quale Paese?", date: "Valida fino al" }, ph: { what: "es. ESTA USA" }, name: "{what} – valida fino al", name0: "Autorizzazione di viaggio / visto" },
    reiseversicherung: { title: "Assicurazione sanitaria di viaggio", hint: "All'estero l'assistenza sanitaria pubblica spesso copre solo una parte dei costi o niente, ad esempio il rimpatrio. Controlla per tempo che la copertura sia ancora attiva.", labels: { what: "Quale assicurazione?", date: "Scade il" }, ph: { what: "es. assicurazione annuale" }, name: "{what} – scade", name0: "Assicurazione di viaggio – scade" },
    demo: { bill: "Luce", phone: "TIM" }
  },
  el: {
    cat: { doc: "Έγγραφα", car: "Αυτοκίνητο", contract: "Συμβόλαια & ασφάλειες", health: "Υγεία", family: "Οικογένεια & παιδιά", travel: "Ταξίδια & διακοπές", money: "Πληρωμές", own: "Δικές σου" },
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
    reise: { title: "Ταξίδι / διακοπές", hint: "Το Livo σού θυμίζει 2 εβδομάδες πριν – χρόνος για διαβατήριο, βαλίτσες, κατοικίδια, φυτά και αλληλογραφία.", labels: { what: "Πού;", date: "Αναχώρηση στις" }, ph: { what: "π.χ. Κρήτη" }, name: "Ταξίδι – {what}", name0: "Ταξίδι / διακοπές" },
    checkin: { title: "Online check-in", hint: "Πολλές αεροπορικές ανοίγουν το online check-in 24 έως 48 ώρες πριν την πτήση. Το Livo σού θυμίζει την προηγούμενη μέρα.", labels: { what: "Ποια πτήση;", date: "Πτήση στις" }, ph: { what: "π.χ. Aegean για Ρώμη" }, name: "Check-in – {what}", name0: "Online check-in" },
    storno: { title: "Δωρεάν ακύρωση έως", hint: "Πολλά ξενοδοχεία και καταλύματα ακυρώνονται δωρεάν μόνο έως μια συγκεκριμένη μέρα. Θα τη βρεις στην επιβεβαίωση της κράτησης.", labels: { what: "Ποια κράτηση;", date: "Δωρεάν ακύρωση έως" }, ph: { what: "π.χ. ξενοδοχείο στη Ρώμη" }, name: "{what} – δωρεάν ακύρωση έως", name0: "Κράτηση – δωρεάν ακύρωση έως" },
    reiseimpfung: { title: "Εμβόλια για ταξίδι", hint: "Κάποια εμβόλια χρειάζονται περισσότερα ραντεβού. Καλύτερα να συμβουλευτείς γιατρό 6 έως 8 εβδομάδες πριν το ταξίδι.", labels: { date: "Αναχώρηση στις" }, name0: "Εμβόλια για ταξίδι – στον γιατρό" },
    einreise: { title: "Άδεια εισόδου / βίζα", hint: "Χώρες όπως οι ΗΠΑ (ESTA), ο Καναδάς (eTA) και το Ηνωμένο Βασίλειο (ETA) ζητούν ηλεκτρονική άδεια πριν το ταξίδι. Ισχύει 2 έως 5 χρόνια ανάλογα με τη χώρα, αλλά λήγει μαζί με το διαβατήριο.", labels: { what: "Για ποια χώρα;", date: "Ισχύει έως" }, ph: { what: "π.χ. ESTA ΗΠΑ" }, name: "{what} – ισχύει έως", name0: "Άδεια εισόδου / βίζα" },
    reiseversicherung: { title: "Ταξιδιωτική ασφάλιση υγείας", hint: "Στο εξωτερικό η δημόσια ασφάλιση συχνά καλύπτει μόνο μέρος του κόστους ή τίποτα – για παράδειγμα όχι τον επαναπατρισμό. Έλεγξε εγκαίρως ότι η κάλυψή σου ισχύει ακόμα.", labels: { what: "Ποια ασφάλεια;", date: "Λήγει στις" }, ph: { what: "π.χ. ετήσια ταξιδιωτική" }, name: "{what} – λήγει", name0: "Ταξιδιωτική ασφάλιση – λήγει" },
    demo: { bill: "ΔΕΗ", phone: "Cosmote" }
  },
  es: {
    cat: { doc: "Documentos", car: "Coche", contract: "Contratos y seguros", health: "Salud", family: "Familia e hijos", travel: "Viajes y vacaciones", money: "Pagos", own: "Personalizado" },
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
    reise: { title: "Viaje / vacaciones", hint: "Livo te avisa 2 semanas antes: tiempo para el pasaporte, las maletas, las mascotas, las plantas y el correo.", labels: { what: "¿Adónde?", date: "Salida el" }, ph: { what: "p. ej. Mallorca" }, name: "Viaje – {what}", name0: "Viaje / vacaciones" },
    checkin: { title: "Check-in online", hint: "Muchas aerolíneas abren el check-in online entre 24 y 48 horas antes de la salida. Livo te avisa el día anterior.", labels: { what: "¿Qué vuelo?", date: "Salida el" }, ph: { what: "p. ej. Iberia a Roma" }, name: "Check-in – {what}", name0: "Check-in online" },
    storno: { title: "Cancelación gratuita hasta", hint: "Muchos hoteles y apartamentos solo se pueden cancelar gratis hasta un día concreto. Lo encontrarás en la confirmación de la reserva.", labels: { what: "¿Qué reserva?", date: "Cancelación gratuita hasta el" }, ph: { what: "p. ej. hotel en Roma" }, name: "{what} – cancelación gratuita hasta", name0: "Reserva – cancelación gratuita hasta" },
    reiseimpfung: { title: "Vacunas para el viaje", hint: "Algunas vacunas necesitan varias citas. Lo mejor es consultar con tu médico o un centro de vacunación internacional 6 a 8 semanas antes del viaje.", labels: { date: "Salida el" }, name0: "Vacunas para el viaje – ir al médico" },
    einreise: { title: "Autorización de viaje / visado", hint: "Países como EE. UU. (ESTA), Canadá (eTA) y Reino Unido (ETA) exigen una autorización online antes del viaje. Según el país vale de 2 a 5 años, pero caduca con el pasaporte.", labels: { what: "¿Para qué país?", date: "Válida hasta" }, ph: { what: "p. ej. ESTA EE. UU." }, name: "{what} – válida hasta", name0: "Autorización de viaje / visado" },
    reiseversicherung: { title: "Seguro médico de viaje", hint: "En el extranjero, la sanidad pública a menudo cubre solo una parte de los costes o nada, por ejemplo la repatriación. Comprueba a tiempo que tu seguro sigue vigente.", labels: { what: "¿Qué seguro?", date: "Vence el" }, ph: { what: "p. ej. seguro anual de viaje" }, name: "{what} – vence", name0: "Seguro de viaje – vence" },
    demo: { bill: "Luz", phone: "Movistar" }
  },
  fr: {
    cat: { doc: "Papiers d'identité", car: "Voiture", contract: "Contrats et assurances", health: "Santé", family: "Famille & enfants", travel: "Voyages & vacances", money: "Paiements", own: "Personnalisé" },
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
    reise: { title: "Voyage / vacances", hint: "Livo vous prévient 2 semaines avant – le temps de penser au passeport, aux valises, aux animaux, aux plantes et au courrier.", labels: { what: "Où ?", date: "Départ le" }, ph: { what: "ex. Corse" }, name: "Voyage – {what}", name0: "Voyage / vacances" },
    checkin: { title: "Enregistrement en ligne", hint: "Beaucoup de compagnies aériennes ouvrent l'enregistrement en ligne 24 à 48 heures avant le départ. Livo vous prévient la veille.", labels: { what: "Quel vol ?", date: "Départ le" }, ph: { what: "ex. Air France pour Rome" }, name: "Enregistrement – {what}", name0: "Enregistrement en ligne" },
    storno: { title: "Annulation gratuite jusqu'au", hint: "Beaucoup d'hôtels et de locations ne s'annulent gratuitement que jusqu'à une certaine date. Elle figure dans la confirmation de réservation.", labels: { what: "Quelle réservation ?", date: "Annulation gratuite jusqu'au" }, ph: { what: "ex. hôtel à Rome" }, name: "{what} – annulation gratuite jusqu'au", name0: "Réservation – annulation gratuite jusqu'au" },
    reiseimpfung: { title: "Vaccins de voyage", hint: "Certains vaccins demandent plusieurs rendez-vous. Consultez de préférence votre médecin ou un centre de vaccinations internationales 6 à 8 semaines avant le départ.", labels: { date: "Départ le" }, name0: "Vaccins de voyage – voir le médecin" },
    einreise: { title: "Autorisation de voyage / visa", hint: "Des pays comme les États-Unis (ESTA), le Canada (AVE) et le Royaume-Uni (ETA) exigent une autorisation en ligne avant le voyage. Selon le pays, elle vaut 2 à 5 ans, mais expire avec le passeport.", labels: { what: "Pour quel pays ?", date: "Valable jusqu'au" }, ph: { what: "ex. ESTA États-Unis" }, name: "{what} – valable jusqu'au", name0: "Autorisation de voyage / visa" },
    reiseversicherung: { title: "Assurance santé voyage", hint: "À l'étranger, l'assurance maladie ne couvre souvent qu'une partie des frais, voire rien – par exemple pas le rapatriement. Vérifiez à temps que votre couverture est toujours valable.", labels: { what: "Quelle assurance ?", date: "Expire le" }, ph: { what: "ex. assurance voyage annuelle" }, name: "{what} – expire", name0: "Assurance voyage – expire" },
    demo: { bill: "Électricité", phone: "Orange" }
  },
  nl: {
    cat: { doc: "Documenten", car: "Auto", contract: "Contracten & verzekeringen", health: "Gezondheid", family: "Gezin & kinderen", travel: "Reizen & vakantie", money: "Betalingen", own: "Eigen" },
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
    reise: { title: "Reis / vakantie", hint: "Livo herinnert je 2 weken van tevoren – tijd voor paspoort, koffers, huisdieren, planten en post.", labels: { what: "Waarheen?", date: "Vertrek op" }, ph: { what: "bijv. Mallorca" }, name: "Reis – {what}", name0: "Reis / vakantie" },
    checkin: { title: "Online inchecken", hint: "Veel luchtvaartmaatschappijen openen het online inchecken 24 tot 48 uur voor vertrek. Livo herinnert je de dag ervoor.", labels: { what: "Welke vlucht?", date: "Vertrek op" }, ph: { what: "bijv. KLM naar Rome" }, name: "Inchecken – {what}", name0: "Online inchecken" },
    storno: { title: "Gratis annuleren tot", hint: "Veel hotels en vakantiehuizen kun je maar tot een bepaalde dag gratis annuleren. Die datum staat in je boekingsbevestiging.", labels: { what: "Welke boeking?", date: "Gratis annuleren tot" }, ph: { what: "bijv. hotel in Rome" }, name: "{what} – gratis annuleren tot", name0: "Boeking – gratis annuleren tot" },
    reiseimpfung: { title: "Reisvaccinaties", hint: "Sommige vaccinaties hebben meerdere afspraken nodig. Laat je het liefst 6 tot 8 weken voor vertrek adviseren door je huisarts of een reisvaccinatiebureau.", labels: { date: "Vertrek op" }, name0: "Reisvaccinaties – naar de dokter" },
    einreise: { title: "Reistoestemming / visum", hint: "Landen zoals de VS (ESTA), Canada (eTA) en het VK (ETA) vragen vóór de reis een online reistoestemming. Afhankelijk van het land is die 2 tot 5 jaar geldig, maar hij vervalt met je paspoort.", labels: { what: "Voor welk land?", date: "Geldig tot" }, ph: { what: "bijv. ESTA VS" }, name: "{what} – geldig tot", name0: "Reistoestemming / visum" },
    reiseversicherung: { title: "Reisverzekering (medisch)", hint: "In het buitenland vergoedt je zorgverzekering vaak maar een deel van de kosten of niets – bijvoorbeeld geen repatriëring. Check op tijd of je dekking nog loopt.", labels: { what: "Welke verzekering?", date: "Verloopt op" }, ph: { what: "bijv. doorlopende reisverzekering" }, name: "{what} – verloopt", name0: "Reisverzekering – verloopt" },
    demo: { bill: "Energie", phone: "KPN" }
  },
  pt: {
    cat: { doc: "Documentos", car: "Carro", contract: "Contratos e seguros", health: "Saúde", family: "Família e filhos", travel: "Viagens e férias", money: "Pagamentos", own: "Personalizado" },
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
    reise: { title: "Viagem / férias", hint: "O Livo avisa-o 2 semanas antes – tempo para o passaporte, as malas, os animais, as plantas e o correio.", labels: { what: "Para onde?", date: "Partida a" }, ph: { what: "ex. Madeira" }, name: "Viagem – {what}", name0: "Viagem / férias" },
    checkin: { title: "Check-in online", hint: "Muitas companhias aéreas abrem o check-in online 24 a 48 horas antes da partida. O Livo avisa-o na véspera.", labels: { what: "Que voo?", date: "Partida a" }, ph: { what: "ex. TAP para Roma" }, name: "Check-in – {what}", name0: "Check-in online" },
    storno: { title: "Cancelamento gratuito até", hint: "Muitos hotéis e alojamentos só podem ser cancelados gratuitamente até um certo dia. A data está na confirmação da reserva.", labels: { what: "Que reserva?", date: "Cancelamento gratuito até" }, ph: { what: "ex. hotel em Roma" }, name: "{what} – cancelamento gratuito até", name0: "Reserva – cancelamento gratuito até" },
    reiseimpfung: { title: "Vacinas para viagem", hint: "Algumas vacinas precisam de várias consultas. O ideal é aconselhar-se com o seu médico ou numa consulta do viajante 6 a 8 semanas antes da partida.", labels: { date: "Partida a" }, name0: "Vacinas para viagem – ir ao médico" },
    einreise: { title: "Autorização de viagem / visto", hint: "Países como os EUA (ESTA), o Canadá (eTA) e o Reino Unido (ETA) exigem uma autorização online antes da viagem. Conforme o país, vale 2 a 5 anos, mas caduca com o passaporte.", labels: { what: "Para que país?", date: "Válida até" }, ph: { what: "ex. ESTA EUA" }, name: "{what} – válida até", name0: "Autorização de viagem / visto" },
    reiseversicherung: { title: "Seguro de saúde em viagem", hint: "No estrangeiro, o serviço público de saúde muitas vezes só cobre parte dos custos ou nada – por exemplo, o repatriamento. Verifique a tempo se a sua cobertura ainda está ativa.", labels: { what: "Que seguro?", date: "Termina a" }, ph: { what: "ex. seguro de viagem anual" }, name: "{what} – termina", name0: "Seguro de viagem – termina" },
    demo: { bill: "Luz", phone: "MEO" }
  },
  tr: {
    cat: { doc: "Belgeler", car: "Araç", contract: "Sözleşmeler ve sigortalar", health: "Sağlık", family: "Aile & çocuklar", travel: "Seyahat & tatil", money: "Ödemeler", own: "Kendi" },
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
    reise: { title: "Seyahat / tatil", hint: "Livo 2 hafta önceden hatırlatır – pasaport, bavul, evcil hayvan, bitkiler ve posta için zaman kalır.", labels: { what: "Nereye?", date: "Gidiş tarihi" }, ph: { what: "örn. Antalya" }, name: "Seyahat – {what}", name0: "Seyahat / tatil" },
    checkin: { title: "Online check-in", hint: "Birçok havayolu online check-in'i kalkıştan 24 ila 48 saat önce açar. Livo bir gün önce hatırlatır.", labels: { what: "Hangi uçuş?", date: "Uçuş tarihi" }, ph: { what: "örn. THY Roma uçuşu" }, name: "Check-in – {what}", name0: "Online check-in" },
    storno: { title: "Ücretsiz iptal son günü", hint: "Birçok otel ve tatil evi sadece belli bir güne kadar ücretsiz iptal edilebilir. Tarih rezervasyon onayında yazar.", labels: { what: "Hangi rezervasyon?", date: "Ücretsiz iptal son günü" }, ph: { what: "örn. Roma'daki otel" }, name: "{what} – ücretsiz iptal son günü", name0: "Rezervasyon – ücretsiz iptal son günü" },
    reiseimpfung: { title: "Seyahat aşıları", hint: "Bazı aşılar birkaç randevu gerektirir. En iyisi seyahatten 6–8 hafta önce doktoruna danış.", labels: { date: "Gidiş tarihi" }, name0: "Seyahat aşıları – doktora git" },
    einreise: { title: "Seyahat izni / vize", hint: "ABD (ESTA), Kanada (eTA) ve Birleşik Krallık (ETA) gibi ülkeler seyahatten önce online izin ister. Ülkeye göre 2 ila 5 yıl geçerlidir, ama pasaportun bitince o da biter.", labels: { what: "Hangi ülke için?", date: "Geçerlilik sonu" }, ph: { what: "örn. ESTA ABD" }, name: "{what} – geçerlilik sonu", name0: "Seyahat izni / vize" },
    reiseversicherung: { title: "Seyahat sağlık sigortası", hint: "Yurt dışında genel sağlık sigortası masrafların çoğu zaman sadece bir kısmını karşılar ya da hiçbirini – örneğin ülkeye geri nakli. Sigortanın hâlâ geçerli olduğunu zamanında kontrol et.", labels: { what: "Hangi sigorta?", date: "Bitiş tarihi" }, ph: { what: "örn. yıllık seyahat sigortası" }, name: "{what} – bitiyor", name0: "Seyahat sigortası – bitiyor" },
    demo: { bill: "Elektrik", phone: "Turkcell" }
  },
  pl: {
    cat: { doc: "Dokumenty", car: "Samochód", contract: "Umowy i ubezpieczenia", health: "Zdrowie", family: "Rodzina i dzieci", travel: "Podróże i urlop", money: "Płatności", own: "Własne" },
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
    reise: { title: "Podróż / urlop", hint: "Livo przypomni ci 2 tygodnie wcześniej – czas na paszport, walizki, zwierzęta, rośliny i pocztę.", labels: { what: "Dokąd?", date: "Wyjazd" }, ph: { what: "np. Chorwacja" }, name: "Podróż – {what}", name0: "Podróż / urlop" },
    checkin: { title: "Odprawa online", hint: "Wiele linii lotniczych otwiera odprawę online 24–48 godzin przed wylotem. Livo przypomni ci dzień wcześniej.", labels: { what: "Jaki lot?", date: "Wylot" }, ph: { what: "np. LOT do Rzymu" }, name: "Odprawa – {what}", name0: "Odprawa online" },
    storno: { title: "Bezpłatne anulowanie do", hint: "Wiele hoteli i apartamentów można anulować bezpłatnie tylko do określonego dnia. Datę znajdziesz w potwierdzeniu rezerwacji.", labels: { what: "Jaka rezerwacja?", date: "Bezpłatne anulowanie do" }, ph: { what: "np. hotel w Rzymie" }, name: "{what} – bezpłatne anulowanie do", name0: "Rezerwacja – bezpłatne anulowanie do" },
    reiseimpfung: { title: "Szczepienia przed podróżą", hint: "Niektóre szczepienia wymagają kilku wizyt. Najlepiej skonsultuj się z lekarzem 6–8 tygodni przed wyjazdem.", labels: { date: "Wyjazd" }, name0: "Szczepienia przed podróżą – do lekarza" },
    einreise: { title: "Zezwolenie na podróż / wiza", hint: "Kraje takie jak USA (ESTA), Kanada (eTA) i Wielka Brytania (ETA) wymagają zezwolenia online przed podróżą. W zależności od kraju jest ważne 2–5 lat, ale wygasa razem z paszportem.", labels: { what: "Do jakiego kraju?", date: "Ważne do" }, ph: { what: "np. ESTA USA" }, name: "{what} – ważne do", name0: "Zezwolenie na podróż / wiza" },
    reiseversicherung: { title: "Ubezpieczenie podróżne (leczenie)", hint: "Za granicą publiczne ubezpieczenie często pokrywa tylko część kosztów albo nic – na przykład transportu do kraju. Sprawdź na czas, czy twoja polisa jest nadal ważna.", labels: { what: "Jakie ubezpieczenie?", date: "Kończy się" }, ph: { what: "np. roczne ubezpieczenie podróżne" }, name: "{what} – kończy się", name0: "Ubezpieczenie podróżne – kończy się" },
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
