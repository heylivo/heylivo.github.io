// heylivo – Fristen in Supabase. Ohne Anmeldung bekommt jeder Browser ein
// anonymes Konto; die Datenbank (RLS) zeigt jedem nur seine eigenen Fristen.
// "Konto sichern" und "Anmelden" (E-Mail-Adresse + Code) stehen in account.js.
// Alle Texte kommen aus i18n.js (t()), die Vorlagen-Texte aus templates.js.
// URL-Parameter zum Testen: ?demo=1 zeigt Beispiel-Fristen (wird nicht gespeichert),
// &show=add | voice | form:<vorlage> | item | account | signin | howto öffnet direkt das passende Blatt,
// &say=<Satz> verarbeitet einen Satz so, als wäre er gesprochen worden, &lang=en usw.

var SUPABASE_URL = "https://fkhngrvqxlpqxpllrnoj.supabase.co";
var SUPABASE_KEY = "sb_publishable_Ya83flK2efxCxi1WecSCwA_wbC_njXD"; // öffentlicher Schlüssel, darf im Code stehen
var TRIAL_DAYS = 30; // Testphase ab der ersten Frist, danach nur mit Livo Plus (prüft auch die Datenbank)

var params = new URLSearchParams(location.search);
var DEMO = params.get("demo") === "1";
var sb = DEMO ? null : window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
var items = [];
var plusUntil = null;
var trialStarted = null; // "JJJJ-MM-TT" oder null = Testphase noch nicht begonnen
var userId = "";         // Konto dieses Browsers - geht beim Kauf als client_reference_id an Stripe (userEmail: account.js)
// Stripe-Zahlungslink für Livo Plus (11,99 € inkl. MwSt., 1 Jahr, ohne Verlängerung).
// Leer = Kauf noch nicht freigeschaltet ("kommt bald"). Der Webhook stripe-webhook schaltet frei.
var PLUS_LINK = "https://buy.stripe.com/aFaaEY2IJfXO6Vv3Fz7g400";

/* ---------- Speicher ---------- */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

var TIME_ZONE = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin"; } catch (e) { return "Europe/Berlin"; } })();

function toRow(it) {
  return {
    tpl: it.tpl || "eigene", title: it.title, due: it.due, due_time: it.time || null,
    every_months: it.every || 0, every_days: it.everyDays || 0, from_done: it.from === "done", lead_days: it.lead, renew: !!it.renew,
    remind_min: it.time && it.remindMin ? it.remindMin : null, tz: TIME_ZONE
  };
}
function fromRow(r) {
  return {
    id: r.id, tpl: r.tpl, title: r.title, due: r.due, time: r.due_time ? r.due_time.slice(0, 5) : "",
    every: r.every_months, everyDays: r.every_days || 0, from: r.from_done ? "done" : "due", lead: r.lead_days, renew: r.renew,
    remindMin: r.remind_min || 0
  };
}
async function signIn() {
  var s = await sb.auth.getSession();
  if (s.data.session) { setUser(s.data.session.user); return; }
  var r = await sb.auth.signInAnonymously();
  if (r.error) throw r.error;
  setUser(r.data.user);
}
async function loadAll() {
  var r = await sb.from("deadlines").select("*").order("due");
  if (r.error) throw r.error;
  items = r.data.map(fromRow);
  var p = await sb.from("plans").select("plus_until").maybeSingle();
  plusUntil = p.data ? p.data.plus_until : null;
  var u = await sb.from("usage").select("trial_started").maybeSingle();
  trialStarted = u.data ? u.data.trial_started : null;
}
async function addItem(it) {
  if (DEMO) { it.id = uid(); items.push(it); return; }
  var r = await sb.from("deadlines").insert(toRow(it)).select().single();
  if (r.error) throw r.error;
  items.push(fromRow(r.data));
  if (!trialStarted) trialStarted = toISO(today()); // die erste Frist startet die Testphase
}
async function updateItem(it) {
  if (DEMO) return;
  var r = await sb.from("deadlines").update(toRow(it)).eq("id", it.id);
  if (r.error) throw r.error;
}
async function deleteItem(id) {
  if (!DEMO) {
    var r = await sb.from("deadlines").delete().eq("id", id);
    if (r.error) throw r.error;
  }
  items = items.filter(function (x) { return x.id !== id; });
}
function isPlus() { return !!plusUntil && plusUntil >= toISO(today()); }
// Tage bis zum Ende der Testphase (0 = endet heute, negativ = vorbei, null = noch nicht begonnen)
function trialDaysLeft() {
  return trialStarted ? diffDays(today(), addDays(fromISO(trialStarted), TRIAL_DAYS)) : null;
}
function canEdit() {
  if (DEMO || isPlus()) return true;
  var left = trialDaysLeft();
  return left === null || left >= 0;
}
function errText(e) {
  return e && e.message === "trial_over" ? t("err.trial", { n: TRIAL_DAYS }) : t("err.save");
}

/* ---------- Datum: immer lokale Mitternacht, gespeichert als JJJJ-MM-TT ---------- */
function pad(n) { return (n < 10 ? "0" : "") + n; }
function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function toISO(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function fromISO(s) { var p = String(s).split("-"); return new Date(+p[0], +p[1] - 1, +(p[2] || 1)); }
var DATE_FMT = new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "2-digit", year: "numeric" });
function fmt(d) { return DATE_FMT.format(d); }
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function addMonths(d, n) {
  // 31.01. + 1 Monat = 28./29.02., nicht 03.03.
  var first = new Date(d.getFullYear(), d.getMonth() + n, 1);
  var last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), last));
}
function endOfMonth(ym) { var p = String(ym).split("-"); return new Date(+p[0], +p[1], 0); }
function nextYearly(month, day) {
  var t0 = today(), d = new Date(t0.getFullYear(), month - 1, day);
  return d < t0 ? new Date(t0.getFullYear() + 1, month - 1, day) : d;
}
function diffDays(a, b) { return Math.round((b - a) / 86400000); }
function isDate(d) { return d instanceof Date && !isNaN(d.getTime()); }

/* ---------- Status und Texte ---------- */
function status(it) {
  var days = diffDays(today(), fromISO(it.due));
  if (days < 0) return { key: "late", days: days };
  if (days <= it.lead) return { key: "now", days: days };
  return { key: "later", days: days };
}
function whenText(days) {
  if (days === 0) return t("when.today");
  if (days === 1) return t("when.tomorrow");
  if (days === -1) return t("when.yesterday");
  if (days < 0) return t("when.overdue", { n: -days });
  if (days <= 60) return t("when.days", { n: days });
  var m = Math.round(days / 30.44);
  if (m < 24) return t("when.months", { n: m });
  return t("when.years", { n: Math.round(days / 365.25) });
}
// Wiederholung als Text; it hat every (Monate) oder everyDays (Tage)
function everyText(it) {
  var d = it.everyDays || 0, m = it.every || 0;
  if (d) {
    if (d === 1 || d === 7) return t("every.d" + d);
    return d % 7 === 0 ? t("every.weeks", { n: d / 7 }) : t("every.days", { n: d });
  }
  if (!m || m === 1 || m === 12) return t("every." + (m || 0));
  if (m % 12 === 0) return t("every.years", { n: m / 12 });
  return t("every.months", { n: m });
}
function repeats(it) { return (it.every || 0) > 0 || (it.everyDays || 0) > 0; }
function nextRepeat(d, it) { return it.everyDays > 0 ? addDays(d, it.everyDays) : addMonths(d, it.every); }
function dueText(it) { return fmt(fromISO(it.due)) + (it.time ? ", " + it.time + t("time.suffix") : ""); }
function remindText(it) {
  var r = addDays(fromISO(it.due), -it.lead);
  return r <= today() ? t("remind.now") : t("remind.from", { date: fmt(r) });
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
  });
}

