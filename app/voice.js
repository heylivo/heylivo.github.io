// "Hey Livo": versteht gesprochene oder getippte Sätze ohne KI. Pro Sprache ein
// Wörterbuch (LEX) mit Monaten, Wochentagen, Zahlwörtern, Uhrzeit-Mustern,
// Stichwörtern für die Vorlagen und Füllwörtern; die Regeln darunter gelten für alle.
// Erkennt die Art der Frist (Stichwörter -> Vorlage), das Datum (absolut, relativ,
// Wochentag, Monat) und eine Uhrzeit. Der Rest wird zum Titel.
// Datums-Helfer (today, addDays, …) stehen in app.js, LANG/LOCALE in i18n.js.

function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
// Längere Wörter zuerst, damit "januar" vor "jan…" und "übermorgen" vor "morgen" passt
function alt(words) { return words.slice().sort(function (a, b) { return b.length - a.length; }).map(escRe).join("|"); }
function altKeys(obj) { return alt(Object.keys(obj)); }
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// Ohne Akzente und klein suchen ("Νοεμβρίου" = "νοεμβριου", "Kasım" = "kasim", "środę" = "srode"),
// damit auch Getipptes ohne Sonderzeichen passt. Zeichen für Zeichen, damit Original und
// Suchfassung gleich lang bleiben (cut() schneidet in beiden an derselben Stelle).
var FOLD_EXTRA = { "ı": "i", "ł": "l", "ς": "σ" };
function foldChar(c) {
  var f = c.normalize ? c.normalize("NFD").replace(/[̀-ͯ]/g, "") : c;
  if (f.length !== 1) f = c;
  var l = f.toLowerCase();
  if (l.length !== 1) l = f;
  return FOLD_EXTRA[l] || l;
}
function foldText(s) { var out = ""; for (var i = 0; i < s.length; i++) out += foldChar(s.charAt(i)); return out; }
// In Suchmustern nur Nicht-ASCII-Zeichen falten ("\\S", "\\d" usw. bleiben, wie sie sind)
function foldSrc(s) { return s.replace(/[^\x00-\x7f]/g, foldChar); }
function lowerOf(s, L) { return L.fold ? foldText(s) : s.toLowerCase(); }

// Wörterbücher mit fold: true werden einmal beim Laden in die Suchfassung gebracht.
// Füllwörter und whatWord bleiben, wie sie sind - sie arbeiten auf dem Originaltext.
function foldLex(L) {
  function keys(o) { var r = {}; Object.keys(o).forEach(function (k) { r[foldText(k)] = o[k]; }); return r; }
  function list(a) { return a.map(foldText); }
  ["months", "weekdays", "nums", "counts", "ordinals", "parts", "partsAfter"].forEach(function (k) { if (L[k]) L[k] = keys(L[k]); });
  ["pre", "partPre", "monthPre", "numMonthPre", "wdPre", "dmJoin", "yJoin", "inWord", "inAfter", "suffix"].forEach(function (k) { if (L[k]) L[k] = foldSrc(L[k]); });
  ["today", "tomorrow", "dayAfter", "preCut"].forEach(function (k) { if (L[k]) L[k] = list(L[k]); });
  Object.keys(L.units).forEach(function (k) { L.units[k] = list(L.units[k]); });
  L.rel = L.rel.map(function (r) { return [list(r[0]), r[1]]; });
  L.keywords = L.keywords.map(function (k) { return [k[0], list(k[1])]; });
  ["pm", "am", "dueWords", "wdNext"].forEach(function (k) { if (L[k]) L[k] = new RegExp(foldSrc(L[k].source), L[k].flags); });
  var times = L.times;
  L.times = function (H, hourOf) { return times(H, hourOf).map(function (p) { return [foldSrc(p[0]), p[1]]; }); };
  return L;
}

// Polnische Ordnungszahlen im Genitiv für Tage: "trzeciego listopada", "dwudziestego pierwszego"
function polishOrdinals() {
  var w = ["pierwszego", "drugiego", "trzeciego", "czwartego", "piątego", "szóstego", "siódmego", "ósmego", "dziewiątego"];
  var o = {
    dziesiątego: 10, jedenastego: 11, dwunastego: 12, trzynastego: 13, czternastego: 14, "piętnastego": 15,
    szesnastego: 16, siedemnastego: 17, osiemnastego: 18, "dziewiętnastego": 19, dwudziestego: 20, trzydziestego: 30
  };
  w.forEach(function (x, i) { o[x] = i + 1; o["dwudziestego " + x] = 21 + i; });
  o["trzydziestego pierwszego"] = 31;
  return o;
}

// Zahlwörter "twenty-first", "twenty first" usw. für 21–31
function englishOrdinals() {
  var o = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
    eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17,
    eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30 };
  ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth"].forEach(function (w, i) {
    o["twenty-" + w] = o["twenty " + w] = 21 + i;
  });
  o["thirty-first"] = o["thirty first"] = 31;
  return o;
}

var LEX = {};

LEX.de = {
  months: {
    januar: 1, februar: 2, "märz": 3, maerz: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8,
    september: 9, oktober: 10, november: 11, dezember: 12,
    feb: 2, "mär": 3, apr: 4, jun: 6, jul: 7, aug: 8, sept: 9, sep: 9, okt: 10, nov: 11, dez: 12
  },
  weekdays: { sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonnabend: 6 },
  nums: {
    ein: 1, eins: 1, eine: 1, einem: 1, einen: 1, einer: 1, zwei: 2, drei: 3, vier: 4, "fünf": 5,
    sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, "zwölf": 12
  },
  ordinals: {
    ersten: 1, zweiten: 2, dritten: 3, vierten: 4, "fünften": 5, sechsten: 6, siebten: 7, achten: 8,
    neunten: 9, zehnten: 10, elften: 11, "zwölften": 12, dreizehnten: 13, vierzehnten: 14,
    "fünfzehnten": 15, sechzehnten: 16, siebzehnten: 17, achtzehnten: 18, neunzehnten: 19,
    zwanzigsten: 20, einundzwanzigsten: 21, zweiundzwanzigsten: 22, dreiundzwanzigsten: 23,
    vierundzwanzigsten: 24, "fünfundzwanzigsten": 25, sechsundzwanzigsten: 26,
    siebenundzwanzigsten: 27, achtundzwanzigsten: 28, neunundzwanzigsten: 29,
    "dreißigsten": 30, "einunddreißigsten": 31
  },
  pre: "(?:am |bis |bis zum |zum |vom |ab |spätestens )?",
  parts: { ende: "end", anfang: "start", mitte: "mid" }, partPre: "(?:bis |zum )?",
  monthPre: "(?:im |bis |ab |zum |bis zum |bis ende |ende )?", numMonthPre: "(?:im |bis |ab )?",
  today: ["heute"], tomorrow: ["morgen"], dayAfter: ["übermorgen"],
  inWord: "in", units: { day: ["tagen", "tag"], week: ["wochen", "woche"], month: ["monaten", "monat"], year: ["jahren", "jahr"] },
  rel: [[["übernächste woche"], { days: 14 }], [["nächste woche", "kommende woche"], { days: 7 }],
    [["nächsten monat", "kommenden monat"], { months: 1 }], [["nächstes jahr", "kommendes jahr"], { months: 12 }]],
  wdPre: "(?:am |bis |ab |nächsten |kommenden |diesen )*", wdNext: /nächsten|kommenden/,
  // "halb 4" = 3:30, "viertel nach 3" = 3:15, "viertel vor 4" = 3:45, "um 15 Uhr", "um drei"
  times: function (H, hourOf) {
    var AT = " (?:um |ab |gegen )?";
    function exact(m) { return { h: +m[1], m: m[2] ? +m[2] : 0, padded: /^0\d/.test(m[1]) }; }
    return [
      [AT + "halb " + H + "(?: uhr)?", function (m) { return { h: hourOf(m[1]) - 1, m: 30 }; }],
      [AT + "viertel nach " + H + "(?: uhr)?", function (m) { return { h: hourOf(m[1]), m: 15 }; }],
      [AT + "viertel vor " + H + "(?: uhr)?", function (m) { return { h: hourOf(m[1]) - 1, m: 45 }; }],
      [" (?:um |ab |gegen )?(\\d{1,2})(?:[:.](\\d{2}))? ?uhr", exact],
      [" (?:um|ab|gegen) (\\d{1,2})[:.](\\d{2})", exact],
      [" (?:um|gegen) " + H + "(?: uhr)?", function (m) { return { h: hourOf(m[1]), m: 0, padded: /^0\d/.test(m[1]) }; }]
    ];
  },
  pm: / (nachmittags?|abends?|am nachmittag|am abend)(?= )/, am: / (morgens|früh|vormittags?|am vormittag|am morgen|nachts)(?= )/,
  dueWords: /auffrisch|fällig|nächste/,
  // Reihenfolge zählt: Spezielles vor Allgemeinem (Zahnarzt vor Arzt, Kfz-Versicherung vor Versicherung).
  // Familie ganz vorn: "Kinderreisepass" enthält "reisepass", "Kinderarzt" enthält "arzt".
  keywords: [
    ["kinderpass", ["kinderreisepass", "kinderpass", "kinderausweis", "kinderpersonalausweis"]],
    ["elterngeld", ["elterngeld"]],
    ["hochzeitstag", ["hochzeitstag", "jahrestag"]],
    ["geburtstag", ["geburtstag"]],
    ["kinderarzt", ["kinderarzt", "kinderärzt", "u-untersuchung", "u untersuchung", " u1 ", " u2 ", " u3 ", " u4 ", " u5 ", " u6 ", " u7 ", " u7a ", " u8 ", " u9 ", " j1 ", "kinderimpfung"]],
    ["schule", ["kita", "kindergarten", "schule", "elternabend", "elterngespräch", "einschulung", "ferienbetreuung", "klassenfahrt", " hort "]],
    ["reiseimpfung", ["reiseimpfung", "reise-impfung", "impfung für die reise", "impfungen für die reise", "reisemedizin", "tropenmedizin", "gelbfieber", "malaria"]],
    ["reiseversicherung", ["auslandskrankenversicherung", "auslandsversicherung", "reiseversicherung", "reisekrankenversicherung"]],
    ["einreise", ["einreise", "visum", " visa ", " esta ", "etias"]],
    ["checkin", ["check-in", "checkin", "check in", "einchecken"]],
    ["storno", ["storno", "stornieren", "stornierung"]],
    ["reisepass", ["reisepass", " pass "]],
    ["reise", ["urlaub", " reise ", "reise nach", "verreisen", "ferienwohnung", "abreise", "kurztrip", "städtetrip"]],
    ["fuehrerschein", ["führerschein", "fuehrerschein"]],
    ["aufenthaltstitel", ["aufenthalt"]],
    ["personalausweis", ["personalausweis", "ausweis", " perso "]],
    ["steuer", ["steuererklärung", "steuererklaerung", "steuer erklärung", " steuern "]],
    ["rechnung", ["rechnung"]],
    ["kfzversicherung", ["kfz-versicherung", "kfz versicherung", "kfzversicherung", "autoversicherung", "auto versicherung"]],
    ["tuev", ["tüv", "tuev", "hauptuntersuchung", " hu "]],
    ["reifen", ["reifen"]],
    ["inspektion", ["inspektion", "ölwechsel", "werkstatt", "autoservice", "auto service"]],
    ["handy", ["handy", "mobilfunk", "internetvertrag", " dsl ", "telekom", "vodafone", " o2 "]],
    ["strom", ["strom", " gas ", "gasvertrag", "energie"]],
    ["abo", ["fitness", "studio", " abo ", "abonnement", "netflix", "spotify", "zeitung", "mitgliedschaft"]],
    ["versicherung", ["versicherung"]],
    ["zahnarzt", ["zahnarzt", "zahnärzt", "zahnreinigung", "prophylaxe"]],
    ["checkup", ["check-up", "checkup", "check up", "vorsorge"]],
    ["tetanus", ["tetanus", "impfung", "auffrisch"]],
    ["arzttermin", ["arzt", "ärztin", "doktor", " dr ", "praxis", "physio"]],
    ["rechnung", ["bezahlen", "überweisen", "überweisung", " zahlen "]]
  ],
  // Füllwörter, die nicht in den Titel gehören (mehrteilige zuerst)
  fillers: [
    "hey livo", "hallo livo", "livo", "erinnere mich bitte", "erinnere mich", "erinner mich",
    "am nachmittag", "am abend", "am vormittag", "am morgen",
    "daran dass", "an die", "an den", "an das", "bitte", "daran", "dass", "an", "mein", "meine",
    "meinen", "meinem", "meiner", "der", "die", "das", "den", "dem", "läuft ab", "läuft", "ab",
    "ist", "wird", "fällig", "gültig", "bis", "am", "im", "um", "zum", "spätestens", "noch", "und", "uhr",
    "nachmittags", "abends", "morgens", "vormittags"
  ],
  // "Hausratversicherung", "Fitnessstudio" usw. in den Titel übernehmen
  whatWord: { versicherung: /\S*versicherung\S*/i, abo: /\S*(?:fitness|studio|netflix|spotify|zeitung)\S*/i },
  whatSkip: ["versicherung"]
};

