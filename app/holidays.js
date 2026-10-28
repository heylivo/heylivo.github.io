// Gesetzliche Feiertage für "Jahr im Blick": landesweit, für das Land der App-Sprache (de = Deutschland,
// el = Griechenland …, en = USA: die US-Bundesfeiertage, an ihrem eigentlichen Datum).
// fixed: "MM-TT" -> Name (oder [Name, ab Jahr]); easter: Tage nach Ostersonntag -> Name.
// Griechenland rechnet mit dem orthodoxen Ostern. Türkei: Ramazan- und Kurban-Bayramı richten sich nach dem
// Mondkalender und stehen fest in dates (Diyanet, 2026–2028) - für spätere Jahre fehlen sie, bis sie eingetragen sind.
var HOLIDAYS = {
  en: {
    fixed: { "01-01": "New Year's Day", "06-19": "Juneteenth", "07-04": "Independence Day", "11-11": "Veterans Day", "12-25": "Christmas Day" },
    // n-ter Wochentag im Monat (n = -1: der letzte); Wochentag 1 = Montag, 4 = Donnerstag
    extra: function (y) {
      return [[0, 3, 1, "Martin Luther King Jr. Day"], [1, 3, 1, "Presidents' Day"], [4, -1, 1, "Memorial Day"], [8, 1, 1, "Labor Day"],
        [9, 2, 1, "Columbus Day"], [10, 4, 4, "Thanksgiving"]].map(function (h) { return [nthWeekday(y, h[0], h[1], h[2]), h[3]]; });
    }
  },
  de: {
    fixed: { "01-01": "Neujahr", "05-01": "Tag der Arbeit", "10-03": "Tag der Deutschen Einheit", "12-25": "1. Weihnachtstag", "12-26": "2. Weihnachtstag" },
    easter: { "-2": "Karfreitag", "0": "Ostersonntag", "1": "Ostermontag", "39": "Christi Himmelfahrt", "49": "Pfingstsonntag", "50": "Pfingstmontag" }
  },
  el: {
    orthodox: true,
    fixed: { "01-01": "Πρωτοχρονιά", "01-06": "Θεοφάνεια", "03-25": "Εθνική Εορτή 25ης Μαρτίου", "05-01": "Πρωτομαγιά", "08-15": "Κοίμηση της Θεοτόκου", "10-28": "Επέτειος του «Όχι»", "12-25": "Χριστούγεννα", "12-26": "Σύναξη της Θεοτόκου" },
    easter: { "-48": "Καθαρά Δευτέρα", "-2": "Μεγάλη Παρασκευή", "0": "Πάσχα", "1": "Δευτέρα του Πάσχα", "50": "Αγίου Πνεύματος" }
  },
  es: {
    fixed: { "01-01": "Año Nuevo", "01-06": "Epifanía del Señor", "05-01": "Fiesta del Trabajo", "08-15": "Asunción de la Virgen", "10-12": "Fiesta Nacional de España", "11-01": "Todos los Santos", "12-06": "Día de la Constitución", "12-08": "Inmaculada Concepción", "12-25": "Navidad" },
    easter: { "-2": "Viernes Santo" }
  },
  fr: {
    fixed: { "01-01": "Jour de l'An", "05-01": "Fête du Travail", "05-08": "Victoire 1945", "07-14": "Fête nationale", "08-15": "Assomption", "11-01": "Toussaint", "11-11": "Armistice 1918", "12-25": "Noël" },
    easter: { "1": "Lundi de Pâques", "39": "Ascension", "50": "Lundi de Pentecôte" }
  },
  it: {
    fixed: { "01-01": "Capodanno", "01-06": "Epifania", "04-25": "Festa della Liberazione", "05-01": "Festa del Lavoro", "06-02": "Festa della Repubblica", "08-15": "Ferragosto", "10-04": ["San Francesco d'Assisi", 2026], "11-01": "Ognissanti", "12-08": "Immacolata Concezione", "12-25": "Natale", "12-26": "Santo Stefano" },
    easter: { "0": "Pasqua", "1": "Lunedì dell'Angelo" }
  },
  nl: {
    fixed: { "01-01": "Nieuwjaarsdag", "05-05": "Bevrijdingsdag", "12-25": "Eerste Kerstdag", "12-26": "Tweede Kerstdag" },
    easter: { "-2": "Goede Vrijdag", "0": "Eerste Paasdag", "1": "Tweede Paasdag", "39": "Hemelvaartsdag", "49": "Eerste Pinksterdag", "50": "Tweede Pinksterdag" },
    // Koningsdag 27. April, fällt er auf einen Sonntag, ist er am Samstag davor
    extra: function (y) { var d = new Date(y, 3, 27); return [[d.getDay() === 0 ? new Date(y, 3, 26) : d, "Koningsdag"]]; }
  },
  pl: {
    fixed: { "01-01": "Nowy Rok", "01-06": "Święto Trzech Króli", "05-01": "Święto Pracy", "05-03": "Święto Konstytucji 3 Maja", "08-15": "Wniebowzięcie NMP", "11-01": "Wszystkich Świętych", "11-11": "Narodowe Święto Niepodległości", "12-24": ["Wigilia", 2025], "12-25": "Boże Narodzenie", "12-26": "Drugi dzień Bożego Narodzenia" },
    easter: { "0": "Wielkanoc", "1": "Poniedziałek Wielkanocny", "49": "Zielone Świątki", "60": "Boże Ciało" }
  },
  pt: {
    fixed: { "01-01": "Ano Novo", "04-25": "Dia da Liberdade", "05-01": "Dia do Trabalhador", "06-10": "Dia de Portugal", "08-15": "Assunção de Nossa Senhora", "10-05": "Implantação da República", "11-01": "Dia de Todos os Santos", "12-01": "Restauração da Independência", "12-08": "Imaculada Conceição", "12-25": "Natal" },
    easter: { "-2": "Sexta-feira Santa", "0": "Páscoa", "60": "Corpo de Deus" }
  },
  tr: {
    fixed: { "01-01": "Yılbaşı", "04-23": "Ulusal Egemenlik ve Çocuk Bayramı", "05-01": "Emek ve Dayanışma Günü", "05-19": "Atatürk'ü Anma, Gençlik ve Spor Bayramı", "07-15": "Demokrasi ve Millî Birlik Günü", "08-30": "Zafer Bayramı", "10-29": "Cumhuriyet Bayramı" },
    dates: {
      "Ramazan Bayramı": ["2026-03-20", "2026-03-21", "2026-03-22", "2027-03-09", "2027-03-10", "2027-03-11", "2028-02-26", "2028-02-27", "2028-02-28"],
      "Kurban Bayramı": ["2026-05-27", "2026-05-28", "2026-05-29", "2026-05-30", "2027-05-16", "2027-05-17", "2027-05-18", "2027-05-19", "2028-05-05", "2028-05-06", "2028-05-07", "2028-05-08"]
    }
  }
};