/* ---------- Nachschlagen ---------- */
function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
function iconOf(it) { var tp = find(TEMPLATES, it.tpl); return find(CATEGORIES, tp ? tp.cat : "own").icon; }
function sortedItems() {
  return items.slice().sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; });
}

/* ---------- Liste ---------- */
// "Hey Livo": Feld mit Text, rechts daneben ein runder Mikrofon-Knopf (beide starten die Spracheingabe)
function voicebarHTML() {
  return '<div class="vbrow"><button type="button" class="voicebar" data-act="voice">' +
    '<span class="vb-txt"><b>Hey Livo …</b><small>' + esc(t("voicebar.sub")) + '</small></span></button>' +
    '<button type="button" class="vb-mic" data-act="voice" aria-label="Hey Livo"><svg viewBox="0 0 24 24">' +
    '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/></svg></button></div>';
}

// Symbole unter "Hey Livo" (scrollen mit): Konto, Kalender, Erinnerungen, Livo Plus - Linien-Symbole wie das Mikrofon,
// damit sie auf jedem Gerät gleich aussehen, mit kleiner Beschriftung darunter.
// Ein Tipp auf ein Symbol zeigt darunter seinen Text; ein zweiter Tipp blendet ihn aus.
// Offen ist zuerst, was Aufmerksamkeit braucht (Testphase vorbei, Konto nicht gesichert, Erinnerungen aus),
// sonst die Zeile zu Livo Plus bzw. zur Testphase.
var INFO_SVG = {
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.6-1.8"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  belloff: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0M3 3l18 18"/>'
};
var infoTab = "";
function infoParts() {
  var left = trialDaysLeft(), plusOn = isPlus(), push = pushHTML(), parts = [];
  parts.push({ id: "acc", svg: userEmail ? "lock" : "unlock", warn: !userEmail, html: accountLineHTML() });
  parts.push({ id: "cal", svg: "cal", html: '<button type="button" class="linkbtn" data-act="calendar">' + esc(t("plus.cal")) + '</button>' });
  if (push) parts.push({ id: "push", svg: pushState === "on" ? "bell" : "belloff", warn: pushState !== "on", html: push });
  // Plus: Schild "PLUS" - grün mit Haken (aktiv), blau (Testphase), rot (Testphase vorbei)
  parts.push({ id: "plus", plus: plusOn ? "on" : left !== null && left < 0 ? "over" : "trial",
    warn: !plusOn && left !== null && left < 0, html: statusHTML() });
  return parts;
}
function infoHTML() {
  var parts = infoParts(), tab = infoTab;
  // Solange niemand getippt hat, wird die Auswahl jedes Mal neu bestimmt (Konto und Plus laden erst nach dem ersten Anzeigen)
  if (!tab) {
    var first = find(parts, "plus").warn ? find(parts, "plus") : parts.filter(function (p) { return p.warn; })[0];
    tab = (first || find(parts, "plus")).id;
  }
  var open = tab === "none" ? null : find(parts, tab);
  return '<div class="infobar" role="tablist">' + parts.map(function (p) {
    var ico = p.plus ? '<span class="plus-pill ' + p.plus + '">PLUS' + (p.plus === "on" ? " ✓" : "") + '</span>'
      : '<svg viewBox="0 0 24 24">' + INFO_SVG[p.svg] + '</svg>';
    return '<button type="button" class="info-item" role="tab" data-act="info" data-id="' + p.id + '" aria-selected="' + (open === p) + '">' +
      '<span class="info-ico' + (p.warn ? " warn" : "") + '">' + ico + '</span><span class="info-lbl">' + esc(t("info." + p.id)) + '</span></button>';
  }).join("") + '</div>' + (open ? '<div class="infotext">' + open.html + '</div>' : "");
}
function setInfoTab(id) {
  var shown = document.querySelector('.info-item[aria-selected="true"]');
  infoTab = shown && shown.getAttribute("data-id") === id ? "none" : id;
  document.getElementById("status").innerHTML = infoHTML();
}

// Zeile unter "Hey Livo": Stand der Testphase oder von Livo Plus
function statusHTML() {
  if (DEMO) return "";
  // Mit Plus: Verlängern (im Plus-Fenster; ein neuer Kauf zählt ab dem alten Ende). Das Kalender-Abo hat ein eigenes Symbol.
  if (isPlus()) return '<p class="quota">' + t("status.plus", { date: fmt(fromISO(plusUntil)) }) +
    ' · <button type="button" class="linkbtn" data-act="plus">' + t("plus.extendShort") + '</button></p>';
  // Kaufen geht jederzeit - auch schon, bevor die erste Frist die Testphase startet
  var buy = ' · <button type="button" class="linkbtn" data-act="plus">Livo Plus</button>';
  var left = trialDaysLeft();
  if (left === null) return '<p class="quota">' + t("status.trialStart", { n: TRIAL_DAYS }) + buy + '</p>';
  if (left >= 0) {
    return '<p class="quota">' + t("status.trial") + " " + (left === 0 ? t("status.today") : left === 1 ? t("status.left1") : t("status.left", { n: left })) +
      buy + '</p>';
  }
  return '<button type="button" class="expired" data-act="plus">' + t("status.expired") + '</button>';
}

function render() {
  var list = document.getElementById("list"), controls = document.getElementById("controls"), stat = document.getElementById("status");
  renderNote();
  if (!items.length) { controls.innerHTML = stat.innerHTML = ""; list.innerHTML = emptyHTML(); return; }
  var all = sortedItems();
  var now = all.filter(function (it) { return status(it).key !== "later"; });
  var later = all.filter(function (it) { return status(it).key === "later"; });
  // Oben fest (wandert beim Scrollen nicht mit) ist nur "Hey Livo". Konto, Kalender, Erinnerungen und Plus/Testphase
  // stehen darunter als Symbole mit ausklappbarem Text und scrollen mit: fest oben belegten sie am Handy
  // mit großer Schrift mehr als den halben Bildschirm.
  controls.innerHTML = canEdit() ? voicebarHTML() : "";
  stat.innerHTML = infoHTML();
  var html = (now.length
    ? '<h2 class="sec sec-now">' + t("sec.now") + ' <span>' + now.length + '</span></h2>' + now.map(card).join("")
    : '<div class="allgood">' + t("allgood") + '</div>');
  // Ohne "Alles im Blick" trotzdem der Knopf "Jahr im Blick"
  html += later.length ? laterHTML(later) : '<div class="sec-row"><div class="filterrow">' + yearBtnHTML() + '</div></div>';
  list.innerHTML = html;
}