LEX.en = {
  months: {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
    september: 9, october: 10, november: 11, december: 12,
    feb: 2, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
  },
  weekdays: { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 },
  nums: { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 },
  counts: { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 },
  ordinals: englishOrdinals(),
  ordSuffix: /(\d+)(?:st|nd|rd|th)\b/gi,   // "3rd" -> "3"
  pre: "(?:on |by |until |till |before |from |on the |by the |the )*",
  dmJoin: "(?:of )?",           // "3rd of March"
  monthDay: true,               // "March 3", "March 3rd"
  mdy: function () { return /^en-US/i.test(LOCALE); },  // 3/11 = 11 March, in den USA 3 November
  parts: {
    "end of": "end", "the end of": "end", "beginning of": "start", "the beginning of": "start",
    "start of": "start", "the start of": "start", early: "start", "middle of": "mid", "the middle of": "mid", mid: "mid"
  },
  partPre: "(?:by |at |in |until |before )?",
  monthPre: "(?:in |by |until |before |from |during )?", numMonthPre: "(?:in |by |until )?",
  today: ["today", "tonight"], tomorrow: ["tomorrow"], dayAfter: ["the day after tomorrow", "day after tomorrow"],
  inWord: "in", units: { day: ["days", "day"], week: ["weeks", "week"], month: ["months", "month"], year: ["years", "year"] },
  rel: [[["the week after next", "week after next"], { days: 14 }], [["next week"], { days: 7 }],
    [["next month"], { months: 1 }], [["next year"], { months: 12 }]],
  wdPre: "(?:on |by |until |next |this |coming |on the |the )*", wdNext: /next|coming/,
  // "half past 3", "quarter to 4", "at 3 pm", "3 o'clock", "at 10:30", "noon"
  times: function (H, hourOf) {
    var AT = " (?:at |from |around |by )?";
    return [
      [AT + "half past " + H, function (m) { return { h: hourOf(m[1]), m: 30 }; }],
      [AT + "(?:a )?quarter past " + H, function (m) { return { h: hourOf(m[1]), m: 15 }; }],
      [AT + "(?:a )?quarter to " + H, function (m) { return { h: hourOf(m[1]) - 1, m: 45 }; }],
      [" (?:at |from |around |by )?(\\d{1,2})(?:[:.](\\d{2}))? ?(am|pm)", function (m) { return { h: +m[1], m: m[2] ? +m[2] : 0, ampm: m[3] }; }],
      [AT + H + " o'?clock", function (m) { return { h: hourOf(m[1]), m: 0 }; }],
      [" (?:at|around|from|by) (\\d{1,2})[:.](\\d{2})", function (m) { return { h: +m[1], m: +m[2], padded: /^0\d/.test(m[1]) }; }],
      [" (?:at|around) " + H, function (m) { return { h: hourOf(m[1]), m: 0, padded: /^0\d/.test(m[1]) }; }],
      [" (?:at )?(?:noon|midday)", function () { return { h: 12, m: 0, fixed: true }; }],
      [" (?:at )?midnight", function () { return { h: 0, m: 0, fixed: true }; }]
    ];
  },
  pm: / (pm|in the afternoon|in the evening|tonight|this afternoon|this evening)(?= )/, am: / (am|in the morning|this morning)(?= )/,
  dueWords: /booster|due|next/,
  keywords: [
    ["kinderpass", ["child's passport", "childs passport", "child passport", "kid's passport", "kids passport", "son's passport", "daughter's passport", "child's id"]],
    ["hochzeitstag", ["wedding anniversary", "anniversary"]],
    ["geburtstag", ["birthday", "bday", "b-day"]],
    ["kinderarzt", ["paediatrician", "pediatrician", "health visitor", "baby check", "child's vaccination", "kid's doctor", "kids doctor"]],
    ["schule", ["school", "nursery", "kindergarten", "daycare", "day care", "childcare", "parents evening", "parents' evening", "parent-teacher"]],
    ["reiseimpfung", ["travel vaccin", "travel jab", "travel clinic", "yellow fever", "malaria"]],
    ["reiseversicherung", ["travel insurance", "travel health insurance", "health insurance abroad"]],
    ["einreise", [" visa ", " esta ", "etias", "uk eta", "entry permit", "travel authori"]],
    ["checkin", ["check-in", "checkin", "check in"]],
    ["storno", ["free cancellation", "cancel for free", "cancellation deadline", "cancel the booking", "cancel my booking", "cancel the hotel"]],
    ["reisepass", ["passport"]],
    ["reise", ["holiday", "vacation", " trip ", "flight to", "getaway"]],
    ["fuehrerschein", ["driving licence", "driving license", "driver's license", "driver's licence", "drivers license", "driver license"]],
    ["aufenthaltstitel", ["residence permit", "work permit", " visa "]],
    ["personalausweis", ["id card", "identity card", " id "]],
    ["rechnung", ["bill", "invoice"]],
    ["tuev", [" mot ", "car inspection", "vehicle inspection", "roadworthiness"]],
    ["inspektion", ["car service", "oil change", "garage"]],
    ["handy", ["phone contract", "mobile contract", "phone plan", "mobile plan", "broadband", "internet contract"]],
    ["strom", ["electricity", "energy contract", "gas contract", "energy supplier"]],
    ["abo", ["gym", "subscription", "netflix", "spotify", "membership"]],
    ["versicherung", ["insurance"]],
    ["zahnarzt", ["dentist", "dental"]],
    ["checkup", ["check-up", "checkup", "check up", "screening", "health check"]],
    ["tetanus", ["tetanus", "vaccination", "vaccine", "booster", " jab "]],
    ["arzttermin", ["doctor", " dr ", " gp ", "physio", "clinic", "hospital"]],
    ["rechnung", [" pay ", " rent ", "transfer"]]
  ],
  fillers: [
    "hey livo", "hi livo", "ok livo", "livo", "remind me to", "remind me about", "remind me that", "remind me",
    "in the morning", "in the afternoon", "in the evening", "this morning", "this afternoon", "this evening",
    "runs out", "run out", "please", "that", "my", "the", "a", "an", "to", "on", "at", "by", "is", "are",
    "expires", "expire", "due", "until", "in", "and", "of", "o'clock", "pm", "am", "next", "this",
    "starting from", "starting"
  ],
  // "check in" bleibt zusammen ("in" allein ist ein Füllwort)
  keep: ["check in"],
  whatWord: { versicherung: /\b([a-z]+ insurance)\b/i, abo: /\b(gym|netflix|spotify|[a-z]+ subscription|[a-z]+ membership)\b/i },
  whatSkip: []
};

/* ---------- Italienisch ---------- */
LEX.it = {
  fold: true, elide: true, prep: splitElision,
  months: {
    gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8,
    settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
    gen: 1, feb: 2, apr: 4, giu: 6, lug: 7, sett: 9, ott: 10, nov: 11, dic: 12
  },
  weekdays: { domenica: 0, "lunedì": 1, "martedì": 2, "mercoledì": 3, "giovedì": 4, "venerdì": 5, sabato: 6 },
  nums: { una: 1, uno: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12 },
  counts: { un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12, quindici: 15, venti: 20, trenta: 30 },
  ordinals: { primo: 1 },
  pre: "(?:il |entro |fino |al |dal |per |a partire |l' |dall' |all' |giorno )*",
  parts: {
    fine: "end", "fine di": "end", "alla fine di": "end", "a fine": "end", inizio: "start", "inizio di": "start",
    "all' inizio di": "start", "a inizio": "start", "metà": "mid", "a metà": "mid", "metà di": "mid"
  },
  partPre: "(?:entro |per |verso )?",
  monthPre: "(?:a |ad |in |entro |fino a |da |per |nel mese di |di )?", numMonthPre: "(?:a |entro |in )?",
  today: ["oggi", "stasera", "stamattina", "stamani", "stanotte"], tomorrow: ["domani", "domattina"], dayAfter: ["dopodomani", "dopo domani"],
  inWord: "(?:tra|fra|entro)", units: { day: ["giorni", "giorno"], week: ["settimane", "settimana"], month: ["mesi", "mese"], year: ["anni", "anno"] },
  rel: [[["la settimana prossima", "la prossima settimana", "settimana prossima", "prossima settimana"], { days: 7 }],
    [["il mese prossimo", "il prossimo mese", "mese prossimo", "prossimo mese"], { months: 1 }],
    [["l' anno prossimo", "il prossimo anno", "anno prossimo", "prossimo anno"], { months: 12 }]],
  wdPre: "(?:il |la |di |entro |per |fino a |questo |questa |prossimo |prossima )*", wdNext: /prossim/,
  // "alle 10", "alle 10:30", "all'una", "alle 3 e mezza", "alle 4 meno un quarto", "a mezzogiorno"
  times: function (H, hourOf) {
    var AT = " (?:alle |all' |verso le |verso l' |dalle |dall' |per le |per l' |entro le )?(?:ore )?";
    function exact(m) { return { h: +m[1], m: m[2] ? +m[2] : 0, padded: /^0\d/.test(m[1]) }; }
    return [
      [AT + H + " e mezz[ao]", function (m) { return { h: hourOf(m[1]), m: 30 }; }],
      [AT + H + " e (?:un )?quarto", function (m) { return { h: hourOf(m[1]), m: 15 }; }],
      [AT + H + " meno (?:un )?quarto", function (m) { return { h: hourOf(m[1]) - 1, m: 45 }; }],
      [AT + "(\\d{1,2}):(\\d{2})", exact],
      [" (?:alle|all'|verso le|dalle|per le|entro le|ore)(?: ore)? (\\d{1,2})(?:\\.(\\d{2}))?", exact],
      [" (?:alle |all' |verso le |verso l' |dalle |dall' |per le |per l' |entro le )(?:ore )?" + H, function (m) { return { h: hourOf(m[1]), m: 0 }; }],
      [" (?:a )?mezzogiorno", function () { return { h: 12, m: 0, fixed: true }; }],
      [" (?:a )?mezzanotte", function () { return { h: 0, m: 0, fixed: true }; }]
    ];
  },
  pm: / (del pomeriggio|di pomeriggio|nel pomeriggio|pomeriggio|di sera|della sera|stasera|questa sera|sera)(?= )/,
  am: / (del mattino|di mattina|la mattina|mattina|stamattina|stamani|domattina|di notte|notte)(?= )/,
  dueWords: /richiamo|scade|scadenza|prossim/,
  keywords: [
    ["kinderpass", ["passaporto del bambino", "passaporto della bambina", "passaporto di mio figlio", "passaporto di mia figlia", "carta d' identità del bambino", "carta d' identità di mio figlio", "carta d' identità di mia figlia"]],
    ["hochzeitstag", ["anniversario"]],
    ["geburtstag", ["compleanno", "onomastico"]],
    ["kinderarzt", ["pediatra", "vaccino del bambino", "vaccino della bambina", "vaccinazione del bambino", "bilancio di salute"]],
    ["schule", ["scuola", "asilo", " nido ", "colloquio con le maestre", "colloquio con gli insegnanti", "riunione dei genitori", "gita scolastica"]],
    ["reiseimpfung", ["vaccino per il viaggio", "vaccini per il viaggio", "vaccinazioni per il viaggio", "medicina dei viaggi", "febbre gialla", "malaria"]],
    ["reiseversicherung", ["assicurazione viaggio", "assicurazione di viaggio", "assicurazione sanitaria di viaggio", "assicurazione sanitaria all'estero"]],
    ["einreise", ["visto d'ingresso", "visto per", "il visto", " esta ", "etias", "autorizzazione di viaggio"]],
    ["checkin", ["check-in", "checkin", "check in"]],
    ["storno", ["cancellazione gratuita", "cancellare gratis", "cancellare la prenotazione", "disdire la prenotazione"]],
    ["reisepass", ["passaporto"]],
    ["reise", ["vacanza", "vacanze", " viaggio ", "partenza per", " ferie "]],
    ["fuehrerschein", ["patente"]],
    ["aufenthaltstitel", ["permesso di soggiorno", "soggiorno", " visto "]],
    ["personalausweis", ["carta d' identità", "carta di identità", "carta identità", "documento d' identità", " cie "]],
    ["rechnung", ["bolletta", "fattura"]],
    ["tuev", ["revisione"]],
    ["zahnarzt", ["dentist", "igiene dentale", "pulizia dei denti"]],
    ["checkup", ["check-up", "checkup", "check up", "esami del sangue", "screening", "controllo"]],
    ["tetanus", ["tetano", "vaccin", "richiamo"]],
    ["inspektion", ["tagliando", "cambio olio", "officina", "meccanico"]],
    ["handy", ["contratto telefonico", "telefono", "cellulare", "internet", "fibra", " sim ", " tim ", "vodafone", " wind", "iliad"]],
    ["strom", ["luce", "elettricità", " gas ", "energia", "enel"]],
    ["abo", ["palestra", "abbonamento", "netflix", "spotify", "iscrizione"]],
    ["versicherung", ["assicurazion", "polizza"]],
    ["arzttermin", ["medico", "dottor", " dott", "visita", "fisioterap", "ospedale", "ambulatorio", "pediatra", "ginecolog", "oculista", "dermatolog"]],
    ["rechnung", ["pagare", "bonifico", "affitto", " rata "]]
  ],
  fillers: [
    "hey livo", "ehi livo", "ciao livo", "ok livo", "livo", "ricordami di", "ricordami che", "ricordami", "ricordarmi di",
    "per favore", "del pomeriggio", "di pomeriggio", "di sera", "di mattina", "il mio", "la mia", "devo", "bisogna",
    "mio", "mia", "miei", "mie", "il", "lo", "la", "i", "gli", "le", "l'", "di", "del", "della", "dei", "che", "scade", "scadenza",
    "entro", "alle", "ore", "a", "al", "alla", "per", "e", "è", "fino", "dal", "un", "una", "tra", "fra", "prossimo", "prossima",
    "pomeriggio", "sera", "mattina"
  ],
  whatWord: { versicherung: /assicurazione(?: [a-zàèéìòù]+)?/i, abo: /(palestra|netflix|spotify|dazn|abbonamento [a-zàèéìòù]+)/i },
  whatSkip: ["assicurazione"]
};