function nthWeekday(y, month, n, wd) {
  if (n < 0) { var last = new Date(y, month + 1, 0); return new Date(y, month, last.getDate() - (last.getDay() - wd + 7) % 7); }
  var first = new Date(y, month, 1);
  return new Date(y, month, 1 + (wd - first.getDay() + 7) % 7 + 7 * (n - 1));
}

// Ostersonntag (gregorianisch, Gauß/Meeus) bzw. orthodox (julianisch + 13 Tage, gilt 1900–2099)
function easterSunday(y, orthodox) {
  if (orthodox) {
    var d = (19 * (y % 19) + 15) % 30, e = (2 * (y % 4) + 4 * (y % 7) - d + 34) % 7;
    return new Date(y, Math.floor((d + e + 114) / 31) - 1, (d + e + 114) % 31 + 1 + 13);
  }
  var a = y % 19, b = Math.floor(y / 100), c = y % 100, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  var h = (19 * a + b - Math.floor(b / 4) - g + 15) % 30, l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - c % 4) % 7;
  var n = h + l - 7 * Math.floor((a + 11 * h + 22 * l) / 451) + 114;
  return new Date(y, Math.floor(n / 31) - 1, n % 31 + 1);
}

// Alle Feiertage der Jahre from..to als { "JJJJ-MM-TT": "Name" }; zwei am selben Tag werden zusammengefasst
function holidayMap(fromYear, toYear) {
  var def = HOLIDAYS[LANG], map = {};
  if (!def) return map;
  function iso(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function put(key, name) { map[key] = map[key] ? map[key] + " · " + name : name; }
  for (var y = fromYear; y <= toYear; y++) {
    Object.keys(def.fixed || {}).forEach(function (md) {
      var v = def.fixed[md], name = typeof v === "string" ? v : v[0];
      if (typeof v === "string" || y >= v[1]) put(y + "-" + md, name);
    });
    var easter = easterSunday(y, def.orthodox);
    Object.keys(def.easter || {}).forEach(function (off) {
      put(iso(new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + +off)), def.easter[off]);
    });
    if (def.extra) def.extra(y).forEach(function (h) { put(iso(h[0]), h[1]); });
  }
  Object.keys(def.dates || {}).forEach(function (name) {
    def.dates[name].forEach(function (d) { if (+d.slice(0, 4) >= fromYear && +d.slice(0, 4) <= toYear) put(d, name); });
  });
  return map;
}