// Filter für "Alles im Blick": alle / fällig in den nächsten 7 bzw. 30 Tagen (ab heute gezählt).
// "Jetzt kümmern" wird nie gefiltert - Überfälliges darf nicht verschwinden. Die Wahl merkt sich der Browser.
var FILTER_DAYS = { all: 0, week: 7, month: 30 };
var listFilter = "all";
try { listFilter = FILTER_DAYS[localStorage.getItem("livo.filter")] != null ? localStorage.getItem("livo.filter") : "all"; } catch (e) {}
function laterHTML(later) {
  // Erst ab 3 Fristen - bei weniger lohnt sich kein Filter
  var useFilter = later.length >= 3, days = useFilter ? FILTER_DAYS[listFilter] : 0;
  var shown = days ? later.filter(function (it) { return status(it).days <= days; }) : later;
  var filter = !useFilter ? "" : '<div class="filter" role="group" aria-label="' + esc(t("filter.label")) + '">' +
    Object.keys(FILTER_DAYS).map(function (f) {
      return '<button type="button" data-act="filter" data-id="' + f + '" aria-pressed="' + (f === listFilter) + '">' + t("filter." + f) + '</button>';
    }).join("") + '</div>';
  return '<div class="sec-row"><h2 class="sec">' + t("sec.later") + '</h2><div class="filterrow">' + filter + yearBtnHTML() + '</div></div>' +
    (shown.length ? shown.map(card).join("") : '<p class="filter-none">' + t("filter.none", { n: days }) + '</p>');
}
function yearBtnHTML() {
  // Nur das Kalender-Symbol, im selben Kasten wie die Symbole oben (Konto, Kalender …)
  return '<button type="button" class="yearbtn info-ico" data-act="year" aria-label="' + esc(t("year.title")) + '" title="' + esc(t("year.title")) + '">' +
    '<svg viewBox="0 0 24 24">' + INFO_SVG.cal + '</svg></button>';
}

/* ---------- Jahr im Blick ---------- */
// 12 Monate ab diesem Monat (mit ‹ › um je 12 Monate weiter). Tage mit Fristen sind farbig, freie Tage weiß;
// wiederkehrende Fristen erscheinen an jedem Termin. Ein Tipp auf einen Tag zeigt unten seine Fristen
// bzw. bei einem freien Tag "+ Frist an diesem Tag eintragen".
var yearShift = 0;
function occurrences(from, to) {
  var map = {};
  items.forEach(function (it) {
    for (var d = fromISO(it.due), n = 0; d <= to && n < 400; n++) {
      if (d >= from) (map[toISO(d)] = map[toISO(d)] || []).push(it);
      if (!repeats(it)) break;
      d = nextRepeat(d, it);
    }
  });
  return map;
}
function showYear() {
  var t0 = today(), todayIso = toISO(t0);
  var start = addMonths(new Date(t0.getFullYear(), t0.getMonth(), 1), yearShift), end = addDays(addMonths(start, 12), -1);
  var occ = occurrences(start, end);
  var monthFmt = new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric" });
  var shortFmt = new Intl.DateTimeFormat(LOCALE, { month: "short", year: "numeric" });
  var wdFmt = new Intl.DateTimeFormat(LOCALE, { weekday: "narrow" });
  // Wochentage ab Montag (5.1.2026 ist ein Montag)
  var wds = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return '<span>' + esc(wdFmt.format(new Date(2026, 0, 5 + i))) + '</span>'; }).join("");
  var months = "";
  for (var m = 0; m < 12; m++) {
    var first = addMonths(start, m), days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    var cells = "", count = 0, free = 0;
    for (var e = 0; e < (first.getDay() + 6) % 7; e++) cells += '<span></span>';
    for (var day = 1; day <= days; day++) {
      var iso = toISO(new Date(first.getFullYear(), first.getMonth(), day)), list = occ[iso] || [];
      count += list.length;
      if (!list.length && iso >= todayIso) free++;
      var cls = "yd" + (list.length ? (iso < todayIso ? " late" : " due") : "") + (iso === todayIso ? " today" : "") + (iso < todayIso && !list.length ? " past" : "");
      cells += '<button type="button" class="' + cls + '" data-act="yday" data-id="' + iso + '">' + day + '</button>';
    }
    months += '<div class="ymonth"><h4>' + esc(monthFmt.format(first)) + '</h4>' +
      '<p class="ysum">' + (count ? t("year.count", { n: count }) + " · " : "") + t("year.free", { n: free }) + '</p>' +
      '<div class="ygrid ywd">' + wds + '</div><div class="ygrid">' + cells + '</div></div>';
  }
  openSheet('<h3>' + esc(t("year.title")) + '</h3>' +
    '<div class="ynav"><button type="button" class="linkbtn plain" data-act="ynav" data-id="-12" aria-label="‹">‹</button>' +
    '<b>' + esc(shortFmt.format(start)) + ' – ' + esc(shortFmt.format(end)) + '</b>' +
    '<button type="button" class="linkbtn plain" data-act="ynav" data-id="12" aria-label="›">›</button></div>' +
    '<p class="ylegend"><span class="yd due"></span>' + esc(t("year.legendDue")) + '<span class="yd late"></span>' + esc(t("year.legendLate")) +
    '<span class="yd today"></span>' + esc(t("year.legendToday")) + '<span class="yd"></span>' + esc(t("year.legendFree")) + '</p>' +
    '<div class="ymonths">' + months + '</div>' +
    '<div class="ydetail" id="ydetail"><p class="muted">' + esc(t("year.hint")) + '</p>' +
    '<button type="button" class="btn light" data-act="close">OK</button></div>');
  showYear.occ = occ;
}
function showYearDay(iso) {
  var box = document.getElementById("ydetail"), list = (showYear.occ || {})[iso] || [];
  document.querySelectorAll(".yd.sel").forEach(function (b) { b.classList.remove("sel"); });
  var btn = document.querySelector('.yd[data-id="' + iso + '"]');
  if (btn) btn.classList.add("sel");
  var wd = new Intl.DateTimeFormat(LOCALE, { weekday: "long" }).format(fromISO(iso));
  box.innerHTML = '<p class="ydate"><b>' + esc(wd.charAt(0).toLocaleUpperCase(LOCALE) + wd.slice(1) + ", " + fmt(fromISO(iso))) + '</b></p>' +
    (list.length ? list.map(card).join("")
      : '<p class="muted">' + esc(t("year.dayFree")) + '</p>' +
        (canEdit() && iso >= toISO(today()) ? '<button type="button" class="btn" data-act="yadd" data-id="' + iso + '">' + esc(t("year.add")) + '</button>' : "")) +
    '<button type="button" class="btn light" data-act="close">OK</button>';
}
// Neue eigene Frist mit dem gewählten Tag als Datum
function addOnDay(iso) {
  showNew("eigene");
  var form = document.getElementById("frm");
  if (!form || !form.elements.date) return;
  form.elements.date.value = iso;
  ["input", "change"].forEach(function (ev) { form.elements.date.dispatchEvent(new Event(ev, { bubbles: true })); });
}

function setFilter(f) {
  listFilter = FILTER_DAYS[f] != null ? f : "all";
  try { localStorage.setItem("livo.filter", listFilter); } catch (e) {}
  render();
}
function card(it) {
  var s = status(it);
  var sub = s.key === "later" ? t("card.remind", { x: remindText(it) }) : t("card.due", { x: dueText(it) });
  return '<button type="button" class="card st-' + s.key + '" data-open="' + it.id + '">' +
    '<span class="ico">' + iconOf(it) + '</span>' +
    '<span class="txt"><b>' + esc(it.title) + '</b><small>' + esc(sub) + '</small></span>' +
    '<span class="pill">' + esc(whenText(s.days)) + '</span></button>';
}
function emptyHTML() {
  var quick = ["personalausweis", "tuev", "kfzversicherung", "zahnarzt", "rechnung", "versicherung", "arzttermin"];
  var shown = quick.map(function (id) { return find(TEMPLATES, id); }).filter(function (tp) { return !tp.only || tp.only === LANG; }).slice(0, 6);
  return '<div class="empty"><h1>' + t("empty.title") + '</h1>' +
    '<p>' + t("empty.sub") + '</p>' + voicebarHTML() + statusHTML() +
    '<div class="chips">' +
    shown.map(function (tp) { return '<button type="button" class="chip" data-tpl="' + tp.id + '">' + esc(tplTitle(tp)) + '</button>'; }).join("") +
    '</div><button type="button" class="btn light" data-act="add">' + t("empty.all") + '</button></div>';
}