/* ---------- Griechisch ---------- */
LEX.el = {
  fold: true,
  ordSuffix: /(\d+)(?:ης|ου|η|ο)(?= |$)/g,   // "3η Νοεμβρίου" -> "3 Νοεμβρίου"
  months: {
    "ιανουάριος": 1, "ιανουαρίου": 1, "ιανουάριο": 1, "γενάρης": 1, "γενάρη": 1,
    "φεβρουάριος": 2, "φεβρουαρίου": 2, "φεβρουάριο": 2, "φλεβάρης": 2, "φλεβάρη": 2,
    "μάρτιος": 3, "μαρτίου": 3, "μάρτιο": 3, "μάρτης": 3, "μάρτη": 3,
    "απρίλιος": 4, "απριλίου": 4, "απρίλιο": 4, "απρίλης": 4, "απρίλη": 4,
    "μάιος": 5, "μαΐου": 5, "μάιο": 5, "μάης": 5, "μάη": 5,
    "ιούνιος": 6, "ιουνίου": 6, "ιούνιο": 6, "ιούνης": 6, "ιούνη": 6,
    "ιούλιος": 7, "ιουλίου": 7, "ιούλιο": 7, "ιούλης": 7, "ιούλη": 7,
    "αύγουστος": 8, "αυγούστου": 8, "αύγουστο": 8,
    "σεπτέμβριος": 9, "σεπτεμβρίου": 9, "σεπτέμβριο": 9, "σεπτέμβρης": 9, "σεπτέμβρη": 9,
    "οκτώβριος": 10, "οκτωβρίου": 10, "οκτώβριο": 10, "οκτώβρης": 10, "οκτώβρη": 10,
    "νοέμβριος": 11, "νοεμβρίου": 11, "νοέμβριο": 11, "νοέμβρης": 11, "νοέμβρη": 11,
    "δεκέμβριος": 12, "δεκεμβρίου": 12, "δεκέμβριο": 12, "δεκέμβρης": 12, "δεκέμβρη": 12
  },
  weekdays: {
    "κυριακή": 0, "δευτέρα": 1, "τρίτη": 2, "τετάρτη": 3, "πέμπτη": 4, "παρασκευή": 5, "σάββατο": 6,
    "κυριακής": 0, "δευτέρας": 1, "τρίτης": 2, "τετάρτης": 3, "πέμπτης": 4, "παρασκευής": 5, "σαββάτου": 6
  },
  nums: {
    "μία": 1, "μια": 1, "ένα": 1, "δύο": 2, "τρεις": 3, "τρία": 3, "τέσσερις": 4, "τέσσερα": 4, "πέντε": 5, "έξι": 6,
    "επτά": 7, "εφτά": 7, "οκτώ": 8, "οχτώ": 8, "εννέα": 9, "εννιά": 9, "δέκα": 10, "έντεκα": 11, "ένδεκα": 11, "δώδεκα": 12
  },
  counts: {
    "ένα": 1, "έναν": 1, "μία": 1, "μια": 1, "δύο": 2, "τρεις": 3, "τρία": 3, "τέσσερις": 4, "τέσσερα": 4, "πέντε": 5, "έξι": 6,
    "επτά": 7, "εφτά": 7, "οκτώ": 8, "οχτώ": 8, "εννέα": 9, "εννιά": 9, "δέκα": 10, "δεκαπέντε": 15, "είκοσι": 20, "τριάντα": 30
  },
  ordinals: { "πρώτη": 1 },
  pre: "(?:στις |στη |στην |τις |την |τη |μέχρι |ως |έως |από |πριν |για |της )*",
  yJoin: "(?:του )?",
  parts: {
    "τέλη": "end", "στα τέλη": "end", "τέλη του": "end", "στα τέλη του": "end", "τέλος": "end", "τέλος του": "end", "στο τέλος του": "end",
    "αρχές": "start", "στις αρχές": "start", "αρχές του": "start", "στις αρχές του": "start", "αρχή του": "start", "στην αρχή του": "start",
    "μέσα": "mid", "στα μέσα": "mid", "μέσα του": "mid", "στα μέσα του": "mid"
  },
  partPre: "(?:μέχρι |ως |έως |για |από )?",
  monthPre: "(?:τον |το |μέσα στον |στον |μέχρι τον |ως τον |έως τον |από τον |για τον |του )?", numMonthPre: "(?:τον |στο |μέχρι |ως |έως )?",
  today: ["σήμερα", "απόψε"], tomorrow: ["αύριο"], dayAfter: ["μεθαύριο"],
  inWord: "(?:μέσα σε|σε)",
  units: { day: ["μέρες", "ημέρες", "μέρα", "ημέρα"], week: ["εβδομάδες", "εβδομάδα", "βδομάδες", "βδομάδα"], month: ["μήνες", "μήνα", "μήνας"], year: ["χρόνια", "χρόνο", "χρόνος", "έτη", "έτος"] },
  rel: [[["την άλλη εβδομάδα", "την επόμενη εβδομάδα", "την ερχόμενη εβδομάδα", "την άλλη βδομάδα", "την επόμενη βδομάδα", "άλλη εβδομάδα", "επόμενη εβδομάδα", "άλλη βδομάδα"], { days: 7 }],
    [["τον άλλο μήνα", "τον επόμενο μήνα", "τον ερχόμενο μήνα", "άλλο μήνα", "επόμενο μήνα"], { months: 1 }],
    [["του χρόνου", "τον άλλο χρόνο", "τον επόμενο χρόνο", "το επόμενο έτος", "επόμενο χρόνο", "άλλο χρόνο"], { months: 12 }]],
  wdPre: "(?:την |τη |το |μέχρι |ως |έως |από |για |επόμενη |επόμενο |άλλη |άλλο |ερχόμενη |ερχόμενο |αυτή |αυτό |αυτήν |της |του )*",
  wdNext: /επόμεν|άλλη|άλλο|ερχόμεν/,
  // "στις 10", "στις 10:30", "στη μία", "στις 3 και μισή", "στις 4 παρά τέταρτο"
  times: function (H, hourOf) {
    var AT = " (?:στις |στη |γύρω στις |κατά τις |από τις |μέχρι τις )?";
    function exact(m) { return { h: +m[1], m: m[2] ? +m[2] : 0, padded: /^0\d/.test(m[1]) }; }
    return [
      [AT + H + " και μισή", function (m) { return { h: hourOf(m[1]), m: 30 }; }],
      [AT + H + " και τέταρτο", function (m) { return { h: hourOf(m[1]), m: 15 }; }],
      [AT + H + " παρά τέταρτο", function (m) { return { h: hourOf(m[1]) - 1, m: 45 }; }],
      [AT + "(\\d{1,2}):(\\d{2})", exact],
      [" (?:στις|στη|γύρω στις|κατά τις|από τις|μέχρι τις) (\\d{1,2})(?:\\.(\\d{2}))?", exact],
      [" (?:στις|στη|γύρω στις|κατά τις|από τις|μέχρι τις) " + H, function (m) { return { h: hourOf(m[1]), m: 0 }; }],
      [" (?:τα )?μεσάνυχτα", function () { return { h: 0, m: 0, fixed: true }; }],
      [" (?:το )?μεσημέρι", function () { return { h: 12, m: 0, fixed: true }; }]
    ];
  },
  pm: / (το απόγευμα|απόγευμα|το βράδυ|βράδυ|απόψε|το μεσημέρι|μεσημέρι|μ\.μ\.|μμ)(?= )/,
  am: / (το πρωί|πρωί|τα ξημερώματα|ξημερώματα|τη νύχτα|νύχτα|π\.μ\.|πμ)(?= )/,
  dueWords: /αναμνηστικ|λήγει|λήξη|επόμεν/,
  keywords: [
    ["kinderpass", ["διαβατήριο του παιδιού", "παιδικό διαβατήριο", "διαβατήριο της κόρης", "διαβατήριο του γιου", "ταυτότητα του παιδιού", "ταυτότητα της κόρης", "ταυτότητα του γιου"]],
    ["hochzeitstag", ["επέτειο"]],
    // "γιορτή " mit Leerzeichen: Namenstag, aber nicht "γιορτές" (Feiertage)
    ["geburtstag", ["γενέθλια", "γιορτή "]],
    ["kinderarzt", ["παιδίατρ", "εμβόλιο του παιδιού", "εμβόλιο του μωρού", "εμβόλιο παιδιού"]],
    ["schule", ["σχολεί", "σχολικ", "παιδικό σταθμό", "παιδικός σταθμός", "νηπιαγωγεί", "βρεφονηπιακ", "συνάντηση γονέων", "ενημέρωση γονέων"]],
    ["reiseimpfung", ["εμβόλιο για το ταξίδι", "εμβόλια για το ταξίδι", "εμβόλια για ταξίδι", "εμβολιασμός για το ταξίδι", "κίτρινο πυρετό", "ελονοσία"]],
    ["reiseversicherung", ["ταξιδιωτική ασφάλεια", "ταξιδιωτική ασφάλιση", "ασφάλεια ταξιδιού", "ασφάλιση ταξιδιού"]],
    ["einreise", ["βίζα", "θεώρηση εισόδου", "άδεια εισόδου", " esta ", "etias"]],
    ["checkin", ["check-in", "checkin", "check in", "τσεκ ιν"]],
    ["storno", ["δωρεάν ακύρωση", "ακύρωση κράτησης", "ακύρωση της κράτησης"]],
    ["reisepass", ["διαβατήριο"]],
    ["reise", ["διακοπές", "ταξίδι", "εκδρομή"]],
    ["fuehrerschein", ["δίπλωμα", "άδεια οδήγησης"]],
    ["aufenthaltstitel", ["άδεια διαμονής", "διαμονής", "βίζα", "θεώρηση"]],
    ["personalausweis", ["ταυτότητ"]],
    ["rechnung", ["λογαριασμ", "τιμολόγ"]],
    ["tuev", ["κτεο"]],
    ["zahnarzt", ["οδοντίατρ", "δόντια", "δοντιών"]],
    ["checkup", ["τσεκ απ", "τσεκ-απ", "check-up", "checkup", "check up", "εξετάσεις", "αιματολογικ"]],
    ["tetanus", ["τέτανο", "αντιτετανικ", "εμβόλι", "αναμνηστική"]],
    ["inspektion", ["σέρβις", "service", "λάδια", "συνεργείο"]],
    // Versicherung vor Handy: "ασφάλεια αυτοκινήτου" enthält "κινητ"
    ["versicherung", ["ασφάλεια", "ασφάλισ", "ασφαλιστ"]],
    ["handy", [" κινητ", "τηλέφων", "ίντερνετ", "internet", "cosmote", "vodafone", " nova ", " wind "]],
    ["strom", ["ρεύμα", "ρεύματος", "ηλεκτρικ", "φυσικό αέριο", "αερίου", "ενέργεια", " δεη "]],
    ["abo", ["γυμναστήριο", "συνδρομή", "netflix", "spotify"]],
    ["arzttermin", ["γιατρ", "ιατρ", "παθολόγ", "καρδιολόγ", "γυναικολόγ", "παιδίατρ", "οφθαλμίατρ", "δερματολόγ", "φυσικοθεραπ", "νοσοκομείο", "κλινική"]],
    ["rechnung", ["πληρωμή", "πληρώσω", "πλήρωσε", "ενοίκιο", "νοίκι", "έμβασμα"]]
  ],
  fillers: [
    "hey livo", "χέι λίβο", "χεϊ λίβο", "γεια σου λίβο", "γεια σου livo", "λίβο", "livo",
    "θύμισέ μου να", "θύμισέ μου ότι", "θύμισέ μου", "θύμισε μου να", "θύμισε μου", "υπενθύμισέ μου", "πρέπει να",
    "το απόγευμα", "το βράδυ", "το πρωί", "το μεσημέρι", "παρακαλώ", "μου", "η", "ο", "το", "τα", "τη", "την", "τον", "του", "της",
    "τις", "στις", "στο", "στη", "στην", "στον", "λήγει", "μέχρι", "ως", "έως", "και", "να", "ότι", "πρέπει", "είναι", "ώρα"
  ],
  whatWord: { versicherung: /ασφάλεια (?:του |της )?[α-ωάέήίόύώϊϋΐΰ]+/i, abo: /(γυμναστήριο|netflix|spotify|συνδρομή [α-ωάέήίόύώ]+)/i },
  whatSkip: []
};

/* ---------- Spanisch ---------- */
LEX.es = {
  fold: true, todayFirst: true,
  months: {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9,
    octubre: 10, noviembre: 11, diciembre: 12, ene: 1, feb: 2, abr: 4, jun: 6, jul: 7, sept: 9, oct: 10, nov: 11, dic: 12
  },
  weekdays: { domingo: 0, lunes: 1, martes: 2, "miércoles": 3, jueves: 4, viernes: 5, "sábado": 6 },
  nums: { una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12 },
  counts: { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30 },
  ordinals: { primero: 1 },
  pre: "(?:el |hasta |antes |del |de |desde |para |a partir |a |al |día )*",
  dmJoin: "(?:de )?", yJoin: "(?:de |del )?",
  parts: {
    "finales de": "end", "a finales de": "end", "fin de": "end", "a fin de": "end", "final de": "end", "al final de": "end",
    "principios de": "start", "a principios de": "start", "comienzos de": "start", "inicio de": "start", "a inicios de": "start",
    "mediados de": "mid", "a mediados de": "mid"
  },
  partPre: "(?:para |hasta |antes de )?",
  monthPre: "(?:en |para |hasta |antes de |a partir de |desde |de |durante )?", numMonthPre: "(?:en |para |hasta )?",
  today: ["hoy", "esta noche", "esta tarde", "esta mañana"], tomorrow: ["mañana"], dayAfter: ["pasado mañana"],
  preCut: ["por la mañana", "de la mañana", "en la mañana"],
  inWord: "(?:dentro de|en)", units: { day: ["días", "día"], week: ["semanas", "semana"], month: ["meses", "mes"], year: ["años", "año"] },
  rel: [[["la semana que viene", "la próxima semana", "la semana próxima", "semana que viene", "próxima semana"], { days: 7 }],
    [["el mes que viene", "el próximo mes", "el mes próximo", "mes que viene", "próximo mes"], { months: 1 }],
    [["el año que viene", "el próximo año", "el año próximo", "año que viene", "próximo año"], { months: 12 }]],
  wdPre: "(?:el |este |esta |hasta |antes del |para el |próximo )*", wdNext: /próxim/,
  // "a las 10", "a las 10:30", "a la una", "a las 3 y media", "a las 4 menos cuarto", "al mediodía"
  times: function (H, hourOf) {
    var P = "(?:a las|a la|sobre las|sobre la|hacia las|hacia la|desde las|para las|antes de las|a eso de las)";
    var AT = " (?:" + P + " )?";
    function exact(m) { return { h: +m[1], m: m[2] ? +m[2] : 0, padded: /^0\d/.test(m[1]) }; }
    return [
      [AT + H + " y media", function (m) { return { h: hourOf(m[1]), m: 30 }; }],
      [AT + H + " y cuarto", function (m) { return { h: hourOf(m[1]), m: 15 }; }],
      [AT + H + " menos cuarto", function (m) { return { h: hourOf(m[1]) - 1, m: 45 }; }],
      [AT + "(\\d{1,2}):(\\d{2})(?: h| horas)?", exact],
      [" " + P + " (\\d{1,2})(?:\\.(\\d{2}))?(?: h| horas?| en punto)?", exact],
      [" " + P + " " + H + "(?: en punto)?", function (m) { return { h: hourOf(m[1]), m: 0 }; }],
      [" (?:al |a )?mediodía", function () { return { h: 12, m: 0, fixed: true }; }],
      [" (?:a )?medianoche", function () { return { h: 0, m: 0, fixed: true }; }]
    ];
  },
  pm: / (de la tarde|por la tarde|esta tarde|de la noche|por la noche|esta noche|pm)(?= )/,
  am: / (de la mañana|por la mañana|en la mañana|esta mañana|de la madrugada|madrugada|am)(?= )/,
  dueWords: /refuerzo|vence|vencimiento|caduca|próxim|toca/,
  keywords: [
    ["kinderpass", ["pasaporte del niño", "pasaporte de la niña", "pasaporte de mi hijo", "pasaporte de mi hija", "dni del niño", "dni de la niña", "dni de mi hijo", "dni de mi hija"]],
    ["hochzeitstag", ["aniversario"]],
    ["geburtstag", ["cumpleaños", "onomástica"]],
    ["kinderarzt", ["pediatra", "vacuna del niño", "vacuna de la niña", "vacuna de mi hijo", "vacuna de mi hija", "revisión del niño", "revisión de la niña", "revisión del bebé"]],
    ["schule", ["colegio", "escuela", "guardería", "reunión de padres", "tutoría", "jardín de infancia", " cole "]],
    ["reiseimpfung", ["vacuna para el viaje", "vacunas para el viaje", "vacunación para el viaje", "vacunación internacional", "fiebre amarilla", "malaria"]],
    ["reiseversicherung", ["seguro de viaje", "seguro médico de viaje", "seguro de viajes"]],
    ["einreise", ["visado", " visa ", "etias", "autorización de viaje"]],
    ["checkin", ["check-in", "checkin", "check in"]],
    ["storno", ["cancelación gratuita", "cancelar gratis", "anular la reserva", "cancelar la reserva"]],
    ["reisepass", ["pasaporte"]],
    ["reise", ["vacaciones", " viaje ", "escapada"]],
    ["personalausweis", [" dni ", "documento de identidad", "documento nacional", "carnet de identidad", "carné de identidad", "cédula"]],
    ["fuehrerschein", ["carnet de conducir", "carné de conducir", "permiso de conducir", "licencia de conducir", "carnet", "carné"]],
    ["aufenthaltstitel", ["permiso de residencia", "tarjeta de residencia", "residencia", " tie ", " nie ", "visado"]],
    ["rechnung", ["factura", "recibo"]],
    ["tuev", [" itv ", "inspección técnica", "revisión técnica"]],
    ["zahnarzt", ["dentista", "dental", "limpieza de dientes"]],
    ["checkup", ["chequeo", "revisión médica", "reconocimiento médico", "check-up", "checkup", "análisis de sangre", "analítica"]],
    ["tetanus", ["tétanos", "vacuna", "refuerzo"]],
    ["inspektion", ["revisión del coche", "revisión", "cambio de aceite", "taller", "mantenimiento"]],
    ["handy", ["contrato de móvil", "móvil", "teléfono", "fibra", "internet", "movistar", "vodafone", "orange", "jazztel"]],
    ["strom", ["luz", "electricidad", " gas ", "energía", "iberdrola", "endesa", "naturgy"]],
    ["abo", ["gimnasio", "suscripción", "netflix", "spotify", "abono", "membresía", "cuota"]],
    ["versicherung", ["seguro", "póliza"]],
    ["arzttermin", ["médico", "médica", "doctor", "cita médica", "fisio", "clínica", "hospital", "consulta", "centro de salud", "pediatra", "ginecólog", "oculista", "dermatólog"]],
    ["rechnung", [" pagar ", "transferencia", "alquiler"]]
  ],
  fillers: [
    "hey livo", "oye livo", "hola livo", "ok livo", "livo", "recuérdame que", "recuérdame", "recuerdame que", "recuerdame",
    "por favor", "tengo que", "hay que", "por la tarde", "por la noche", "de la tarde", "de la noche", "de la mañana", "en punto",
    "mi", "mis", "el", "la", "los", "las", "de", "del", "que", "caduca", "vence", "hasta", "antes", "a", "al", "para", "y",
    "es", "en", "dentro", "próximo", "próxima", "tarde", "noche", "horas", "hora"
  ],
  whatWord: { versicherung: /seguro(?: [a-záéíóúñ]+)?/i, abo: /(gimnasio|netflix|spotify|suscripción [a-záéíóúñ]+)/i },
  whatSkip: ["seguro"]
};