/* ---------- Blatt von unten ---------- */
var sheet = document.getElementById("sheet");
var sheetBg = document.getElementById("sheetBg");
function openSheet(html) {
  stopListening();
  sheet.innerHTML = '<div class="grab"></div>' + html;
  sheet.hidden = false;
  sheetBg.hidden = false;
  document.body.classList.add("lock");
  sheet.scrollTop = 0;
}
function closeSheet() {
  stopListening();
  sheet.hidden = true;
  sheetBg.hidden = true;
  document.body.classList.remove("lock");
}

function showPicker() {
  var html = '<h3>' + t("picker.title") + '</h3>' +
    '<button type="button" class="btn light" data-act="voice">' + t("picker.voice") + '</button>';
  var visible = visibleTemplates();
  CATEGORIES.forEach(function (c) {
    var list = visible.filter(function (tp) { return tp.cat === c.id; });
    if (!list.length) return;
    html += '<div class="cat">' + c.icon + " " + esc(catName(c)) + '</div><div class="tpls">' +
      list.map(function (tp) { return '<button type="button" class="tpl" data-tpl="' + tp.id + '">' + esc(tplTitle(tp)) + '</button>'; }).join("") +
      '</div>';
  });
  openSheet(html + '<button type="button" class="btn light" data-act="close">' + t("cancel") + '</button>');
}

/* ---------- Spracheingabe: "Hey Livo" ---------- */
var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
var rec = null;
var listening = null;       // laufende Aufnahme: { finish }
var SILENCE_MS = 2500;      // so lange still = der Satz ist fertig
var FIRST_WORD_MS = 8000;   // so lange warten wir, bis jemand anfängt zu sprechen

function stopListening() {
  listening = null;
  if (rec) { var r = rec; rec = null; try { r.abort(); } catch (e) {} }
}

function showVoice() {
  openSheet('<h3>🎤 Hey Livo</h3>' +
    '<p class="muted">' + esc(t("voice.intro")) + '</p>' +
    (Recognition
      ? '<button type="button" class="mic" id="micBtn" aria-label="' + esc(t("voice.speak")) + '">🎤</button>'
      : '<p class="hint">' + esc(t("voice.unsupported")) + '</p>') +
    '<p class="heard" id="heard"></p>' +
    '<form class="sayform" id="sayForm"><input name="say" type="text" placeholder="' + esc(t("voice.type")) + '" autocomplete="off">' +
    '<button class="btn" type="submit">OK</button></form>' +
    '<button type="button" class="btn light" data-act="close">' + t("cancel") + '</button>');

  pendingSaid = "";
  document.getElementById("sayForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var txt = e.target.elements.say.value.trim();
    if (txt) understand(txt, false);
  });
  var mic = document.getElementById("micBtn");
  if (mic) {
    // Tippen während der Aufnahme = "ich bin fertig", sonst neu zuhören
    mic.addEventListener("click", function () { if (listening) listening.finish(); else listen(); });
    listen();
  }
}

// Ein gesprochener Satz ohne Datum wartet hier auf die Ergänzung ("… am 3. November")
var pendingSaid = "";

function joinText(a, b) { return a && b ? a + " " + b : a || b; }

// Ergebnisse einer Runde zu einem Text. Chrome auf Android wiederholt in jedem
// Ergebnis den bisherigen Text, Chrome am PC nicht - beides ergibt denselben Satz.
function collect(results) {
  var text = "";
  for (var i = 0; i < results.length; i++) {
    var s = results[i][0].transcript.trim();
    if (!s) continue;
    var ls = s.toLowerCase(), lx = text.toLowerCase();
    if (lx && ls.indexOf(lx) === 0) text = s;
    else if (lx.indexOf(ls) === -1) text = joinText(text, s);
  }
  return text;
}

function listen(prompt) {
  var mic = document.getElementById("micBtn"), heard = document.getElementById("heard");
  var session = {}, base = "", current = "", lastHeard = 0, started = Date.now(), finishing = false, denied = false, timer = null;
  listening = session;
  function arm(ms) {
    clearTimeout(timer);
    timer = setTimeout(function () { if (listening === session) session.finish(); }, ms);
  }
  session.finish = function () {
    finishing = true;
    clearTimeout(timer);
    if (rec) { try { rec.stop(); } catch (e) {} }
  };
  function round() {
    var r = new Recognition();
    r.lang = LOCALE;
    r.interimResults = true;
    r.continuous = true;
    r.onresult = function (e) {
      current = collect(e.results);
      lastHeard = Date.now();
      heard.textContent = quote(joinText(pendingSaid, joinText(base, current)));
      arm(SILENCE_MS);
    };
    r.onerror = function (e) {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        finishing = true;
        denied = true;
        heard.textContent = t("voice.denied");
      }
    };
    r.onend = function () {
      if (rec !== r || listening !== session) return;   // abgebrochen (Blatt geschlossen)
      base = joinText(base, current);
      current = "";
      // Der Browser hört bei jeder kleinen Pause von selbst auf. Wer gerade noch
      // gesprochen hat (oder noch gar nicht angefangen hat), ist nicht fertig: weiter zuhören.
      if (!finishing && Date.now() - started < 60000 && (!base || Date.now() - lastHeard < SILENCE_MS)) {
        try { round(); return; } catch (err) { /* dann eben hier beenden */ }
      }
      rec = null;
      listening = null;
      clearTimeout(timer);
      mic.classList.remove("on");
      if (base) understand(base, true);
      else if (!denied) heard.textContent = t("voice.nothing");
    };
    rec = r;
    r.start();
  }
  mic.classList.add("on");
  heard.textContent = prompt || t("voice.listening");
  arm(FIRST_WORD_MS);
  try { round(); } catch (e) { rec = null; listening = null; mic.classList.remove("on"); }
}

function understand(text, spoken) {
  var full = pendingSaid ? pendingSaid + " " + text : text;
  var d = draftFrom(full);
  // Gesprochen, aber noch ohne Datum (oft eine Pause vor dem Datum): nachfragen und weiter zuhören
  if (!d.due && spoken && !pendingSaid && document.getElementById("micBtn")) {
    pendingSaid = full;
    listen(t("voice.when", { said: quote(full) }));
    return;
  }
  pendingSaid = "";
  showDraft(d, full);
}

/* ---------- Formular für eine Frist (Bestätigen, Bearbeiten, Erneuern) ---------- */
function opt() { return ' <i>' + t("optional") + '</i>'; }
function leadHTML(val) {
  return '<label class="field"><span>' + t("form.lead") + '</span>' +
    '<input name="lead" type="number" min="0" max="365" inputmode="numeric" value="' + val + '"></label>';
}
function readLead(form, def) {
  var n = parseInt(form.elements.lead.value, 10);
  return isNaN(n) || n < 0 ? def : n;
}
// Uhrzeit und "kurz vorher erinnern" - die Auswahl erscheint erst, wenn eine Uhrzeit drin ist.
// remindMin: undefined = neue Frist (Vorschlag 15 Min.), 0 = ausdrücklich keine.
var SOON_VALUES = [5, 15, 30, 60, 120, 0];
var SOON_DEFAULT = 15;
function soonText(min) {
  if (!min) return t("soon.no");
  if (min === 60) return t("soon.hour");
  return min > 60 ? t("soon.hours", { n: min / 60 }) : t("soon.min", { n: min });
}
// Eigenes Textfeld statt type="time": Die Android-Uhrzeitauswahl versteckt bei Samsung im
// Tastatur-Modus den Knopf "Set". Man tippt "2030" auf der Zahlentastatur, daraus wird 20:30.
function timeHTML(time, remindMin) {
  var selected = remindMin == null ? SOON_DEFAULT : remindMin;
  return '<label class="field"><span>' + t("form.time") + opt() + '</span><input name="time" type="text" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="' + esc(t("form.timePh")) + '" value="' + esc(time || "") + '"></label>' +
    '<label class="field" id="soonField"' + (time ? "" : " hidden") + '><span>' + t("form.soon") + '</span><select name="soon">' +
    SOON_VALUES.map(function (v) {
      return '<option value="' + v + '"' + (v === selected ? " selected" : "") + '>' + esc(soonText(v)) + '</option>';
    }).join("") + '</select></label>';
}
// "2030", "20:30", "20.30", "20 30" -> "20:30"; "930" -> "09:30"; "9" -> "09:00".
// Leer -> "", ungültig -> null.
function parseTime(value) {
  var v = value.trim();
  if (!v) return "";
  var m = v.match(/^(\d{1,2})[:.,\s]?(\d{2})?$/);
  if (!m) return null;
  var h = parseInt(m[1], 10), mi = parseInt(m[2] || "0", 10);
  if (h > 23 || mi > 59) return null;
  return (h < 10 ? "0" : "") + h + ":" + (mi < 10 ? "0" : "") + mi;
}
function wireTime(form) {
  var input = form.elements.time;
  input.addEventListener("input", function () {
    // Nach vier Ziffern gleich den Doppelpunkt setzen
    if (/^\d{4}$/.test(input.value) && parseTime(input.value)) input.value = parseTime(input.value);
    document.getElementById("soonField").hidden = !input.value.trim();
  });
  input.addEventListener("blur", function () {
    var v = parseTime(input.value);
    if (v) input.value = v;
  });
}
// Uhrzeit aus dem Formular; null (mit Fehlermeldung), wenn sie nicht stimmt
function readTime(form) {
  var v = parseTime(form.elements.time.value);
  if (v === null) document.getElementById("err").textContent = t("form.errTime");
  return v;
}
function readSoon(form) {
  return parseTime(form.elements.time.value) ? (parseInt(form.elements.soon.value, 10) || 0) : 0;
}

// Wiederholung: feste Auswahl plus "Benutzerdefiniert …" = alle N Tage, Wochen, Monate oder Jahre
var REPEAT_UNITS = ["d", "w", "m", "y"];
function repeatHTML(r, label) {
  var v = repeatValue(r), custom = REPEAT_OPTIONS.indexOf(v) < 0, n = 1, unit = "w";
  if (custom) {
    // eigene Angabe vorbelegen: Tage als Wochen, wenn es aufgeht, Monate als Jahre
    if (r.everyDays) { unit = r.everyDays % 7 === 0 ? "w" : "d"; n = unit === "w" ? r.everyDays / 7 : r.everyDays; }
    else { unit = r.every % 12 === 0 ? "y" : "m"; n = unit === "y" ? r.every / 12 : r.every; }
  }
  return '<label class="field"><span>' + esc(label || t("form.every")) + '</span><select name="every">' +
    REPEAT_OPTIONS.map(function (o) {
      return '<option value="' + o + '"' + (o === v ? " selected" : "") + '>' + esc(repeatOptionText(o)) + '</option>';
    }).join("") + '<option value="custom"' + (custom ? " selected" : "") + '>' + esc(t("everyopt.custom")) + '</option></select></label>' +
    '<div class="field" id="repeatCustom"' + (custom ? "" : " hidden") + '><span>' + t("form.everyCustom") + '</span><div class="row2">' +
    '<input name="everyN" type="number" min="1" max="999" inputmode="numeric" value="' + n + '">' +
    '<select name="everyUnit">' + REPEAT_UNITS.map(function (u) {
      return '<option value="' + u + '"' + (u === unit ? " selected" : "") + '>' + esc(t("unit." + u)) + '</option>';
    }).join("") + '</select></div></div>';
}
// "14 Tage vorher" passt nicht zu "jede Woche" - die Erinnerung käme sofort nach dem Anlegen.
// Bei Wiederholung in Tagen höchstens 1 Tag Vorlauf je Woche Abstand (jeden Tag: am Tag selbst).
function leadCap(r) { return r && r.everyDays > 0 ? Math.floor(r.everyDays / 7) : Infinity; }
function wireRepeat(form) {
  if (!form.elements.everyN) return; // Vorlage ohne Wiederholungs-Auswahl
  function fitLead() {
    var cap = leadCap(readRepeat(form, true)), lead = form.elements.lead;
    if (lead && parseInt(lead.value, 10) > cap) lead.value = cap;
  }
  form.elements.every.addEventListener("change", function () {
    document.getElementById("repeatCustom").hidden = form.elements.every.value !== "custom";
    fitLead();
  });
  form.elements.everyN.addEventListener("input", fitLead);
  form.elements.everyUnit.addEventListener("change", fitLead);
}
// { every, everyDays } aus dem Formular; null, wenn die eigene Angabe keine Zahl ab 1 ist
// (mit Fehlermeldung, außer quiet - beim Tippen in der Vorschau)
function readRepeat(form, quiet) {
  var v = form.elements.every.value;
  if (v !== "custom") return parseRepeatValue(v);
  var n = parseInt(form.elements.everyN.value, 10), u = form.elements.everyUnit.value;
  if (!(n >= 1)) {
    if (!quiet) document.getElementById("err").textContent = t("form.errEvery");
    return null;
  }
  if (u === "d" || u === "w") return { every: 0, everyDays: Math.min(n * (u === "w" ? 7 : 1), 3650) };
  return { every: Math.min(n * (u === "y" ? 12 : 1), 240), everyDays: 0 };
}

function itemFormHTML(it, opts) {
  return '<form id="frm" novalidate>' + (opts.intro || "") +
    '<label class="field"><span>' + t("form.what") + '</span><input name="title" type="text" value="' + esc(it.title) + '"></label>' +
    '<label class="field"><span>' + (opts.dateLabel || t("form.due")) + '</span><input name="due" type="date" value="' + esc(it.due) + '"></label>' +
    timeHTML(it.time, it.remindMin) +
    repeatHTML(it) +
    leadHTML(it.lead) +
    '<p class="err" id="err"></p><button class="btn" type="submit">' + t("save") + '</button>' + (opts.back || "") + '</form>';
}
// Liest das Formular in "it" ein; false, wenn Titel oder Datum fehlen
function readItemForm(form, it) {
  var title = form.elements.title.value.trim(), due = form.elements.due.value;
  if (!title || !due || !isDate(fromISO(due))) {
    document.getElementById("err").textContent = t("form.err");
    return false;
  }
  var time = readTime(form);
  if (time === null) return false;
  var rep = readRepeat(form);
  if (!rep) return false;
  it.title = title;
  it.due = due;
  it.time = time;
  it.remindMin = readSoon(form);
  it.every = rep.every;
  it.everyDays = rep.everyDays;
  it.lead = readLead(form, it.lead);
  return true;
}

function showDraft(d, said) {
  var tp = find(TEMPLATES, d.tpl), hint = tplHint(tp);
  openSheet('<h3>' + find(CATEGORIES, tp.cat).icon + ' ' + t("draft.title") + '</h3>' +
    '<p class="said">' + esc(quote(said)) + '</p>' +
    itemFormHTML(d, {
      intro: (d.due ? "" : '<p class="err">' + t("draft.noDate") + '</p>') + (hint ? '<p class="hint">' + esc(hint) + '</p>' : ""),
      back: '<button class="btn light" type="button" data-act="voice">' + t("draft.again") + '</button>'
    }));
  var form = document.getElementById("frm");
  wireTime(form);
  wireRepeat(form);
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!readItemForm(form, d)) return;
    saving(form, addItem(d), t("saved", { x: remindText(d) }));
  });
}