/* ---------- Französisch ---------- */
LEX.fr = {
  fold: true, elide: true,
  prep: function (s) { return splitElision(s).replace(/\bmi-/gi, "mi "); },
  ordSuffix: /(\d+)(?:ère|ème|er|re|eme|e)(?= |$)/gi,   // "1er", "3e" -> "1", "3"
  months: {
    janvier: 1, "février": 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, "août": 8, septembre: 9, octobre: 10,
    novembre: 11, "décembre": 12, janv: 1, "févr": 2, avr: 4, juil: 7, sept: 9, oct: 10, nov: 11, "déc": 12
  },
  weekdays: { dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6 },
  nums: { une: 1, un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12 },
  counts: { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, quinze: 15, vingt: 20, trente: 30 },
  ordinals: { premier: 1 },
  pre: "(?:le |l' |au |du |jusqu' au |jusqu' |avant |à partir du |d' ici |pour |dès )*",
  parts: {
    fin: "end", "fin de": "end", "fin d'": "end", "à la fin de": "end", "à la fin d'": "end", "la fin de": "end", "la fin d'": "end",
    "début": "start", "début de": "start", "début d'": "start", "au début de": "start", "au début d'": "start", "le début de": "start", "le début d'": "start",
    mi: "mid", "à la mi": "mid", "milieu de": "mid", "au milieu de": "mid"
  },
  partPre: "(?:d' ici |avant |pour |vers |jusqu' à )?",
  monthPre: "(?:en |au mois de |au mois d' |d' ici |avant |pour |courant |dès |à partir de |à partir d' |jusqu' en )?", numMonthPre: "(?:en |d' ici |avant )?",
  today: ["aujourd' hui", "ce soir", "ce matin", "cet après-midi", "cette nuit"], tomorrow: ["demain"], dayAfter: ["après-demain", "après demain"],
  inWord: "(?:dans|d' ici)", units: { day: ["jours", "jour"], week: ["semaines", "semaine"], month: ["mois"], year: ["années", "année", "ans", "an"] },
  rel: [[["la semaine prochaine", "semaine prochaine"], { days: 7 }],
    [["le mois prochain", "mois prochain"], { months: 1 }],
    [["l' année prochaine", "l' an prochain", "année prochaine", "an prochain"], { months: 12 }]],
  wdPre: "(?:le |ce |d' ici |avant |jusqu' à |jusqu' au |pour |dès |à partir de )*", wdNext: null,
  // "à 15 h", "à 15h30", "à 15:30", "à 3 heures et demie", "à 4 heures moins le quart", "à midi"
  times: function (H, hourOf) {
    var AT = " (?:à |vers |dès |avant |pour |jusqu' à )?";
    function exact(m) { return { h: +m[1], m: m[2] ? +m[2] : 0, padded: /^0\d/.test(m[1]) }; }
    return [
      [AT + H + " ?(?:h|heures?) et demie?", function (m) { return { h: hourOf(m[1]), m: 30 }; }],
      [AT + H + " ?(?:h|heures?) et quart", function (m) { return { h: hourOf(m[1]), m: 15 }; }],
      [AT + H + " ?(?:h|heures?) moins (?:le )?quart", function (m) { return { h: hourOf(m[1]) - 1, m: 45 }; }],
      [AT + "midi et demie?", function () { return { h: 12, m: 30, fixed: true }; }],
      [AT + "(\\d{1,2}) ?(?:h|heures?)(?: ?(\\d{2}))?", exact],
      [AT + "(\\d{1,2}):(\\d{2})", exact],
      [AT + H + " heures?", function (m) { return { h: hourOf(m[1]), m: 0 }; }],
      [AT + "midi", function () { return { h: 12, m: 0, fixed: true }; }],
      [AT + "minuit", function () { return { h: 0, m: 0, fixed: true }; }]
    ];
  },
  pm: / (de l' après-midi|l' après-midi|cet après-midi|après-midi|du soir|ce soir|le soir|soir)(?= )/,
  am: / (du matin|ce matin|le matin|matin|de la nuit|cette nuit)(?= )/,
  dueWords: /rappel|expire|échéance|prochain/,
  keywords: [
    ["kinderpass", ["passeport de l' enfant", "passeport enfant", "passeport de mon fils", "passeport de ma fille", "carte d' identité de l' enfant", "carte d' identité de mon fils", "carte d' identité de ma fille"]],
    // Hochzeitstag vor Geburtstag: "anniversaire de mariage" enthält "anniversaire"
    ["hochzeitstag", ["anniversaire de mariage"]],
    ["geburtstag", ["anniversaire"]],
    ["kinderarzt", ["pédiatre", "vaccin de l' enfant", "vaccin du bébé", "vaccin de mon fils", "vaccin de ma fille", " pmi "]],
    ["schule", ["école", "crèche", "maternelle", "nounou", "réunion parents", "réunion des parents", "rentrée scolaire", "inscription scolaire", "sortie scolaire", "collège", "lycée"]],
    ["reiseimpfung", ["vaccin pour le voyage", "vaccins pour le voyage", "vaccins de voyage", "vaccination pour le voyage", "fièvre jaune", "paludisme"]],
    ["reiseversicherung", ["assurance voyage", "assurance santé voyage", "assurance santé à l'étranger", "assurance rapatriement"]],
    ["einreise", [" visa ", " esta ", "etias", "autorisation de voyage"]],
    ["checkin", ["check-in", "checkin", "check in", "enregistrement"]],
    ["storno", ["annulation gratuite", "annuler gratuitement", "annuler sans frais", "annuler la réservation"]],
    ["reisepass", ["passeport"]],
    ["reise", ["vacances", " voyage ", "séjour"]],
    ["personalausweis", ["carte d' identité", "carte identité", "pièce d' identité", " cni "]],
    ["fuehrerschein", ["permis de conduire", "permis"]],
    ["aufenthaltstitel", ["titre de séjour", "carte de séjour", "séjour", " visa "]],
    ["rechnung", ["facture"]],
    ["tuev", ["contrôle technique"]],
    ["zahnarzt", ["dentiste", "dentaire", "détartrage"]],
    ["checkup", ["bilan de santé", "check-up", "checkup", "bilan", "dépistage", "prise de sang"]],
    ["tetanus", ["tétanos", "vaccin", " rappel "]],
    ["inspektion", ["révision", "vidange", "entretien de la voiture", "entretien voiture", "garage"]],
    ["handy", ["forfait", "téléphon", "portable", "mobile", " box ", "internet", "fibre", " sfr ", "orange", "bouygues", " free "]],
    ["strom", ["électricité", "électrique", " gaz ", "énergie", " edf ", "engie"]],
    ["abo", ["salle de sport", "abonnement", "netflix", "spotify", "adhésion", " gym ", " sport "]],
    ["versicherung", ["assurance", "mutuelle"]],
    ["arzttermin", ["médecin", "docteur", " dr ", "kiné", "généraliste", "hôpital", "clinique", "cabinet", "ophtalmo", "gynéco", "dermato", "pédiatre"]],
    ["rechnung", [" payer ", "virement", "loyer", " régler "]]
  ],
  fillers: [
    "hey livo", "salut livo", "ok livo", "livo", "rappelle-moi de", "rappelle-moi d'", "rappelle-moi que", "rappelle-moi",
    "rappelle moi", "n' oublie pas de", "n' oublie pas", "s' il te plaît", "s' il vous plaît", "il faut que", "il faut",
    "je dois", "de l' après-midi", "l' après-midi", "du soir", "du matin", "expire le", "se termine le", "expire", "se termine",
    "échéance", "d' ici", "mon", "ma", "mes", "le", "la", "les", "l'", "de", "du", "des", "à", "au", "aux", "que", "qu'", "avant",
    "jusqu'", "pour", "et", "est", "dans", "ce", "cet", "cette", "prochain", "prochaine", "heures", "heure", "h", "soir", "matin"
  ],
  whatWord: { versicherung: /assurance(?: [a-zàâçéèêëîïôûùüÿœ]+)?/i, abo: /(salle de sport|netflix|spotify|abonnement [a-zàâçéèêëîïôûùüÿœ]+)/i },
  whatSkip: ["assurance"]
};