// Wartet auf das Speichern; bei Erfolg Blatt zu, sonst Fehler im Formular
async function saving(form, promise, okText) {
  var btn = form.querySelector("[type=submit]");
  btn.disabled = true;
  btn.textContent = t("saving");
  try {
    await promise;
    closeSheet(); render();
    toast(okText);
  } catch (err) {
    document.getElementById("err").textContent = errText(err);
    btn.disabled = false;
    btn.textContent = t("save");
  }
}

/* ---------- Neue Frist aus einer Vorlage ---------- */
function fieldHTML(tp, f) {
  var v = f.value != null ? f.value : "", ph = fieldPh(tp, f);
  var input;
  if (f.type === "repeat") return repeatHTML(parseRepeatValue(v), fieldLabel(tp, f));
  if (f.type === "select") {
    input = '<select name="' + f.key + '">' + f.options.map(function (o) {
      return '<option value="' + o[0] + '"' + (String(o[0]) === String(v) ? " selected" : "") + '>' + esc(o[1]) + '</option>';
    }).join("") + '</select>';
  } else if (f.type === "months") {
    input = '<input name="' + f.key + '" type="number" min="1" max="120" inputmode="numeric" value="' + esc(v) + '">';
  } else {
    input = '<input name="' + f.key + '" type="' + f.type + '" value="' + esc(v) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : "") + '>';
  }
  return '<label class="field"><span>' + esc(fieldLabel(tp, f)) + (f.optional ? opt() : "") + '</span>' + input + '</label>';
}
function readValues(form, tp) {
  var v = {};
  tp.fields.forEach(function (f) {
    v[f.key] = f.type === "repeat" ? readRepeat(form, true) : (form.elements[f.key].value || "").trim();
  });
  return v;
}
// Liefert die fertige Frist oder null, wenn Pflichtfelder fehlen oder das Datum ungültig ist
function build(tp, v, lead) {
  if (tp.fields.some(function (f) { return !f.optional && !v[f.key]; })) return null;
  var r = tp.compute(v);
  if (!isDate(r.due)) return null;
  return { tpl: tp.id, title: tplName(tp, v), due: toISO(r.due), time: "", every: r.every || 0, everyDays: r.everyDays || 0, from: tp.from || "due", lead: lead, renew: !!tp.renew };
}

// Ratgeber-Seite zur Vorlage (es gibt sie nur auf Deutsch und Englisch)
var GUIDE_PAGES = {
  de: { personalausweis: "../personalausweis-abgelaufen/", tuev: "../tuev-ueberzogen/", kfzversicherung: "../kfz-versicherung-wechseln/" },
  en: { aufenthaltstitel: "../en/deadlines-germany/", tuev: "../en/deadlines-germany/" }
};
function guideLinkHTML(tp) {
  var url = tp && GUIDE_PAGES[LANG] && GUIDE_PAGES[LANG][tp.id];
  return url ? '<a class="guidelink" href="' + url + '" target="_blank" rel="noopener">' + esc(t("guide.more")) + '</a>' : "";
}

function showNew(tid) {
  var tp = find(TEMPLATES, tid);
  if (!tp) return;
  var hint = tplHint(tp);
  openSheet('<h3>' + find(CATEGORIES, tp.cat).icon + " " + esc(tplTitle(tp)) + '</h3><form id="frm" novalidate>' +
    (hint ? '<p class="hint">' + esc(hint) + '</p>' : "") + guideLinkHTML(tp) +
    tp.fields.map(function (f) { return fieldHTML(tp, f); }).join("") +
    timeHTML("", undefined) +
    leadHTML(tp.lead) +
    '<div class="preview" id="pv"></div><p class="err" id="err"></p>' +
    '<button class="btn" type="submit">' + t("save") + '</button>' +
    '<button class="btn light" type="button" data-act="add">' + t("back") + '</button></form>');

  var form = document.getElementById("frm");
  wireTime(form);
  wireRepeat(form);
  // Frist aus den Feldern der Vorlage plus der (freiwilligen) Uhrzeit
  function current() {
    var it = build(tp, readValues(form, tp), readLead(form, tp.lead));
    if (it) {
      it.time = parseTime(form.elements.time.value) || "";
      it.remindMin = readSoon(form);
    }
    return it;
  }
  function update() {
    var it = current();
    document.getElementById("pv").innerHTML = it
      ? t("preview", { due: esc(dueText(it)), remind: esc(remindText(it)), every: esc(everyText(it)) })
      : t("preview.empty");
  }
  form.addEventListener("input", update);
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (form.elements.everyN && !readRepeat(form)) return;
    var it = current();
    if (!it) { document.getElementById("err").textContent = t("form.errFields"); return; }
    if (readTime(form) === null) return;
    saving(form, addItem(it), t("saved", { x: remindText(it) }));
  });
  update();
}

/* ---------- Eine Frist ansehen, erledigen, bearbeiten ---------- */
function showItem(id) {
  var it = find(items, id);
  if (!it) return;
  var s = status(it), tp = find(TEMPLATES, it.tpl), hint = tp ? tplHint(tp) : "";
  var main = repeats(it) ? t("done.next") : it.renew ? t("done.renew") : t("done");
  openSheet('<div class="st-' + s.key + '"><div class="d-head"><span class="ico">' + iconOf(it) + '</span><div><h3>' + esc(it.title) + '</h3>' +
    '<span class="pill">' + esc(whenText(s.days)) + '</span></div></div>' +
    '<dl><dt>' + t("dl.due") + '</dt><dd>' + esc(dueText(it)) + '</dd>' +
    '<dt>' + t("dl.remind") + '</dt><dd>' + esc(t("dl.remindVal", { n: it.lead, x: remindText(it) })) + '</dd>' +
    (it.time && it.remindMin ? '<dt>' + t("dl.soon") + '</dt><dd>' + esc(soonText(it.remindMin)) + '</dd>' : "") +
    '<dt>' + t("dl.every") + '</dt><dd>' + esc(everyText(it)) + '</dd></dl>' +
    (hint ? '<p class="hint">' + esc(hint) + '</p>' : "") + guideLinkHTML(tp) +
    (canEdit()
      ? '<button type="button" class="btn" data-act="done" data-id="' + it.id + '">' + main + '</button>' +
        '<button type="button" class="btn light" data-act="edit" data-id="' + it.id + '">' + t("edit") + '</button>'
      : '<button type="button" class="btn" data-act="plus">' + t("plus.toEdit") + '</button>') +
    '<button type="button" class="btn light" data-act="share" data-id="' + it.id + '">' + t("share") + '</button>' +
    '<button type="button" class="btn danger" data-act="del" data-id="' + it.id + '">' + t("delete") + '</button></div>');
}

async function markDone(id) {
  var it = find(items, id);
  if (!it) return;
  try {
    if (repeats(it)) {
      var next = nextRepeat(it.from === "done" ? today() : fromISO(it.due), it);
      while (next <= today()) next = nextRepeat(next, it);
      var old = it.due;
      it.due = toISO(next);
      try { await updateItem(it); } catch (e) { it.due = old; throw e; }
      closeSheet(); render();
      toast(t("toast.doneNext", { date: fmt(next) }));
    } else if (it.renew) {
      showEdit(id, true);
    } else {
      await deleteItem(id);
      closeSheet(); render();
      toast(t("toast.done"));
    }
  } catch (e) {
    toast(errText(e));
  }
}

function showEdit(id, renewing) {
  var it = find(items, id);
  if (!it) return;
  var view = renewing ? Object.assign({}, it, { due: "" }) : it;
  openSheet('<h3>' + (renewing ? t("edit.renewTitle") : t("edit")) + '</h3>' +
    itemFormHTML(view, {
      intro: renewing ? '<p class="hint">' + esc(t("edit.renewHint")) + '</p>' : "",
      dateLabel: renewing ? t("edit.renewLabel") : t("form.due"),
      back: '<button class="btn light" type="button" data-open="' + it.id + '">' + t("back") + '</button>'
    }));
  var form = document.getElementById("frm");
  wireTime(form);
  wireRepeat(form);
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var before = Object.assign({}, it);
    if (!readItemForm(form, it)) return;
    saving(form, updateItem(it).catch(function (err) { Object.assign(it, before); throw err; }), t("saved.plain"));
  });
}

async function removeItem(id) {
  var it = find(items, id);
  if (!it) return;
  if (!confirm(t("confirm.delete", { title: it.title }))) return;
  try {
    await deleteItem(id);
    closeSheet(); render();
  } catch (e) {
    toast(errText(e));
  }
}

// Text in die Zwischenablage; geht das nicht, zum Abschreiben anzeigen
async function copyText(text, okText) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okText);
  } catch (e) {
    window.prompt("", text);
  }
}

// Teilen über das Teilen-Menü des Geräts (WhatsApp, SMS, Mail …), sonst in die Zwischenablage.
// Jeder darf teilen, auch nach der Testphase - der Link auf heylivo.com ist kostenlose Werbung.
async function shareItem(id) {
  var it = find(items, id);
  if (!it) return;
  var text = "📅 " + it.title + " – " + t("card.due", { x: dueText(it) }) + "\n\n" +
    t("share.by") + " " + (LANG === "de" ? "https://heylivo.com/" : "https://heylivo.com/en/");
  if (navigator.share) {
    try {
      await navigator.share({ text: text });
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return; // selbst abgebrochen
    }
  }
  copyText(text, t("toast.shareCopied"));
}

/* ---------- Kalender-Abo (Livo Plus, Edge Function "calendar") ---------- */
// Ein geheimer Link pro Konto; Google, Apple und Outlook holen darüber die Fristen ab.
// Im Demo zeigen die Knöpfe auf den Beispiel-Kalender.
var calFeedUrl = "";
function calendarHTML() {
  return '<div class="calbox" id="calBox"><h4>📅 ' + esc(t("cal.title")) + '</h4>' +
    '<p class="muted">' + esc(t("cal.intro")) + '</p>' +
    '<div id="calLinks"><p class="muted">' + esc(t("loading")) + '</p></div></div>';
}
// Holt den Link (renew = neuer Link, der alte geht dann nicht mehr) und zeigt die Abo-Knöpfe
async function loadCalendar(renew) {
  try {
    var token = DEMO ? "demo-" + LANG : "";
    if (!token) {
      var r = await sb.rpc("calendar_feed", { feed_lang: LANG, renew: !!renew });
      if (r.error) throw r.error;
      token = r.data;
    }
    calFeedUrl = SUPABASE_URL + "/functions/v1/calendar/" + token + ".ics";
  } catch (e) {
    var failed = document.getElementById("calLinks");
    if (failed) failed.innerHTML = '<p class="err">' + esc(t("cal.error")) + '</p>';
    return false;
  }
  var box = document.getElementById("calLinks");
  if (!box) return true; // Fenster inzwischen zu
  var webcal = calFeedUrl.replace(/^https:/, "webcal:");
  box.innerHTML = '<div class="calgrid">' +
    '<a class="btn light" target="_blank" rel="noopener" href="' + esc("https://calendar.google.com/calendar/r?cid=" + encodeURIComponent(webcal)) + '">' + esc(t("cal.google")) + '</a>' +
    '<a class="btn light" href="' + esc(webcal) + '">' + esc(t("cal.apple")) + '</a>' +
    '<a class="btn light" target="_blank" rel="noopener" href="' + esc("https://outlook.live.com/calendar/0/addfromweb?url=" + encodeURIComponent(calFeedUrl) + "&name=heylivo") + '">' + esc(t("cal.outlook")) + '</a>' +
    '<button type="button" class="btn light" data-act="calcopy">' + esc(t("cal.copy")) + '</button></div>' +
    '<p class="hint">' + esc(t("cal.note")) + '</p>' +
    (DEMO ? "" : '<button type="button" class="linkbtn" data-act="calreset">' + esc(t("cal.reset")) + '</button>');
  return true;
}
async function resetCalendar() {
  if (!confirm(t("cal.resetConfirm"))) return;
  if (await loadCalendar(true)) toast(t("cal.resetDone"));
}

// Livo Plus: Angebot, und nach der Testphase der Hinweis statt Formular.
// Kaufen nur mit gesichertem Konto - sonst wäre Plus mit den Browserdaten weg.
// Mit Plus (und im Demo) steht hier auch das Kalender-Abo; focus "calendar" springt dorthin.
function showPlus(focus) {
  var over = !canEdit(), calendar = isPlus() || DEMO;
  var buyUrl = PLUS_LINK && userId && !DEMO
    ? PLUS_LINK + "?client_reference_id=" + encodeURIComponent(userId) + "&prefilled_email=" + encodeURIComponent(userEmail) + "&locale=" + LANG : "";
  openSheet('<h3>' + (over ? t("plus.over", { n: TRIAL_DAYS }) : isPlus() ? t("plus.active") : "Livo Plus") + '</h3>' +
    (isPlus() ? '<p class="muted">' + t("plus.until", { date: fmt(fromISO(plusUntil)) }) + '</p>' : "") +
    (calendar ? calendarHTML() : "") +
    '<p class="hint">' + t("plus.offer") + '<br>✓ ' + t("plus.cal") + '</p>' +
    (over ? '<p class="muted">' + t("plus.kept") + '</p>' : "") +
    (buyUrl && !userEmail
      ? '<p class="hint">' + t("plus.secureFirst") + '</p>' +
        '<button type="button" class="btn" data-act="account" data-then="plus">' + t("acc.secure") + '</button>'
      : buyUrl
      ? '<a class="btn" href="' + esc(buyUrl) + '">' + (isPlus() ? t("plus.extend") : t("plus.buy")) + '</a>' +
        '<p class="legal">' + t("plus.legal") + '</p>'
      : '<button type="button" class="btn" disabled>' + t("plus.soon") + '</button>') +
    '<button type="button" class="btn light" data-act="close">OK</button>');
  if (calendar) {
    loadCalendar(false);
    if (focus === "calendar") document.getElementById("calBox").scrollIntoView({ block: "start" });
  }
}

// Rückkehr von Stripe (?plus=danke): kurz warten, bis der Webhook Plus eingetragen hat
async function afterPurchase() {
  history.replaceState(null, "", location.pathname);
  toast(t("toast.thanks"));
  for (var i = 0; i < 10 && !isPlus(); i++) {
    await new Promise(function (resolve) { setTimeout(resolve, 2000); });
    try { await loadAll(); } catch (e) { /* nächster Versuch */ }
  }
  render();
  toast(isPlus() ? t("toast.plusActive", { date: fmt(fromISO(plusUntil)) }) : t("toast.plusPending"));
}

/* ---------- Kurze Meldung ---------- */
var toastTimer;
function toast(msg) {
  var el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.hidden = true; }, 2800);
}