/* ---------- Niederländisch ---------- */
LEX.nl = {
  fold: true,
  ordSuffix: /(\d+)(?:ste|de|e)(?= |$)/gi,   // "3e", "1ste" -> "3", "1"
  months: {
    januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6, juli: 7, augustus: 8, september: 9, oktober: 10,
    november: 11, december: 12, jan: 1, feb: 2, mrt: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, okt: 10, nov: 11, dec: 12
  },
  weekdays: { zondag: 0, maandag: 1, dinsdag: 2, woensdag: 3, donderdag: 4, vrijdag: 5, zaterdag: 6 },
  nums: { "één": 1, een: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9, tien: 10, elf: 11, twaalf: 12 },
  counts: { "één": 1, een: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9, tien: 10, elf: 11, twaalf: 12, vijftien: 15, twintig: 20, dertig: 30 },
  ordinals: { eerste: 1 },
  pre: "(?:op |tot |tot en met |t/m |vanaf |voor |uiterlijk |per |de )*",
  parts: { eind: "end", einde: "end", "eind van": "end", "aan het eind van": "end", begin: "start", "begin van": "start", "aan het begin van": "start", half: "mid", medio: "mid", midden: "mid", "midden van": "mid" },
  partPre: "(?:tot |voor |uiterlijk )?",
  monthPre: "(?:in |tot |vanaf |voor |uiterlijk |in de maand )?", numMonthPre: "(?:in |tot |voor )?",
  today: ["vandaag", "vanavond", "vanmiddag", "vanochtend", "vanmorgen", "vannacht"],
  tomorrow: ["morgen", "morgenochtend", "morgenmiddag", "morgenavond", "morgenvroeg"], dayAfter: ["overmorgen"],
  inWord: "(?:over|binnen)", units: { day: ["dagen", "dag"], week: ["weken", "week"], month: ["maanden", "maand"], year: ["jaren", "jaar"] },
  rel: [[["volgende week", "komende week"], { days: 7 }], [["volgende maand", "komende maand"], { months: 1 }],
    [["volgend jaar", "volgende jaar", "komend jaar"], { months: 12 }]],
  wdPre: "(?:op |tot |vanaf |voor |uiterlijk |volgende |komende |aanstaande |deze )*", wdNext: /volgende|komende/,
  // "om 10 uur", "om 10:30", "om half 4" (= 3:30), "kwart over 3", "kwart voor 4"
  times: function (H, hourOf) {
    var AT = " (?:om |rond |vanaf |tegen |omstreeks )?";
    function exact(m) { return { h: +m[1], m: m[2] ? +m[2] : 0, padded: /^0\d/.test(m[1]) }; }
    return [
      [AT + "half " + H + "(?: uur)?", function (m) { return { h: hourOf(m[1]) - 1, m: 30 }; }],
      [AT + "kwart over " + H, function (m) { return { h: hourOf(m[1]), m: 15 }; }],
      [AT + "kwart voor " + H, function (m) { return { h: hourOf(m[1]) - 1, m: 45 }; }],
      [AT + "(\\d{1,2})(?:[:.](\\d{2}))? ?uur", exact],
      [AT + "(\\d{1,2}):(\\d{2})", exact],
      [" (?:om|rond|vanaf|tegen|omstreeks) (\\d{1,2})\\.(\\d{2})", exact],
      [" (?:om|rond|tegen|omstreeks) " + H + "(?: uur)?", function (m) { return { h: hourOf(m[1]), m: 0, padded: /^0\d/.test(m[1]) }; }],
      [" (?:om )?middernacht", function () { return { h: 0, m: 0, fixed: true }; }]
    ];
  },
  pm: / ('s middags|'s avonds|vanmiddag|vanavond|morgenmiddag|morgenavond|in de middag|in de avond|middag|avond)(?= )/,
  am: / ('s ochtends|'s morgens|vanochtend|vanmorgen|morgenochtend|morgenvroeg|in de ochtend|'s nachts|ochtend|vannacht)(?= )/,
  dueWords: /herhaling|verloopt|vervalt|volgende/,
  keywords: [
    ["kinderpass", ["kinderpaspoort", "paspoort van mijn kind", "paspoort van mijn zoon", "paspoort van mijn dochter", "id-kaart van mijn kind", "identiteitskaart van mijn kind"]],
    // Trouwdag vor Verjaardag: "huwelijksverjaardag" enthält "verjaardag"
    ["hochzeitstag", ["trouwdag", "huwelijksverjaardag", "trouwjubileum"]],
    ["geburtstag", ["verjaardag", "jarig"]],
    ["kinderarzt", ["kinderarts", "consultatiebureau", "vaccinatie van mijn kind", "kinderprik"]],
    ["schule", ["school", "kinderopvang", "crèche", "kinderdagverblijf", " bso ", "ouderavond", "oudergesprek", "schoolreis"]],
    ["reiseimpfung", ["reisvaccinatie", "reisvaccin", "vaccinatie voor de reis", "gele koorts", "malaria"]],
    ["reiseversicherung", ["reisverzekering"]],
    ["einreise", ["visum", " esta ", "etias", "reistoestemming"]],
    ["checkin", ["check-in", "checkin", "check in", "inchecken"]],
    ["storno", ["gratis annuleren", "kosteloos annuleren", "boeking annuleren", "annuleren"]],
    ["reisepass", ["paspoort"]],
    ["reise", ["vakantie", " reis ", "op reis"]],
    ["fuehrerschein", ["rijbewijs"]],
    ["aufenthaltstitel", ["verblijfsvergunning", "verblijfsdocument", "visum"]],
    ["personalausweis", ["identiteitskaart", "id-kaart", "id kaart", " id ", "identiteitsbewijs"]],
    ["rechnung", ["rekening", "factuur", "acceptgiro"]],
    ["tuev", [" apk ", "keuring"]],
    ["zahnarzt", ["tandarts", "mondhygiën"]],
    ["checkup", ["check-up", "checkup", "bevolkingsonderzoek", "bloedonderzoek"]],
    ["tetanus", ["tetanus", "vaccinatie", "inenting", " prik "]],
    ["inspektion", ["onderhoudsbeurt", "grote beurt", "kleine beurt", "garage", "olie verversen"]],
    ["handy", ["telefoonabonnement", "mobiel abonnement", "sim only", "telefoon", "mobiel", "internet", "glasvezel", " kpn ", "vodafone", "odido", "ziggo"]],
    ["strom", ["energiecontract", "energie", "stroom", " gas ", "elektriciteit"]],
    ["abo", ["sportschool", "fitness", "abonnement", "netflix", "spotify", "lidmaatschap"]],
    ["versicherung", ["verzekering"]],
    ["arzttermin", ["dokter", "huisarts", " arts ", "specialist", "fysio", "ziekenhuis", "praktijk", " dr "]],
    ["rechnung", [" betalen ", "overmaken", " huur "]]
  ],
  fillers: [
    "hey livo", "hoi livo", "hallo livo", "ok livo", "livo", "herinner me eraan dat", "herinner me eraan", "herinner me aan",
    "herinner me", "herinner mij", "denk eraan", "alsjeblieft", "ik moet", "'s middags", "'s avonds", "'s ochtends", "'s morgens",
    "mijn", "m'n", "de", "het", "een", "aan", "op", "om", "tot", "voor", "is", "moet", "verloopt", "vervalt", "geldig", "uiterlijk",
    "en", "uur", "dat", "eraan"
  ],
  whatWord: { versicherung: /\S*verzekering\S*/i, abo: /\S*(?:sportschool|fitness|netflix|spotify)\S*/i },
  whatSkip: ["verzekering"]
};

/* ---------- Portugiesisch ---------- */
LEX.pt = {
  fold: true,
  months: {
    janeiro: 1, fevereiro: 2, "março": 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10,
    novembro: 11, dezembro: 12, jan: 1, fev: 2, abr: 4, jun: 6, jul: 7, set: 9, out: 10, nov: 11, dez: 12
  },
  weekdays: {
    domingo: 0, "segunda-feira": 1, segunda: 1, "terça-feira": 2, "terça": 2, "quarta-feira": 3, quarta: 3,
    "quinta-feira": 4, quinta: 4, "sexta-feira": 5, sexta: 5, "sábado": 6
  },
  nums: { uma: 1, um: 1, duas: 2, dois: 2, "três": 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12 },
  counts: { um: 1, uma: 1, dois: 2, duas: 2, "três": 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, quinze: 15, vinte: 20, trinta: 30 },
  ordinals: { primeiro: 1 },
  pre: "(?:no |dia |até |ao |a |em |desde |partir |de |do |para |o )*",
  dmJoin: "(?:de )?", yJoin: "(?:de )?",
  parts: {
    "fim de": "end", "no fim de": "end", "final de": "end", "no final de": "end", "finais de": "end", "nos finais de": "end", "fins de": "end",
    "início de": "start", "no início de": "start", "princípio de": "start", "no princípio de": "start", "começo de": "start", "no começo de": "start",
    "meados de": "mid", "em meados de": "mid"
  },
  partPre: "(?:até |para |antes de )?",
  monthPre: "(?:em |no mês de |até |a partir de |para |durante |de )?", numMonthPre: "(?:em |até |para )?",
  today: ["hoje", "esta noite", "esta tarde", "esta manhã"], tomorrow: ["amanhã"], dayAfter: ["depois de amanhã"],
  inWord: "(?:daqui a|dentro de|em)", units: { day: ["dias", "dia"], week: ["semanas", "semana"], month: ["meses", "mês"], year: ["anos", "ano"] },
  rel: [[["a próxima semana", "na próxima semana", "próxima semana", "semana que vem", "na semana que vem", "para a semana"], { days: 7 }],
    [["o próximo mês", "no próximo mês", "próximo mês", "mês que vem", "no mês que vem"], { months: 1 }],
    [["o próximo ano", "no próximo ano", "próximo ano", "ano que vem", "no ano que vem", "para o ano"], { months: 12 }]],
  wdPre: "(?:na |no |até |até à |até ao |a |à |próxima |próximo |esta |este |nesta |neste |para |de )*", wdNext: /próxim/,
  // "às 10", "às 10h30", "às 10:30", "à uma", "às 3 e meia", "às 4 menos um quarto", "ao meio-dia"
  times: function (H, hourOf) {
    var P = "(?:às|pelas|a partir das|por volta das|até às|antes das)";
    var AT = " (?:" + P + " )?";
    function exact(m) { return { h: +m[1], m: m[2] ? +m[2] : 0, padded: /^0\d/.test(m[1]) }; }
    return [
      [AT + H + " e meia", function (m) { return { h: hourOf(m[1]), m: 30 }; }],
      [AT + H + " e (?:um )?quarto", function (m) { return { h: hourOf(m[1]), m: 15 }; }],
      [AT + "(?:um )?quarto para as " + H, function (m) { return { h: hourOf(m[1]) - 1, m: 45 }; }],
      [AT + H + " menos (?:um )?quarto", function (m) { return { h: hourOf(m[1]) - 1, m: 45 }; }],
      [AT + "(\\d{1,2})(?: ?h ?|:)(\\d{2})", exact],
      [" " + P + " (\\d{1,2})(?:\\.(\\d{2}))?(?: ?h(?:oras)?)?", exact],
      [" (\\d{1,2}) ?h(?:oras)?", exact],
      [" " + P + " " + H, function (m) { return { h: hourOf(m[1]), m: 0 }; }],
      [" (?:à|pela) uma", function () { return { h: 1, m: 0 }; }],
      [" (?:ao |a )?meio-dia", function () { return { h: 12, m: 0, fixed: true }; }],
      [" (?:à |a )?meia-noite", function () { return { h: 0, m: 0, fixed: true }; }]
    ];
  },
  pm: / (da tarde|à tarde|de tarde|esta tarde|da noite|à noite|de noite|esta noite)(?= )/,
  am: / (da manhã|de manhã|pela manhã|esta manhã|da madrugada|de madrugada)(?= )/,
  dueWords: /reforço|vence|expira|próxim|validade/,
  keywords: [
    ["kinderpass", ["passaporte do meu filho", "passaporte da minha filha", "passaporte da criança", "cartão de cidadão do meu filho", "cartão de cidadão da minha filha", "cartão de cidadão da criança"]],
    // Casamento vor Geburtstag: "aniversário de casamento" enthält "aniversário"
    ["hochzeitstag", ["aniversário de casamento"]],
    ["geburtstag", ["aniversário", "faz anos"]],
    ["kinderarzt", ["pediatra", "vacina do bebé", "vacina do bebê", "vacina da criança", "vacina do meu filho", "vacina da minha filha", "consulta do bebé", "consulta do bebê"]],
    ["schule", ["escola", "creche", "infantário", "jardim de infância", "reunião de pais", "visita de estudo"]],
    ["reiseimpfung", ["vacina para a viagem", "vacinas para a viagem", "vacinas para viagem", "consulta do viajante", "febre amarela", "malária"]],
    ["reiseversicherung", ["seguro de viagem", "seguro de saúde em viagem"]],
    ["einreise", ["visto de entrada", "visto para", "o visto", "etias", "autorização de viagem"]],
    ["checkin", ["check-in", "checkin", "check in"]],
    ["storno", ["cancelamento gratuito", "cancelar grátis", "cancelar a reserva", "cancelar sem custos"]],
    ["reisepass", ["passaporte"]],
    ["reise", ["férias", " viagem ", "escapadinha"]],
    ["personalausweis", ["cartão de cidadão", " cc ", "bilhete de identidade", "carteira de identidade", " rg ", "documento de identidade"]],
    ["fuehrerschein", ["carta de condução", "carteira de motorista", "carteira de habilitação", " cnh ", "habilitação"]],
    ["aufenthaltstitel", ["autorização de residência", "título de residência", "residência"]],
    ["rechnung", ["fatura", "factura", "boleto"]],
    ["tuev", ["inspeção", "inspecção", " ipo ", "vistoria"]],
    ["zahnarzt", ["dentista", "dentário", "higiene oral"]],
    ["checkup", ["check-up", "checkup", "exames", "análises", "consulta de rotina"]],
    ["tetanus", ["tétano", "vacina", "reforço"]],
    ["inspektion", ["revisão", "mudança de óleo", "troca de óleo", "oficina"]],
    ["handy", ["tarifário", "telemóvel", "celular", "telefone", "internet", "fibra", " meo ", "vodafone", " nos ", " vivo ", " tim ", " claro "]],
    ["strom", [" luz ", "eletricidade", "electricidade", " gás ", "energia", " edp "]],
    ["abo", ["ginásio", "academia", "assinatura", "subscrição", "netflix", "spotify", "mensalidade"]],
    ["versicherung", ["seguro"]],
    ["arzttermin", ["médico", "médica", "doutor", "doutora", "consulta", "fisioterap", "fisio", "clínica", "hospital", "centro de saúde", "pediatra", "ginecolog", "oftalmolog", "dermatolog"]],
    ["rechnung", [" pagar ", "transferência", " renda ", "aluguel"]]
  ],
  fillers: [
    "hey livo", "olá livo", "ola livo", "ok livo", "livo", "lembra-me de", "lembra-me que", "lembra-me", "lembre-me de", "lembre-me",
    "me lembre de", "me lembra de", "por favor", "tenho de", "tenho que", "preciso de", "da tarde", "da noite", "da manhã", "de manhã",
    "à tarde", "à noite", "o meu", "a minha", "meu", "minha", "meus", "minhas", "o", "a", "os", "as", "de", "do", "da", "dos", "das",
    "que", "expira", "vence", "termina", "até", "ao", "à", "às", "para", "e", "é", "em", "no", "na", "dentro", "próximo", "próxima",
    "tarde", "noite", "manhã", "horas", "hora", "dia"
  ],
  whatWord: { versicherung: /seguro(?: [a-záàâãçéêíóôõú]+)?/i, abo: /(ginásio|academia|netflix|spotify|assinatura [a-záàâãçéêíóôõú]+)/i },
  whatSkip: ["seguro"]
};

/* ---------- Türkisch ---------- */
LEX.tr = {
  fold: true, suffix: "[a-z]*", wdBeforeRel: true,
  // "Kasım'da", "10'da" -> "Kasım", "10" (Endungen nach Apostroph abschneiden)
  prep: function (s) { return s.replace(/(\S)'[A-Za-zÇĞİÖŞÜçğıöşü]+/g, "$1"); },
  months: { ocak: 1, "şubat": 2, mart: 3, nisan: 4, "mayıs": 5, haziran: 6, temmuz: 7, "ağustos": 8, "eylül": 9, ekim: 10, "kasım": 11, "aralık": 12 },
  weekdays: { pazar: 0, pazartesi: 1, "salı": 2, "çarşamba": 3, "perşembe": 4, cuma: 5, cumartesi: 6 },
  nums: { bir: 1, iki: 2, "üç": 3, "dört": 4, "beş": 5, "altı": 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10, "on bir": 11, "on iki": 12 },
  counts: { bir: 1, iki: 2, "üç": 3, "dört": 4, "beş": 5, "altı": 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10, "on beş": 15, yirmi: 20, otuz: 30 },
  pre: "(?:en geç |en son )?",
  partsAfter: {
    sonunda: "end", sonu: "end", sonuna: "end", sonlarında: "end", "başında": "start", "başı": "start", "başına": "start",
    "başlarında": "start", "ortasında": "mid", "ortası": "mid", "ortalarında": "mid"
  },
  monthPre: "", numMonthPre: "",
  today: ["bugün", "bu akşam", "bu gece", "bu sabah"], tomorrow: ["yarın"], dayAfter: ["öbür gün", "yarından sonra"],
  inAfter: "sonra|içinde", units: { day: ["gün"], week: ["hafta"], month: ["ay"], year: ["yıl", "sene"] },
  rel: [[["haftaya", "gelecek hafta", "önümüzdeki hafta"], { days: 7 }], [["gelecek ay", "önümüzdeki ay"], { months: 1 }],
    [["gelecek yıl", "önümüzdeki yıl", "seneye", "gelecek sene", "önümüzdeki sene"], { months: 12 }]],
  wdPre: "(?:gelecek |önümüzdeki |bu |haftaya |en geç )*", wdNext: /gelecek|önümüzdeki|haftaya/,
  // "saat 10", "saat 10:30", "saat üçte", "saat 3 buçukta", "3 çeyrek geçe", "4 çeyrek kala", "akşam 7"
  // "akşam 8" / "sabah 9" (ohne "saat") gehören zur Uhrzeit und werden mit ihr herausgeschnitten -
  // deshalb dort pm/am setzen. Mit "saat" bleibt "bu akşam" stehen und wird als "heute" erkannt.
  times: function (H, hourOf) {
    var PM = " (?:akşam|öğleden sonra) ", AM = " (?:sabah|gece) ";
    function exact(m) { return { h: +m[1], m: m[2] ? +m[2] : 0, padded: /^0\d/.test(m[1]) }; }
    function with_(ampm, f) { return function (m) { var r = f(m); r.ampm = ampm; return r; }; }
    function word(m) { return { h: hourOf(m[1]), m: 0 }; }
    return [
      [" (?:saat )?" + H + "[a-z]* buçuk[a-z]*", function (m) { return { h: hourOf(m[1]), m: 30 }; }],
      [" (?:saat )?" + H + "[a-z]* çeyrek geçe", function (m) { return { h: hourOf(m[1]), m: 15 }; }],
      [" (?:saat )?" + H + "[a-z]* çeyrek kala", function (m) { return { h: hourOf(m[1]) - 1, m: 45 }; }],
      [" saat (\\d{1,2})(?:[:.](\\d{2}))?", exact],
      [" (\\d{1,2}):(\\d{2})", exact],
      [" saat " + H + "[a-z]*", word],
      [PM + "(\\d{1,2})(?:[:.](\\d{2}))?", with_("pm", exact)],
      [AM + "(\\d{1,2})(?:[:.](\\d{2}))?", with_("am", exact)],
      [PM + H + "[a-z]*", with_("pm", word)],
      [AM + H + "[a-z]*", with_("am", word)],
      [" öğle(?:n|yin)", function () { return { h: 12, m: 0, fixed: true }; }],
      [" gece yarısı[a-z]*", function () { return { h: 0, m: 0, fixed: true }; }]
    ];
  },
  pm: / (akşam|akşamleyin|akşamüstü|öğleden sonra|bu akşam)(?= )/,
  am: / (sabah|sabahleyin|bu sabah|gece)(?= )/,
  dueWords: /hatırlatma|bitiyor|doluyor|sonraki|gelecek/,
  keywords: [
    ["kinderpass", ["çocuğun pasaportu", "çocuk pasaportu", "oğlumun pasaportu", "kızımın pasaportu", "çocuğun kimliği", "oğlumun kimliği", "kızımın kimliği"]],
    ["hochzeitstag", ["evlilik yıldönümü", "yıldönümü"]],
    ["geburtstag", ["doğum günü", "doğumgünü"]],
    ["kinderarzt", ["çocuk doktoru", "pediatri", "çocuk hekim", "çocuğun aşısı", "bebeğin aşısı", "çocuk aşısı", "bebek aşısı"]],
    ["schule", ["okul", "kreş", "anaokulu", "veli toplantısı", "karne"]],
    ["reiseimpfung", ["seyahat aşısı", "seyahat aşıları", "sarı humma", "sıtma"]],
    ["reiseversicherung", ["seyahat sigortası", "seyahat sağlık sigortası", "yurt dışı sağlık sigortası"]],
    ["einreise", [" vize", " esta ", "etias", "seyahat izni"]],
    ["checkin", ["check-in", "checkin", "check in"]],
    ["storno", ["ücretsiz iptal", "rezervasyonu iptal", "rezervasyon iptal"]],
    ["reisepass", ["pasaport"]],
    ["reise", ["tatil", "seyahat", "yolculuk"]],
    ["fuehrerschein", ["ehliyet", "sürücü belgesi"]],
    ["aufenthaltstitel", ["oturma izni", "ikamet", " vize"]],
    ["personalausweis", ["kimli", "nüfus cüzdan"]],
    ["rechnung", ["fatura"]],
    ["tuev", ["araç muayene", "araba muayene", "muayene istasyon", "tüvtürk"]],
    ["zahnarzt", [" diş ", "dişçi", "diş hekim", "diş muayene", "diş kontrol"]],
    ["checkup", ["check-up", "checkup", "check up", "kontrol", "tahlil", "sağlık taraması"]],
    ["tetanus", ["tetanoz", " aşı"]],
    ["arzttermin", ["doktor", "hastane", "hekim", "fizik tedavi", "klinik", "muayene"]],
    ["inspektion", ["bakım", "yağ değişim", "servis", "tamirci"]],
    ["handy", ["telefon", " cep ", "internet", "fiber", "turkcell", "vodafone", "türk telekom", " hat "]],
    ["strom", ["elektrik", "doğalgaz", "doğal gaz", "enerji"]],
    ["abo", ["spor salonu", "üyelik", "abonelik", "netflix", "spotify", " gym "]],
    ["versicherung", ["sigorta", "kasko"]],
    ["rechnung", [" öde", "ödeme", " kira", "havale"]]
  ],
  fillers: [
    "hey livo", "merhaba livo", "livo", "bana hatırlat", "hatırlat bana", "hatırlat", "lütfen", "benim", "bitiyor", "sona eriyor",
    "doluyor", "geçerli", "kadar", "tarihinde", "günü", "saat", "ve", "için", "gerekiyor", "lazım", "en geç"
  ],
  keep: ["doğum günü"],
  whatWord: { versicherung: /([a-zçğıöşü]+ sigortas[ıi]|kasko)/i, abo: /(netflix|spotify|spor salonu|[a-zçğıöşü]+ üyeliği)/i },
  whatSkip: []
};

/* ---------- Polnisch ---------- */
LEX.pl = {
  fold: true, inNoNum: true,
  months: {
    "styczeń": 1, stycznia: 1, styczniu: 1, luty: 2, lutego: 2, lutym: 2, marzec: 3, marca: 3, marcu: 3,
    "kwiecień": 4, kwietnia: 4, kwietniu: 4, maj: 5, maja: 5, maju: 5, czerwiec: 6, czerwca: 6, czerwcu: 6,
    lipiec: 7, lipca: 7, lipcu: 7, "sierpień": 8, sierpnia: 8, sierpniu: 8, "wrzesień": 9, "września": 9, "wrześniu": 9,
    "październik": 10, "października": 10, "październiku": 10, listopad: 11, listopada: 11, listopadzie: 11,
    "grudzień": 12, grudnia: 12, grudniu: 12
  },
  weekdays: {
    niedziela: 0, "niedzielę": 0, niedzieli: 0, "poniedziałek": 1, "poniedziałku": 1, wtorek: 2, wtorku: 2,
    "środa": 3, "środę": 3, "środy": 3, czwartek: 4, czwartku: 4, "piątek": 5, "piątku": 5, sobota: 6, "sobotę": 6, soboty: 6
  },
  // Stunden sagt man mit Ordnungszahlen: "o trzeciej", "wpół do czwartej", "za kwadrans czwarta"
  nums: {
    pierwszej: 1, drugiej: 2, trzeciej: 3, czwartej: 4, "piątej": 5, "szóstej": 6, "siódmej": 7, "ósmej": 8, "dziewiątej": 9,
    "dziesiątej": 10, jedenastej: 11, dwunastej: 12, pierwsza: 1, druga: 2, trzecia: 3, czwarta: 4, "piąta": 5, "szósta": 6,
    "siódma": 7, "ósma": 8, "dziewiąta": 9, "dziesiąta": 10, jedenasta: 11, dwunasta: 12
  },
  counts: {
    jeden: 1, jedna: 1, jedno: 1, dwa: 2, dwie: 2, trzy: 3, cztery: 4, "pięć": 5, "sześć": 6, siedem: 7, osiem: 8,
    "dziewięć": 9, "dziesięć": 10, "jedenaście": 11, "dwanaście": 12, "piętnaście": 15, "dwadzieścia": 20, "trzydzieści": 30
  },
  ordinals: polishOrdinals(),
  pre: "(?:do |od |na |w dniu |dnia |dzień |przed |najpóźniej |po )*",
  parts: {
    koniec: "end", "pod koniec": "end", "na koniec": "end", "końca": "end", "do końca": "end", "z końcem": "end",
    "początek": "start", "na początku": "start", "początku": "start", "z początkiem": "start", "od początku": "start",
    "połowa": "mid", "w połowie": "mid", "połowy": "mid", "do połowy": "mid", "połowie": "mid"
  },
  partPre: "",
  monthPre: "(?:w |we |do |od |na |przed |po )?", numMonthPre: "(?:w |do |od )?",
  today: ["dziś", "dzisiaj"], tomorrow: ["jutro"], dayAfter: ["pojutrze"],
  inWord: "(?:za|w ciągu)",
  units: { day: ["dni", "dzień", "dnia"], week: ["tygodnie", "tygodni", "tydzień", "tygodnia"], month: ["miesiące", "miesięcy", "miesiąc", "miesiąca"], year: ["lata", "lat", "rok", "roku"] },
  rel: [[["w przyszłym tygodniu", "przyszły tydzień", "w następnym tygodniu", "następny tydzień"], { days: 7 }],
    [["w przyszłym miesiącu", "przyszły miesiąc", "w następnym miesiącu"], { months: 1 }],
    [["w przyszłym roku", "przyszły rok", "w następnym roku"], { months: 12 }]],
  wdPre: "(?:w |we |do |od |na |przyszły |przyszłą |następny |następną |najbliższy |najbliższą |ten |tę |tą )*", wdNext: /przyszł|następn/,
  // "o 10", "o 10:30", "o godzinie 15", "o trzeciej", "wpół do czwartej", "kwadrans po trzeciej", "w południe"
  times: function (H, hourOf) {
    function exact(m) { return { h: +m[1], m: m[2] ? +m[2] : 0, padded: /^0\d/.test(m[1]) }; }
    return [
      [" (?:o )?wpół do " + H, function (m) { return { h: hourOf(m[1]) - 1, m: 30 }; }],
      [" (?:o )?kwadrans po " + H, function (m) { return { h: hourOf(m[1]), m: 15 }; }],
      [" (?:za )?kwadrans " + H, function (m) { return { h: hourOf(m[1]) - 1, m: 45 }; }],
      [" (?:o |około |od |przed )?(?:godz\\.? |godzinie |godziny )?(\\d{1,2}):(\\d{2})", exact],
      [" (?:o|około|od|przed)(?: godz\\.?| godzinie| godziny)? (\\d{1,2})(?:\\.(\\d{2}))?", exact],
      [" (?:na|do) (?:godz\\.?|godzinę|godziny) (\\d{1,2})(?:[:.](\\d{2}))?", exact],
      [" (?:o|około|od|przed) " + H, function (m) { return { h: hourOf(m[1]), m: 0 }; }],
      [" (?:w |o )?południe", function () { return { h: 12, m: 0, fixed: true }; }],
      [" o północy", function () { return { h: 0, m: 0, fixed: true }; }]
    ];
  },
  pm: / (po południu|popołudniu|wieczorem|wieczór)(?= )/,
  am: / (rano|z rana|rankiem|przed południem|w nocy|nad ranem)(?= )/,
  dueWords: /dawk|przypominaj|wygasa|kończy|następn|kolejn/,
  keywords: [
    ["kinderpass", ["paszport dziecka", "paszportu dziecka", "paszport syna", "paszport córki", "dowód dziecka", "dowodu dziecka", "dowód osobisty dziecka", "dowód syna", "dowód córki"]],
    ["hochzeitstag", ["rocznica ślubu", "rocznicę ślubu", "rocznicy ślubu"]],
    ["geburtstag", ["urodzin", "imienin"]],
    // nur "szczepienie dziecka" - ein einfaches "szczepienie" bleibt bei Tetanus
    ["kinderarzt", ["pediatr", "bilans zdrowia", "bilansu zdrowia", "bilans dziecka", "szczepienie dziecka", "szczepienia dziecka", "szczepienie syna", "szczepienie córki"]],
    ["schule", ["szkoł", "szkole", "przedszkol", "żłob", "zebranie z rodzicami", "wywiadówk", "wycieczka szkolna", "wycieczkę szkolną"]],
    ["reiseimpfung", ["szczepienie przed podróżą", "szczepienia przed podróżą", "szczepionka na wyjazd", "żółta febra", "malaria"]],
    ["reiseversicherung", ["ubezpieczenie turystyczne", "ubezpieczenie podróżne", "ubezpieczenie na wyjazd"]],
    ["einreise", [" wiza", " wizę", " wizy ", " esta ", "etias", "zezwolenie na podróż"]],
    ["checkin", ["check-in", "checkin", "check in", "odprawa", "odprawę"]],
    ["storno", ["bezpłatne anulowanie", "darmowe anulowanie", "anulować rezerwację", "anulowanie rezerwacji"]],
    ["reisepass", ["paszport"]],
    ["reise", ["urlop", "wakacje", "wyjazd", "podróż", "wycieczka"]],
    ["fuehrerschein", ["prawo jazdy", "prawa jazdy", "prawem jazdy"]],
    // " wiza " mit Leerzeichen: "wizyta" (Arztbesuch) enthält "wiz…"
    ["aufenthaltstitel", ["karta pobytu", "karty pobytu", "kartę pobytu", "pobyt", " wiza ", " wizy ", " wizę "]],
    ["personalausweis", ["dowód osobisty", "dowodu osobistego", "dowód", "dowodu"]],
    ["rechnung", ["rachunek", "rachunku", "faktur"]],
    ["zahnarzt", ["dentyst", "stomatolog", "zęb"]],
    ["checkup", ["badania kontrolne", "badanie kontrolne", "badania okresowe", "check-up", "checkup", "morfologi"]],
    ["tetanus", ["tężec", "tężca", "szczepien", "szczepionk"]],
    ["tuev", ["przegląd techniczny", "przeglądu technicznego", "badanie techniczne", "przegląd auta", "przegląd samochodu", "przegląd"]],
    ["inspektion", ["serwis", "wymiana oleju", "warsztat", "mechanik"]],
    ["handy", ["umowa na telefon", "telefon", "komórk", "abonament", "internet", "światłowód", " play ", "orange", " plus ", "t-mobile"]],
    ["strom", ["prąd", "energi", " gaz ", "gazu", "elektryczn"]],
    ["abo", ["siłowni", "siłownia", "karnet", "subskrypcj", "netflix", "spotify", "członkostw"]],
    ["versicherung", ["ubezpieczeni", "polis", " oc ", " ac "]],
    ["arzttermin", ["lekarz", "lekark", "doktor", "przychodni", "szpital", "wizyt", "fizjoterap", "pediatr", "ginekolog", "okulist", "dermatolog"]],
    ["rechnung", ["zapłacić", "zapłać", "opłacić", "opłata", "przelew", "czynsz"]]
  ],
  fillers: [
    "hej livo", "hey livo", "cześć livo", "ok livo", "livo", "przypomnij mi o tym że", "przypomnij mi że", "przypomnij mi o",
    "przypomnij mi", "przypomnij", "po południu", "kończy się", "ważny do", "ważna do", "proszę", "muszę", "trzeba",
    "mój", "moja", "moje", "mojego", "mojej", "moim", "mi", "że", "o", "do", "na", "w", "we", "i", "się", "kończy",
    "wygasa", "ważny", "ważna", "jest", "dnia", "godzinie", "godz.", "godz", "rano", "wieczorem", "r."
  ],
  whatWord: { versicherung: /ubezpieczenie(?: [a-ząćęłńóśźż]+)?/i, abo: /(siłowni[a-ząćęłńóśźż]*|netflix|spotify|karnet[a-ząćęłńóśźż]*)/i },
  whatSkip: ["ubezpieczenie"]
};

Object.keys(LEX).forEach(function (k) { if (LEX[k].fold) foldLex(LEX[k]); });

// Wiederholung im gesprochenen Satz: "alle 3 Monate", "jede Woche", "jeden Montag", "montags".
// num = Wort vor Zahl + Einheit (Türkisch steht die Zahl vorn: "3 ayda bir", numAfter), fixed = feste Wendungen,
// wd = Wort vor einem Wochentag ("jeden Montag" = jede Woche, der Montag bleibt fürs Datum stehen),
// wdPl = Mehrzahl-Endung am Wochentag, wdAlone = die Mehrzahl allein heißt schon "jede Woche" ("montags"),
// fortnight = "15 Tage" ist die übliche Art, "alle 2 Wochen" zu sagen ("tous les quinze jours").
// Wird beim Suchen in die Suchfassung gebracht (lowerOf), deshalb hier mit Akzenten.
var REPEAT_LEX = {
  de: { num: ["alle"], wd: ["jeden"], wdPl: "s", wdAlone: true,
    units: { d: ["tage", "tag"], w: ["wochen", "woche"], m: ["monate", "monat"], y: ["jahre", "jahr"] },
    fixed: [["täglich", "d1"], ["jeden tag", "d1"], ["jeden zweiten tag", "d2"], ["wöchentlich", "d7"], ["jede woche", "d7"],
      ["zweiwöchentlich", "d14"], ["jede zweite woche", "d14"], ["alle vierzehn tage", "d14"], ["monatlich", "m1"], ["jeden monat", "m1"],
      ["jeden zweiten monat", "m2"], ["vierteljährlich", "m3"], ["halbjährlich", "m6"], ["jährlich", "m12"], ["jedes jahr", "m12"], ["jedes zweite jahr", "m24"],
      ["einmal pro woche", "d7"], ["einmal die woche", "d7"], ["einmal im monat", "m1"], ["jedes halbe jahr", "m6"], ["zweimal im jahr", "m6"], ["einmal im jahr", "m12"]] },
  en: { num: ["every"], wd: ["every", "each"], wdPl: "s", wdAlone: true,
    units: { d: ["days", "day"], w: ["weeks", "week"], m: ["months", "month"], y: ["years", "year"] },
    fixed: [["every day", "d1"], ["each day", "d1"], ["daily", "d1"], ["every other day", "d2"], ["every week", "d7"], ["each week", "d7"], ["weekly", "d7"],
      ["every other week", "d14"], ["fortnightly", "d14"], ["biweekly", "d14"], ["every month", "m1"], ["each month", "m1"], ["monthly", "m1"],
      ["every other month", "m2"], ["every quarter", "m3"], ["quarterly", "m3"], ["every year", "m12"], ["each year", "m12"], ["yearly", "m12"],
      ["annually", "m12"], ["every other year", "m24"],
      ["once a week", "d7"], ["once a month", "m1"], ["every half year", "m6"], ["twice a year", "m6"], ["once a year", "m12"]] },
  it: { num: ["ogni"], wd: ["ogni", "tutti i"], fortnight: true,
    units: { d: ["giorni", "giorno"], w: ["settimane", "settimana"], m: ["mesi", "mese"], y: ["anni", "anno"] },
    fixed: [["ogni giorno", "d1"], ["tutti i giorni", "d1"], ["ogni settimana", "d7"], ["tutte le settimane", "d7"], ["ogni mese", "m1"],
      ["tutti i mesi", "m1"], ["mensilmente", "m1"], ["ogni anno", "m12"], ["tutti gli anni", "m12"], ["annualmente", "m12"]] },
  el: { num: ["κάθε", "ανά"], wd: ["κάθε"],
    units: { d: ["μέρες", "ημέρες", "μέρα", "ημέρα"], w: ["εβδομάδες", "εβδομάδα", "βδομάδες", "βδομάδα"], m: ["μήνες", "μήνα", "μήνας"], y: ["χρόνια", "χρόνο", "χρόνος", "έτη"] },
    fixed: [["κάθε μέρα", "d1"], ["καθημερινά", "d1"], ["κάθε εβδομάδα", "d7"], ["κάθε βδομάδα", "d7"], ["εβδομαδιαία", "d7"], ["κάθε μήνα", "m1"],
      ["μηνιαία", "m1"], ["κάθε χρόνο", "m12"], ["κάθε χρονιά", "m12"], ["ετησίως", "m12"]] },
  es: { num: ["cada"], wd: ["cada", "todos los"], wdPl: "s", fortnight: true,
    units: { d: ["días", "día"], w: ["semanas", "semana"], m: ["meses", "mes"], y: ["años", "año"] },
    fixed: [["todos los días", "d1"], ["cada día", "d1"], ["a diario", "d1"], ["diariamente", "d1"], ["cada semana", "d7"], ["todas las semanas", "d7"],
      ["semanalmente", "d7"], ["quincenalmente", "d14"], ["cada mes", "m1"], ["todos los meses", "m1"], ["mensualmente", "m1"], ["cada año", "m12"],
      ["todos los años", "m12"], ["anualmente", "m12"]] },
  fr: { num: ["tous les", "toutes les"], wd: ["chaque", "tous les"], wdPl: "s", fortnight: true,
    units: { d: ["jours", "jour"], w: ["semaines", "semaine"], m: ["mois"], y: ["années", "année", "ans", "an"] },
    fixed: [["tous les jours", "d1"], ["chaque jour", "d1"], ["quotidiennement", "d1"], ["chaque semaine", "d7"], ["toutes les semaines", "d7"],
      ["chaque mois", "m1"], ["tous les mois", "m1"], ["mensuellement", "m1"], ["chaque année", "m12"], ["tous les ans", "m12"], ["chaque an", "m12"], ["annuellement", "m12"]] },
  nl: { num: ["elke", "iedere", "om de"], wd: ["elke", "iedere"],
    units: { d: ["dagen", "dag"], w: ["weken", "week"], m: ["maanden", "maand"], y: ["jaren", "jaar"] },
    fixed: [["elke dag", "d1"], ["iedere dag", "d1"], ["dagelijks", "d1"], ["om de dag", "d2"], ["elke week", "d7"], ["iedere week", "d7"], ["wekelijks", "d7"],
      ["om de week", "d14"], ["elke maand", "m1"], ["iedere maand", "m1"], ["maandelijks", "m1"], ["om de maand", "m2"], ["elk jaar", "m12"], ["ieder jaar", "m12"],
      ["jaarlijks", "m12"]] },
  pt: { num: ["a cada", "cada"], wd: ["todas as", "todos os", "toda", "todo", "cada"], wdPl: "(?:s-feiras|s)",
    units: { d: ["dias", "dia"], w: ["semanas", "semana"], m: ["meses", "mês"], y: ["anos", "ano"] },
    fixed: [["todos os dias", "d1"], ["todo dia", "d1"], ["cada dia", "d1"], ["diariamente", "d1"], ["todas as semanas", "d7"], ["toda semana", "d7"],
      ["cada semana", "d7"], ["semanalmente", "d7"], ["de duas em duas semanas", "d14"], ["quinzenalmente", "d14"], ["todos os meses", "m1"], ["todo mês", "m1"],
      ["cada mês", "m1"], ["mensalmente", "m1"], ["todos os anos", "m12"], ["todo ano", "m12"], ["cada ano", "m12"], ["anualmente", "m12"]] },
  tr: { numAfter: true, wd: ["her"], wdPl: "l[ae]r[ıi]", wdAlone: true,
    units: { d: ["günde"], w: ["haftada"], m: ["ayda"], y: ["yılda", "senede"] },
    fixed: [["her gün", "d1"], ["her hafta", "d7"], ["haftada bir", "d7"], ["her ay", "m1"], ["ayda bir", "m1"], ["her yıl", "m12"], ["her sene", "m12"], ["yılda bir", "m12"]] },
  pl: { num: ["co"], wd: ["w każdy", "w każdą", "co"],
    units: { d: ["dni", "dzień"], w: ["tygodnie", "tygodni", "tydzień"], m: ["miesiące", "miesięcy", "miesiąc"], y: ["lata", "lat", "rok", "roku"] },
    fixed: [["codziennie", "d1"], ["co dzień", "d1"], ["co tydzień", "d7"], ["co miesiąc", "m1"], ["co rok", "m12"], ["co roku", "m12"], ["corocznie", "m12"], ["co pół roku", "m6"]] }
};
Object.keys(REPEAT_LEX).forEach(function (k) { if (LEX[k]) LEX[k].rep = REPEAT_LEX[k]; });

function lexFor() { return LEX[LANG] || LEX.en; }

function norm(s) { return String(s).replace(/[’‘]/g, "'").replace(/[,;!?„“”"«»()]/g, " ").replace(/\s+/g, " ").trim(); }
// Schreibweisen vereinheitlichen, bevor gesucht wird (Länge darf sich hier ändern)
function prepare(text, L) {
  var s = norm(text);
  if (L.ordSuffix) s = s.replace(L.ordSuffix, "$1");
  s = s.replace(/(\d)[º°ª]/g, "$1");                    // "1º de noviembre"
  if (L.prep) s = L.prep(s);
  return s.replace(/\b([ap])\.m\.?/gi, "$1m").replace(/\bmid-/gi, "mid ");
}
// Französisch/Italienisch: "l'8", "aujourd'hui", "all'una" -> "l' 8" usw., damit Monate,
// Zahlen und Uhrzeiten als eigene Wörter gefunden werden (cleanTitle fügt es wieder zusammen)
function splitElision(s) { return s.replace(/'(?=\S)/g, "' "); }

function validDay(y, m, d) {
  var dt = new Date(y, m - 1, d);
  return dt.getMonth() === m - 1 ? dt : null;
}
// Ohne Jahreszahl gilt immer das laufende Jahr ("03.10" = 03.10. dieses Jahres,
// auch wenn der Tag vorbei ist); nur mit Jahr ("03.10.2027") ein anderes.
function yearOf(y) { return y ? (+y < 100 ? 2000 + +y : +y) : today().getFullYear(); }
// Tag + Monat
function dayMonth(d, m, y) {
  if (!d || !m || m > 12) return null;
  return validDay(yearOf(y), m, d);
}
// "end" = letzter Tag, "start" = 1., "mid" = 15.
function monthPart(m, y, part) {
  if (!m || m > 12) return null;
  var year = yearOf(y);
  return part === "start" ? new Date(year, m - 1, 1) : part === "mid" ? new Date(year, m - 1, 15) : new Date(year, m, 0);
}

function extract(text, L) {
  L = L || lexFor();
  var orig = " " + prepare(text, L) + " ";
  var low = lowerOf(orig, L);
  var t0 = today(), date = null, time = null, m;

  // Treffer aus beiden Fassungen herausschneiden (beide haben dieselbe Länge) - oder durch repl ersetzen
  function cut(match, repl) {
    var i = low.indexOf(match);
    if (i < 0) return;
    low = low.slice(0, i) + (repl || " ") + low.slice(i + match.length);
    orig = orig.slice(0, i) + (repl || " ") + orig.slice(i + match.length);
  }

  var MONTH = altKeys(L.months), ORD = L.ordinals ? altKeys(L.ordinals) : "", WD = altKeys(L.weekdays);
  var SFX = L.suffix || "", JOIN = L.dmJoin || "";

  // Uhrzeit zuerst, damit "um 10 Uhr" nicht als Datum gelesen wird - aber keine Zahl direkt
  // vor einem Monat ("στις 3 Νοεμβρίου" ist der 3. November, nicht 15 Uhr)
  var H = "(\\d{1,2}|" + altKeys(L.nums) + ")";
  var NOT_DATE = "(?! " + JOIN + "(?:" + MONTH + ")" + SFX + "[ .])";
  function hourOf(s) { return /\d/.test(s) ? +s : L.nums[s]; }
  var patterns = L.times(H, hourOf), tm = null;
  for (var i = 0; i < patterns.length && !tm; i++) {
    m = low.match(new RegExp(patterns[i][0] + NOT_DATE + "(?= )"));
    if (!m) continue;
    var r = patterns[i][1](m);
    if (r && r.h >= 0 && r.h < 24 && r.m < 60) { tm = r; cut(m[0]); }
  }
  if (tm) {
    var hour = tm.h;
    if (tm.ampm === "pm" && hour < 12) hour += 12;
    else if (tm.ampm === "am" && hour === 12) hour = 0;
    else if (!tm.ampm && !tm.fixed) {
      // Wie man spricht: "um 3" ist nachmittags, "um 9" vormittags - außer man sagt es dazu
      if (hour < 12 && L.pm.test(low)) hour += 12;
      else if (hour >= 1 && hour <= 6 && !tm.padded && !L.am.test(low)) hour += 12;
    }
    time = pad(hour) + ":" + pad(tm.m);
  }
  // Tageszeiten, die sonst wie ein Datum aussehen ("por la mañana" ist nicht "mañana" = morgen)
  (L.preCut || []).forEach(function (w) {
    var re = new RegExp(" " + escRe(w) + "(?= )"), mm;
    while ((mm = low.match(re))) cut(mm[0]);
  });
  // Wiederholung vor dem Datum, damit "alle 2 Wochen" nicht als "in 2 Wochen" gelesen wird
  var repeat = null, repWd = "";
  if (L.rep) {
    var RP = L.rep, lw = function (a) { return alt(a.map(function (w) { return lowerOf(w, L); })); };
    var unitOf = {}, rc = L.counts || L.nums;
    Object.keys(RP.units).forEach(function (u) { RP.units[u].forEach(function (w) { unitOf[lowerOf(w, L)] = u; }); });
    var RNUM = "(\\d{1,3}|" + altKeys(rc) + ")", RUNIT = "(" + altKeys(unitOf) + ")";
    // alle 3 Monate · every two weeks · co 2 tygodnie · 3 ayda bir
    m = low.match(new RegExp(RP.numAfter ? " (?:" + lw(RP.wd) + " )?" + RNUM + " " + RUNIT + " bir(?= )"
      : " (?:" + lw(RP.num) + ") " + RNUM + " " + RUNIT + "(?= )"));
    if (m) {
      var n = /\d/.test(m[1]) ? +m[1] : rc[m[1]], u = unitOf[m[2]];
      if (u === "d" && n === 15 && RP.fortnight) n = 14;
      if (n >= 1) {
        repeat = u === "d" || u === "w" ? { every: 0, everyDays: Math.min(u === "w" ? 7 * n : n, 3650) }
          : { every: Math.min(u === "y" ? 12 * n : n, 240), everyDays: 0 };
        cut(m[0]);
      }
    }
    // jede Woche · täglich · every other week (längste Wendung zuerst)
    var fx = RP.fixed.map(function (f) { return [lowerOf(f[0], L), f[1]]; }).sort(function (a, b) { return b[0].length - a[0].length; });
    for (var k = 0; k < fx.length && !repeat; k++) {
      if (low.indexOf(" " + fx[k][0] + " ") >= 0) { repeat = parseRepeatValue(fx[k][1]); cut(" " + fx[k][0]); }
    }
    // jeden Montag · montags · w każdy wtorek: jede Woche - der Wochentag bleibt (ohne Mehrzahl) fürs Datum stehen
    var PLS = RP.wdPl ? (L.fold ? foldSrc(RP.wdPl) : RP.wdPl) : "";
    m = repeat ? null : low.match(new RegExp(" (?:" + lw(RP.wd) + ") (" + WD + ")" + (PLS ? "(?:" + PLS + ")?" : "") + "(?= )"));
    if (!repeat && !m && RP.wdAlone && PLS) m = low.match(new RegExp(" (" + WD + ")" + PLS + "(?= )"));
    if (m) { repeat = { every: 0, everyDays: 7 }; repWd = m[1]; cut(m[0], " " + m[1]); }
  }

  function first(re, fn) {
    if (date) return;
    var mm = low.match(re);
    if (!mm) return;
    var d = fn(mm);
    if (d && isDate(d)) { date = d; cut(mm[0]); }
  }
  var PRE = L.pre || "", Y = "(?: " + (L.yJoin || "") + "(\\d{4}))?(?= )";

  // 15.03.2027 · 15.3. · 15/3 (in den USA Monat/Tag)
  first(new RegExp(" " + PRE + "(\\d{1,2})(\\. ?|/)(\\d{1,2})(?:[./](\\d{2,4})?)?(?= )"), function (x) {
    var dm = dayMonth(+x[1], +x[3], x[4]), md = dayMonth(+x[3], +x[1], x[4]), slash = x[2] === "/";
    // Nur bei "/" kann die Reihenfolge je nach Land wechseln (15/08 auch auf einem US-Handy);
    // "10.30" mit Punkt ist dagegen eher eine Uhrzeit als ein Datum.
    if (slash && L.mdy && L.mdy()) return md || dm;
    return dm || (slash ? md : null);
  });
  // 15-08-2029 (Niederlande) - nur mit Jahr, "10-12 Uhr" bleibt eine Zeitspanne
  first(new RegExp(" " + PRE + "(\\d{1,2})-(\\d{1,2})-(\\d{4})(?= )"), function (x) { return dayMonth(+x[1], +x[2], x[3]); });
  // 15. März 2027 · 15 March · 15 of March · 3 de noviembre de 2027
  first(new RegExp(" " + PRE + "(\\d{1,2})\\.? " + JOIN + "(" + MONTH + ")" + SFX + "\\.?" + Y), function (x) { return dayMonth(+x[1], L.months[x[2]], x[3]); });
  // ersten April · third of March · trzeciego listopada
  if (ORD) first(new RegExp(" " + PRE + "(" + ORD + ") " + JOIN + "(" + MONTH + ")" + SFX + "\\.?" + Y), function (x) { return dayMonth(L.ordinals[x[1]], L.months[x[2]], x[3]); });
  // March 15 · March fifteenth
  if (L.monthDay) {
    first(new RegExp(" " + PRE + "(" + MONTH + ") (\\d{1,2})" + Y), function (x) { return dayMonth(+x[2], L.months[x[1]], x[3]); });
    if (ORD) first(new RegExp(" " + PRE + "(" + MONTH + ") (?:the )?(" + ORD + ")" + Y), function (x) { return dayMonth(L.ordinals[x[2]], L.months[x[1]], x[3]); });
  }
  // Ende März · end of March · finales de noviembre
  if (L.parts) first(new RegExp(" " + (L.partPre || "") + "(" + altKeys(L.parts) + ") (" + MONTH + ")" + SFX + "\\.?" + Y), function (x) { return monthPart(L.months[x[2]], x[3], L.parts[x[1]]); });
  // Kasım sonunda (der Teil steht hinter dem Monat)
  if (L.partsAfter) first(new RegExp(" (" + MONTH + ")" + SFX + "(?: (\\d{4}))?(?: ay[a-z]*)? (" + altKeys(L.partsAfter) + ")(?= )"), function (x) { return monthPart(L.months[x[1]], x[2], L.partsAfter[x[3]]); });
  // im März 2027 · in March → letzter Tag des Monats
  first(new RegExp(" " + (L.monthPre || "") + "(" + MONTH + ")" + SFX + "\\.?" + Y), function (x) { return monthPart(L.months[x[1]], x[2], "end"); });
  // 04/2027 · 4.2027 → letzter Tag des Monats
  first(new RegExp(" " + (L.numMonthPre || "") + "(\\d{1,2})[\\/.](\\d{4})(?= )"), function (x) { return monthPart(+x[1], x[2], "end"); });
  // übermorgen · morgen · heute (Spanisch: "esta mañana" = heute vor "mañana" = morgen)
  var dayWords = L.todayFirst ? [[L.dayAfter, 2], [L.today, 0], [L.tomorrow, 1]] : [[L.dayAfter, 2], [L.tomorrow, 1], [L.today, 0]];
  dayWords.forEach(function (w) {
    if (w[0] && w[0].length) first(new RegExp(" (?:" + alt(w[0]) + ")" + SFX + "(?= )"), function () { return addDays(t0, w[1]); });
  });
  // in 2 Wochen · in drei Monaten · in a week · za tydzień · 3 gün sonra
  var counts = L.counts || L.nums, U = L.units;
  var NUM = "(\\d{1,3}|" + altKeys(counts) + ")", UNIT = "(" + alt([].concat(U.day, U.week, U.month, U.year)) + ")";
  var inRe = L.inAfter ? " " + NUM + " " + UNIT + SFX + " (?:" + L.inAfter + ")(?= )"
    : " " + L.inWord + " " + (L.inNoNum ? "(?:" + NUM + " )?" : NUM + " ") + UNIT + "(?= )";
  first(new RegExp(inRe), function (x) {
    var n = x[1] == null ? 1 : /\d/.test(x[1]) ? +x[1] : counts[x[1]], u = x[2];
    if (U.day.indexOf(u) >= 0) return addDays(t0, n);
    if (U.week.indexOf(u) >= 0) return addDays(t0, 7 * n);
    if (U.month.indexOf(u) >= 0) return addMonths(t0, n);
    return addMonths(t0, 12 * n);
  });
  // nächste Woche · nächsten Monat · next year
  function relative() {
    L.rel.forEach(function (rel) {
      first(new RegExp(" (?:" + alt(rel[0]) + ")(?= )"), function () { return rel[1].days ? addDays(t0, rel[1].days) : addMonths(t0, rel[1].months); });
    });
  }
  // (am / bis / nächsten) Dienstag
  function weekday() {
    first(new RegExp(" (" + (L.wdPre || "") + ")(" + WD + ")" + SFX + "(?= )"), function (x) {
      var wd = L.weekdays[x[2]], diff = (wd - t0.getDay() + 7) % 7 || 7;
      var iso = function (d) { return d === 0 ? 7 : d; };
      // "nächsten Dienstag" am Montag = Dienstag der nächsten Woche
      if (L.wdNext && L.wdNext.test(x[1]) && iso(wd) > iso(t0.getDay())) diff += 7;
      return addDays(t0, diff);
    });
  }
  // "haftaya salı" ist der Dienstag der nächsten Woche, nicht "in einer Woche"
  if (L.wdBeforeRel) { weekday(); relative(); } else { relative(); weekday(); }
  // "jeden Montag ab 3. November": das Datum kam woanders her - auf den ersten Montag ab dann schieben,
  // der Wochentag gehört nicht in den Titel
  if (repWd && (m = low.match(new RegExp(" " + escRe(repWd) + "(?= )")))) {
    cut(m[0]);
    while (date && date.getDay() !== L.weekdays[repWd]) date = addDays(date, 1);
  }

  return { date: date, time: time, rest: cleanTitle(orig, L), repeat: repeat };
}

function cleanTitle(s, L) {
  // Lücken vom herausgeschnittenen Datum schließen, damit "remind me … about" wieder zusammenpasst
  s = " " + s.replace(/\s+/g, " ").trim() + " ";
  // Feste Wendungen (L.keep) vor den Füllwörtern schützen: türkisch "doğum günü", "günü" allein ist ein Füllwort
  var kept = [], mark = String.fromCharCode(1);
  (L.keep || []).forEach(function (k) {
    s = s.replace(new RegExp(" " + escRe(k) + "(?= )", "gi"), function (m) { kept.push(m.slice(1)); return " " + mark + (kept.length - 1) + mark; });
  });
  L.fillers.forEach(function (f) {
    s = s.replace(new RegExp(" " + escRe(f) + "(?= )", "gi"), " ");
  });
  kept.forEach(function (k, i) { s = s.split(mark + i + mark).join(k); });
  s = s.replace(/\s+/g, " ").replace(/^[\s.:-]+|[\s.:-]+$/g, "");
  if (L.elide) s = s.replace(/' /g, "'");
  return capitalize(s);
}

function detectTemplate(text, L) {
  L = L || lexFor();
  var low = " " + lowerOf(prepare(text, L), L) + " ";
  for (var i = 0; i < L.keywords.length; i++) {
    for (var j = 0; j < L.keywords[i][1].length; j++) {
      if (low.indexOf(L.keywords[i][1][j]) >= 0) return L.keywords[i][0];
    }
  }
  return "eigene";
}

// Aus einem Satz wird ein Entwurf, den der Nutzer vor dem Speichern bestätigt
function draftFrom(text) {
  var L = lexFor(), tid = detectTemplate(text, L), x = extract(text, L);
  // Hier wird der gesprochene Rest zum Titel ("Geburtstag von Anna", "Elternabend Grundschule")
  var FREE = ["rechnung", "arzttermin", "eigene", "geburtstag", "hochzeitstag", "kinderarzt", "schule", "kinderpass", "reise", "checkin", "storno"];
  // Ausweis, Abo, TÜV … wiederholen sich nie täglich oder wöchentlich: "jeden Montag Fitnessstudio" ist eine eigene Frist
  if (x.repeat && x.repeat.everyDays && FREE.indexOf(tid) < 0) tid = "eigene";
  var tp = find(TEMPLATES, tid), free = FREE.indexOf(tid) >= 0;
  var title = free && x.rest.length >= 3 ? x.rest.slice(0, 60) : tplName(tp, {});
  var whatWord = L.whatWord && L.whatWord[tid];
  if (whatWord) {
    var mw = x.rest.match(whatWord), w = mw ? (mw[1] || mw[0]) : "";
    title = tplName(tp, { what: w && L.whatSkip.indexOf(w.toLowerCase()) < 0 ? capitalize(w) : "" });
  }
  var d = { tpl: tid, title: title, due: "", time: x.time || "", every: 0, from: tp.from || "due", lead: tp.lead, renew: !!tp.renew };

  // "jeden Tag …" ohne Datum: ab heute - oder ab morgen, wenn die Uhrzeit heute schon vorbei ist
  if (!x.date && x.repeat && x.repeat.everyDays === 1) {
    var now = new Date();
    x.date = addDays(today(), x.time && x.time <= pad(now.getHours()) + ":" + pad(now.getMinutes()) ? 1 : 0);
  }
  // Werte für die Vorlage: das gesprochene Datum (oder heute) in jedes Datumsfeld
  var iso = toISO(x.date || today()), v = {};
  tp.fields.forEach(function (f) {
    v[f.key] = f.type === "date" ? iso : f.type === "month" ? iso.slice(0, 7) : f.value != null ? String(f.value) : "";
  });
  var r = tp.compute(v);
  d.every = r.every || 0;
  d.everyDays = r.everyDays || 0;
  // Gesagte Wiederholung ("alle 3 Monate", "jeden Montag") geht vor die der Vorlage
  if (x.repeat) { d.every = x.repeat.every; d.everyDays = x.repeat.everyDays; d.lead = Math.min(d.lead, leadCap(x.repeat)); }
  var needsDate = tp.fields.some(function (f) { return f.type === "date" || f.type === "month"; });
  if (!needsDate) d.due = toISO(x.date || r.due);              // Kfz, Reifen, Steuer: Datum optional
  else if (!x.date) d.due = "";                                  // Datum fehlt → Nutzer trägt es ein
  // Zukunft oder "auffrischen / fällig / nächste" = der Termin selbst, sonst "letztes Mal" bzw. Vertragsbeginn
  else if (tp.dateMeans && (x.date >= today() || L.dueWords.test(lowerOf(text, L)))) d.due = toISO(x.date);
  else d.due = toISO(r.due);
  return d;
}