/* ---------- Klicks ---------- */
document.addEventListener("click", function (e) {
  var el = e.target.closest("[data-act],[data-open],[data-tpl]");
  if (!el) return;
  if (el.hasAttribute("data-open")) return showItem(el.getAttribute("data-open"));
  var act = el.getAttribute("data-act"), id = el.getAttribute("data-id");
  // Anlegen und Ändern nur in der Testphase oder mit Livo Plus (Löschen und Ansehen immer)
  var changes = el.hasAttribute("data-tpl") || act === "add" || act === "voice" || act === "done" || act === "edit";
  if (act === "calendar") return showPlus("calendar");
  if (act === "plus" || (changes && !canEdit())) return showPlus();
  if (el.hasAttribute("data-tpl")) return showNew(el.getAttribute("data-tpl"));
  if (act === "push") {
    el.disabled = true;
    enablePush().then(function (ok) {
      render();
      toast(ok ? t("toast.pushOn") : pushState === "blocked" ? t("toast.pushBlocked") : t("toast.pushOff"));
    }, function () {
      render();
      toast(t("toast.retry"));
    });
    return;
  }
  if (act === "add") showPicker();
  else if (act === "voice") showVoice();
  else if (act === "close") closeSheet();
  else if (act === "done") markDone(id);
  else if (act === "edit") showEdit(id, false);
  else if (act === "del") removeItem(id);
  else if (act === "share") shareItem(id);
  else if (act === "calcopy") copyText(calFeedUrl, t("toast.linkCopied"));
  else if (act === "calreset") resetCalendar();
  else if (act === "howto") showHowto();
  else if (act === "filter") setFilter(id);
  else if (act === "info") setInfoTab(id);
  else if (act === "year") { yearShift = 0; showYear(); }
  else if (act === "ynav") { yearShift += +id; showYear(); }
  else if (act === "yday") showYearDay(id);
  else if (act === "yadd") addOnDay(id);
  else if (act === "account" || act === "signin") {
    // data-then="plus": nach dem Sichern bzw. Anmelden geht das Kauf-Fenster wieder auf
    var then = el.getAttribute("data-then") || (accFlow && el.closest("#sheet") ? accFlow.then : "");
    showAccount(act === "signin" ? "signin" : "");
    if (accFlow) accFlow.then = then;
  }
  else if (act === "resend") sendCode(el, true);
  else if (act === "otherEmail") otherEmail();
  else if (act === "signout") signOutHere();
});
sheetBg.addEventListener("click", closeSheet);
document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSheet(); });

/* ---------- Beispiel-Fristen zum Ausprobieren ---------- */
function seedDemo() {
  var t0 = today();
  function add(tid, v) {
    var tp = find(TEMPLATES, tid);
    if (tp.only && tp.only !== LANG) return;
    var it = build(tp, v, tp.lead);
    it.id = uid();
    items.push(it);
  }
  items = [];
  add("rechnung", { what: demoWord("bill"), date: toISO(addDays(t0, 2)) });
  add("personalausweis", { date: toISO(addDays(t0, 58)) });
  add("inspektion", { date: toISO(addDays(t0, -4)) });
  add("handy", { what: demoWord("phone"), start: toISO(addMonths(t0, -23)), term: "24" });
  add("kfzversicherung", {});
  add("zahnarzt", { date: toISO(addMonths(t0, -5)) });
  add("tuev", { month: toISO(addMonths(t0, 7)).slice(0, 7) });
  add("steuer", {});
  add("reisepass", { date: toISO(addMonths(t0, 26)) });
}

/* ---------- Sprache oben rechts: eigenes Aufklappmenü mit Scroll-Liste ---------- */
function setupLanguage() {
  var btn = document.getElementById("langBtn"), list = document.getElementById("langList");
  if (!btn || !list) return;
  btn.setAttribute("aria-label", t("lang"));
  document.getElementById("langCode").textContent = LANG.toUpperCase();
  list.innerHTML = Object.keys(LANGS).map(function (code) {
    // Nur das Kürzel (DE, EL, EN …); der Name steht im Tooltip und für Bildschirmleser
    return '<li role="option"' + (code === LANG ? ' aria-selected="true"' : "") + '><button type="button" data-lang="' + code + '" lang="' + code + '"' +
      ' title="' + esc(LANGS[code]) + '" aria-label="' + esc(LANGS[code]) + '">' + code.toUpperCase() + '</button></li>';
  }).join("");
  function open(yes) {
    list.hidden = !yes;
    btn.setAttribute("aria-expanded", yes ? "true" : "false");
    // aktuelle Sprache gleich sichtbar machen (ohne die Seite zu verschieben)
    var cur = yes && list.querySelector("[aria-selected] button");
    if (cur) list.scrollTop = Math.max(0, cur.offsetTop - list.clientHeight / 2 + cur.offsetHeight / 2);
  }
  btn.addEventListener("click", function () { open(list.hidden); });
  list.addEventListener("click", function (e) {
    var b = e.target.closest("[data-lang]");
    if (!b) return;
    if (b.getAttribute("data-lang") === LANG) open(false);
    else setLang(b.getAttribute("data-lang"));
  });
  document.addEventListener("click", function (e) { if (!list.hidden && !e.target.closest("#langDd")) open(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") open(false); });
  document.querySelector(".fab").setAttribute("aria-label", t("add"));
  document.getElementById("brand").href = LANG === "de" ? "../" : "../en/";
  // "← Startseite" oben in der Mitte - das Logo führt auch dorthin, aber das sieht man nicht
  document.getElementById("homeLink").href = LANG === "de" ? "../" : "../en/";
  document.getElementById("homeText").textContent = t("home");
  // Ratgeber und Rechtliches unten: Deutsch auf die deutschen Seiten, alle anderen Sprachen auf die englischen
  var links = document.getElementById("appLinks"), de = LANG === "de";
  if (links) links.innerHTML = [
    [de ? "../ratgeber/" : "../en/deadlines-germany/", "legal.guides"],
    [de ? "../impressum.html" : "../en/imprint.html", "legal.imprint"],
    [de ? "../datenschutz.html" : "../en/privacy.html", "legal.privacy"],
    [de ? "../agb.html" : "../en/terms.html", "legal.terms"]
  ].map(function (l) { return '<a href="' + l[0] + '">' + esc(t(l[1])) + '</a>'; }).join("");
}

/* ---------- Start ---------- */
async function start() {
  var list = document.getElementById("list");
  setupLanguage();
  if (DEMO) {
    seedDemo();
  } else {
    list.innerHTML = '<p class="loading">' + t("loading") + '</p>';
    try {
      await signIn();
      await loadAll();
    } catch (e) {
      list.innerHTML = '<p class="offline">' + t("offline") + '</p>';
      return;
    }
    try { localStorage.removeItem("livo.items.v1"); } catch (e) {} // Fristen aus dem ersten Prototyp
  }
  render();
  // Erinnerungen im Hintergrund vorbereiten - die Liste wartet nie darauf
  if (!DEMO) initPush().then(render, render);
  if (!DEMO && params.get("plus") === "danke") afterPurchase();
  if (params.get("filter")) setFilter(params.get("filter")); // zum Testen: &filter=week | month | all
  var show = params.get("show") || "";
  if (params.get("say")) understand(params.get("say"));
  else if (show === "add") showPicker();
  else if (show === "voice") showVoice();
  else if (show.indexOf("form:") === 0) showNew(show.slice(5));
  else if (show === "item" && items.length) showItem(sortedItems()[0].id);
  else if (show === "account") showAccount();
  else if (show === "signin") showAccount("signin");
  else if (show === "howto") showHowto();
  else if (show === "year") showYear();
  else if (show === "plus") showPlus(); // "Jetzt starten" bei Livo Plus auf der Website
}
start();
