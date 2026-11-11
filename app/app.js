// heylivo – Fristen in Supabase. Ohne Anmeldung bekommt jeder Browser ein
// anonymes Konto; die Datenbank (RLS) zeigt jedem nur seine eigenen Fristen.
// "Konto sichern" und "Anmelden" (E-Mail-Adresse + Code) stehen in account.js.
// Alle Texte kommen aus i18n.js (t()), die Vorlagen-Texte aus templates.js.
// URL-Parameter zum Testen: ?demo=1 zeigt Beispiel-Fristen (wird nicht gespeichert),
// &show=add | voice | form:<vorlage> | item | account | signin | howto öffnet direkt das passende Blatt,
// &say=<Satz> verarbeitet einen Satz so, als wäre er gesprochen worden, &lang=en usw.
// ?add=<Titel>&d=<JJJJ-MM-TT>[&h=&he=&s=&rm=&rd=&nv=&l=&tpl=] = geteilte Frist übernehmen (shareLink).

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
// Android-App aus dem Play Store (Trusted Web Activity, Paket com.heylivo.reminders, Start-URL /app/?von=play):
// Dort darf Livo Plus nicht über Stripe verkauft werden (Zahlungsrichtlinie von Google Play) - also kein Kauf.
// Erkennung beim Start: ?von=play (liest ref.js) oder Chrome meldet die App als verweisende Seite.
// Gilt danach für diesen Tab (sessionStorage) - im normalen Chrome bleibt der Kauf sichtbar.
var PLAY = (function () {
  var play = (window.heylivoSource && window.heylivoSource() === "play") ||
    document.referrer.indexOf("android-app://com.heylivo.") === 0; // jedes eigene Paket com.heylivo.*
  try {
    if (play) sessionStorage.setItem("heylivoPlay", "1");
    else play = sessionStorage.getItem("heylivoPlay") === "1";
  } catch (e) { /* ohne Speicher zählt nur der Start selbst */ }
  return play;
})();

/* ---------- Speicher ---------- */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

var TIME_ZONE = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin"; } catch (e) { return "Europe/Berlin"; } })();

var NOTE_MAX = 500;
function toRow(it) {
  var row = {
    tpl: it.tpl || "eigene", title: it.title, due: it.due, due_time: it.time || null,
    // Endzeit (Spalte aus 0012_time_end.sql) nur zusammen mit einer Uhrzeit
    due_time_end: it.time && it.timeEnd ? it.timeEnd : null,
    every_months: it.every || 0, every_days: it.everyDays || 0, from_done: it.from === "done", lead_days: it.lead, renew: !!it.renew,
    remind_min: it.time && it.remindMin ? it.remindMin : null, tz: TIME_ZONE,
    // Notiz (Spalte aus 0020_note.sql)
    note: it.note ? it.note.slice(0, NOTE_MAX) : null
  };
  // Letzter Tag eines Zeitraums (Spalte aus 0018_due_end.sql) - nur bei Urlaubstagen, damit alle anderen
  // Fristen auch ohne die Spalte gespeichert werden können
  if (it.end) row.due_end = it.end;
  return row;
}
function fromRow(r) {
  return {
    id: r.id, tpl: r.tpl, title: r.title, due: r.due, time: r.due_time ? r.due_time.slice(0, 5) : "",
    timeEnd: r.due_time && r.due_time_end ? r.due_time_end.slice(0, 5) : "",
    every: r.every_months, everyDays: r.every_days || 0, from: r.from_done ? "done" : "due", lead: r.lead_days, renew: r.renew,
    remindMin: r.remind_min || 0, end: r.due_end || "", note: r.note || ""
  };
}
async function signIn() {
  var s = await sb.auth.getSession();
  if (s.data.session) { setUser(s.data.session.user); return; }
  // Neues Konto: Herkunft des Besuchs (ref.js: Website-Link ?von=…, verweisende Seite, In-App-Browser)
  // nur als Stichwort, z. B. "instagram" - für den Wochenbericht; "direkt" = unbekannt
  var src = (window.heylivoSource && window.heylivoSource()) || "direkt";
  var r = await sb.auth.signInAnonymously({ options: { data: { src: src } } });
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
  var saved = it;
  if (DEMO) { it.id = uid(); items.push(it); }
  else {
    var r = await sb.from("deadlines").insert(toRow(it)).select().single();
    if (r.error) throw r.error;
    saved = fromRow(r.data);
    items.push(saved);
    if (!trialStarted) trialStarted = toISO(today()); // die erste Frist startet die Testphase
  }
  // Geschenk wartet auf die erste Frist: erst nach dem Speichern-Ablauf (Meldung, Fenster zu) einlösen
  if (giftPending) { giftPending = false; setTimeout(giftAfterFirst, 0); }
  return saved;
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
// Datum in allen Sprachen gleich: TT.MM.JJJJ (Wunsch des Nutzers - keine Schrägstriche wie 11/18/2026)
function fmt(d) { return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear(); }
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
  // Zeitraum (Urlaubstage): läuft vom ersten bis zum letzten Tag, vorbei erst danach
  if (it.end && days < 0) {
    var left = diffDays(today(), fromISO(it.end));
    return left >= 0 ? { key: "now", days: 0, running: true } : { key: "late", days: left };
  }
  if (days < 0) return { key: "late", days: days };
  if (days <= it.lead) return { key: "now", days: days };
  return { key: "later", days: days };
}
function pillText(s) { return s.running ? t("when.running") : whenText(s.days); }
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
// Arbeitstage eines Zeitraums: ohne Samstag, Sonntag und die Feiertage des gewählten Landes (Jahr im Blick)
function workDays(it) {
  var a = fromISO(it.due), b = fromISO(it.end), hol = holidayMap(a.getFullYear(), b.getFullYear()), n = 0;
  for (var d = a; d <= b; d = addDays(d, 1)) if (d.getDay() % 6 && !hol[toISO(d)]) n++;
  return n;
}
function dueText(it) {
  if (it.end) {
    var n = workDays(it);
    return fmt(fromISO(it.due)) + " – " + fmt(fromISO(it.end)) + " · " + (n === 1 ? t("range.day1") : t("range.days", { n: n }));
  }
  return fmt(fromISO(it.due)) + (it.time ? ", " + it.time + (it.timeEnd ? "–" + it.timeEnd : "") + t("time.suffix") : "");
}
// Letzte Erinnerung kurz vor Ablauf - gleiche Regel wie lastDays in send-reminders:
// bei langem Vorlauf (ab 30 Tagen) 7 Tage vorher, ab 3 Tagen 1 Tag vorher, sonst keine
function lastDays(lead) { return lead >= 30 ? 7 : lead >= 3 ? 1 : 0; }
function lastHTML(it) {
  var n = lastDays(it.lead), at = n ? addDays(fromISO(it.due), -n) : null;
  if (!at || at < today() || it.lead <= n) return "";
  return '<dt>' + t("dl.last") + '</dt><dd>' + esc(t("dl.remindVal", { n: n, x: fmt(at) })) + '</dd>';
}
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
// Symbol einer Kategorie in ihrer Farbe (tone in templates.js -> .t-c / .t-b / .t-p in style.css)
function catIco(c) { return ico(c.icon, "t-" + c.tone); }
function catOf(it) { var tp = find(TEMPLATES, it.tpl); return find(CATEGORIES, tp ? tp.cat : "own"); }
// Eigenes Symbol einer Vorlage (Geschenk), sonst das ihrer Kategorie - immer in der Farbe der Kategorie
function iconOf(it) { var tp = find(TEMPLATES, it.tpl), c = catOf(it); return ico(tp && tp.icon ? tp.icon : c.icon, "t-" + c.tone); }
// Kästchen hinter dem Symbol: helle Fläche in der Farbe der Kategorie
function icoBox(it) { return '<span class="ico t-' + catOf(it).tone + '">' + iconOf(it) + '</span>'; }
function sortedItems() {
  return items.slice().sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; });
}

/* ---------- Liste ---------- */
// "Hey Livo": Kasten mit echtem Eingabefeld - tippen und Enter, oder rechts daneben aufs Mikrofon.
// Sobald Text im Feld steht, wird das Mikrofon zum Pfeil (abschicken).
function voicebarHTML() {
  return '<div class="hero"><div class="hero-head"><b>Hey Livo 👋</b><small>' + esc(t("hero.sub")) + '</small></div>' +
    '<form class="hero-form" id="heroForm" autocomplete="off"><div class="hero-pill"><span class="hero-spark" aria-hidden="true">✨</span>' +
    '<input id="heroSay" name="say" type="text" enterkeyhint="send" placeholder="' + esc(t("hero.ph")) + '" aria-label="Hey Livo"></div>' +
    '<button type="button" class="hero-go" data-act="heroGo" aria-label="Hey Livo">' +
    '<svg class="i-mic" viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/></svg>' +
    '<svg class="i-send" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></form></div>';
}
// "Schon gewusst?" über der Liste: jeden Tag ein neuer Text, für alle am selben Tag derselbe (tips/<Sprache>.json).
// × schließt die Karte nur für heute (merkt sich nur dieser Browser). Die Texte kommen nach dem Öffnen, die App wartet nie darauf;
// klappt das Laden nicht, steht dort der bisherige Tipp. ?d= holt am neuen Tag auch neu ergänzte Texte.
var tipData = null, tipFailed = false, tipClosedOn = "";
try { tipClosedOn = localStorage.getItem("livo.tip2") || ""; } catch (e) {}
// Tag -> Text. Im ersten Durchlauf gilt die Reihenfolge der Datei, jeder weitere mischt neu; innerhalb eines Durchlaufs kommt kein Text doppelt.
function tipIndex(n, len) {
  var i = ((n % len) + len) % len, round = Math.floor(n / len);
  if (round <= 0) return i;
  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  var step = (round * 97 + 1) % len;
  while (gcd(step, len) !== 1) step = (step + 1) % len;
  return (i * step + round * 31) % len;
}
function tipText() {
  if (!tipData) return tipFailed ? t("tip.text") : "";
  var n = Math.round((fromISO(toISO(today())) - fromISO(tipData.start)) / 86400000);
  return tipData.tips[tipIndex(n, tipData.tips.length)];
}
function tipHTML() {
  var text = tipText();
  return !text || tipClosedOn === toISO(today()) ? "" : '<div class="tipbox"><span class="tipbox-ico" aria-hidden="true">' + ico("lightbulb") + '</span>' +
    '<div><b>' + esc(t("tip.title")) + '</b><small>' + esc(text) + '</small></div>' +
    '<button type="button" class="tipbox-x" data-act="tipClose" aria-label="' + esc(t("cancel")) + '">×</button></div>';
}
// Nur die Karte einsetzen, nicht alles neu aufbauen: Sonst ginge verloren, was gerade bei "Hey Livo" getippt wird.
function tipReady() {
  var list = document.getElementById("list");
  if (items.length && !list.querySelector(".loading, .offline, .tipbox")) list.insertAdjacentHTML("afterbegin", tipHTML());
}
function loadTip() {
  fetch("tips/" + LANG + ".json?d=" + toISO(today())).then(function (r) {
    if (!r.ok) throw new Error("tips");
    return r.json();
  }).then(function (d) {
    if (!d.start || !d.tips || !d.tips.length) throw new Error("tips");
    tipData = d;
  }).catch(function () { tipFailed = true; }).then(tipReady);
}
// Im Browser von Instagram/Facebook gibt es keine Erinnerungen (kein Push) - Hinweis, heylivo in Chrome bzw. Safari zu öffnen.
// Android: Knopf mit intent://-Link zu Chrome. iPhone: Anleitung über "⋯" (dort gibt es keinen Link, der Safari öffnet).
// Liegt schon etwas in diesem Browser (Fristen, Plus), zuerst Konto sichern - sonst bleibt es hier.
// Mit × für diese Sitzung aus. Ansehen ohne Instagram: ?demo=1&inapp=android bzw. ios
var UA = navigator.userAgent;
var IN_APP = params.get("inapp") ? "Instagram" : /Instagram/.test(UA) ? "Instagram" : /FBAN|FBAV|FB_IAB/.test(UA) ? "Facebook" : "";
var IN_APP_ANDROID = params.get("inapp") ? params.get("inapp") === "android" : /Android/.test(UA);
var inappClosed = false;
try { inappClosed = sessionStorage.getItem("livo.inapp") === "x"; } catch (e) {}
function chromeLink() {
  // Herkunft mitgeben (ref.js hat ?von= schon aus der Adresse genommen) - sonst zählt der Besuch in Chrome nicht mehr zur Werbung
  var q = new URLSearchParams(location.search), src = window.heylivoSource ? heylivoSource() : "";
  if (src && src !== "play" && !q.has("von")) q.set("von", src);
  var search = q.toString();
  var url = location.host + location.pathname + (search ? "?" + search : "");
  return "intent://" + url + "#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=" + encodeURIComponent("https://" + url) + ";end";
}
function inappHTML() {
  if (!IN_APP || inappClosed) return "";
  var keep = !DEMO && !userEmail && (items.length || isPlus());
  var after = keep ? '<small>' + t("inapp.secureFirst") + ' <button type="button" class="linkbtn" data-act="account">' + t("acc.secure") + '</button></small>'
    : userEmail ? '<small>' + t("inapp.signinThere", { email: "<b>" + esc(userEmail) + "</b>" }) + '</small>' : "";
  var how = IN_APP_ANDROID ? '<a class="btn inapp-btn" href="' + esc(chromeLink()) + '">' + t("inapp.btn") + '</a>'
    : '<small>' + t("inapp.ios") + '</small>';
  return '<div class="tipbox inapp"><span class="tipbox-ico" aria-hidden="true">' + ico("bell") + '</span>' +
    '<div><b>' + esc(t("inapp.title")) + '</b><small>' + t("inapp.text", { app: IN_APP }) + '</small>' + how + after + '</div>' +
    '<button type="button" class="tipbox-x" data-act="inappClose" aria-label="' + esc(t("cancel")) + '">×</button></div>';
}

// Eingabe im Kasten: Text verstehen lassen, ohne Text die Spracheingabe öffnen
function heroGo() {
  var input = document.getElementById("heroSay"), txt = input ? input.value.trim() : "";
  if (!canEdit()) return showPlus();
  if (!txt) return showVoice();
  input.value = "";
  input.closest(".hero-form").classList.remove("typed");
  understand(txt, false);
}
document.addEventListener("submit", function (e) { if (e.target.id === "heroForm") { e.preventDefault(); heroGo(); } });
document.addEventListener("input", function (e) {
  if (e.target.id === "heroSay") e.target.closest(".hero-form").classList.toggle("typed", !!e.target.value.trim());
});

// "Deine Fristen auf einen Blick": Karten für überfällig, in den nächsten 7 Tagen fällig und Tage bis zur nächsten Frist.
// Ist nichts überfällig und in den nächsten 7 Tagen nichts fällig, steht statt zweier Nullen grün "Alles im Griff!".
var TODAY_SVG = {
  late: '<path d="M12 6v7M12 17.5v.5"/>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  week: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  next: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
function todayHTML(all) {
  var late = 0, week = 0, next = null;
  all.forEach(function (it) {
    var d = status(it).days;
    if (d < 0) late++;
    else { if (d <= 7) week++; if (next === null || d < next) next = d; }
  });
  // big: die Zahl, bei "Alles im Griff!" die Überschrift (schon maskiert)
  function card(cls, icon, big, label, act) {
    return '<' + (act ? 'button type="button" data-act="' + act + '"' : 'div') + ' class="tcard ' + cls + '">' +
      '<span class="tico" aria-hidden="true"><svg viewBox="0 0 24 24">' + TODAY_SVG[icon] + '</svg></span>' +
      '<b class="tnum">' + big + '</b><span class="tlab">' + esc(label) + '</span></' + (act ? 'button' : 'div') + '>';
  }
  var cards = !late && !week ? card("t-good", "ok", esc(t("today.good")), t("today.goodText"), "") :
    card(late ? "t-late" : "t-ok", late ? "late" : "ok", late, t("today.late"), "") +
    card("t-week", "week", week, t("today.week"), week ? "todayWeek" : "");
  if (next !== null) cards += card("t-next", "next", next, next === 0 ? t("today.nextToday") : t("today.next"), "");
  return '<div class="todaybox"><div class="todaybox-head">' + ico("sun") + '<b>' + esc(t("today.title")) + '</b></div>' +
    '<div class="tstats">' + cards + '</div></div>';
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
  parts.push({ id: "cal", svg: "cal", html: esc(t("info.calText")) + ' <button type="button" class="linkbtn" data-act="calendar">Google, iPhone, Outlook</button>' });
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
    var ico = p.plus ? '<span class="plus-pill ' + p.plus + '">PLUS</span>'
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
    (PLAY ? "" : ' · <button type="button" class="linkbtn" data-act="plus">' + t("plus.extendShort") + '</button>') + '</p>';
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

// Bleibt die App über Mitternacht offen, stimmen das Datum neben "Alles im Blick" und "morgen fällig" beim nächsten Hinsehen wieder
var renderedDay = "";
document.addEventListener("visibilitychange", function () {
  if (!document.hidden && renderedDay && renderedDay !== fmt(new Date())) render();
});
function render() {
  renderedDay = fmt(new Date());
  var list = document.getElementById("list"), controls = document.getElementById("controls"), stat = document.getElementById("status");
  renderNote();
  document.getElementById("inapp").innerHTML = inappHTML();
  if (!items.length) { controls.innerHTML = stat.innerHTML = ""; list.innerHTML = emptyHTML(); return; }
  var all = sortedItems();
  var now = all.filter(function (it) { return status(it).key !== "later"; });
  var later = all.filter(function (it) { return status(it).key === "later"; });
  // Oben fest (wandert beim Scrollen nicht mit) ist nur "Hey Livo". Konto, Kalender, Erinnerungen und Plus/Testphase
  // stehen darunter als Symbole mit ausklappbarem Text und scrollen mit: fest oben belegten sie am Handy
  // mit großer Schrift mehr als den halben Bildschirm.
  controls.innerHTML = canEdit() ? voicebarHTML() : "";
  // Demo: nichts gespeichert, kein Konto, kein Plus - keine Symbole (zum Ansehen der Gestaltung: &icons=1,
  // dann auch die Glocke "Erinnern" wie bei ausgeschalteten Erinnerungen)
  if (DEMO && params.get("icons") && !pushState) pushState = "off";
  stat.innerHTML = DEMO && !params.get("icons") ? "" : infoHTML();
  var html = tipHTML() + todayHTML(all) + (now.length
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
  return '<div class="sec-row"><h2 class="sec">' + t("sec.later") + ' <span class="sec-date">' + fmt(new Date()) + '</span></h2><div class="filterrow">' + filter + yearBtnHTML() + '</div></div>' +
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
    // Zeitraum: jeder Tag vom ersten bis zum letzten
    if (it.end) {
      for (var x = fromISO(it.due), last = fromISO(it.end); x <= last && x <= to; x = addDays(x, 1)) {
        if (x >= from) (map[toISO(x)] = map[toISO(x)] || []).push(it);
      }
      return;
    }
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
  // Testphase vorbei, kein Plus: Kalender nur verschwommen, darüber die Zahl der kommenden Fristen und das
  // Plus-Angebot. Die Fristen selbst stehen weiter lesbar in der Liste (so versprochen in App und Mails).
  var locked = !canEdit(), upcoming = 0;
  if (locked) yearShift = 0;
  var start = addMonths(new Date(t0.getFullYear(), t0.getMonth(), 1), yearShift), end = addDays(addMonths(start, 12), -1);
  var occ = occurrences(start, end), hol = holidayMap(start.getFullYear(), end.getFullYear());
  var monthFmt = new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric" });
  var shortFmt = new Intl.DateTimeFormat(LOCALE, { month: "short", year: "numeric" });
  var wdFmt = new Intl.DateTimeFormat(LOCALE, { weekday: "narrow" });
  // Wochentage ab Montag (5.1.2026 ist ein Montag)
  var wds = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return '<span>' + esc(wdFmt.format(new Date(2026, 0, 5 + i))) + '</span>'; }).join("");
  var months = "", hasVac = false;
  for (var m = 0; m < 12; m++) {
    var first = addMonths(start, m), days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    var cells = "", count = 0, free = 0;
    for (var e = 0; e < (first.getDay() + 6) % 7; e++) cells += '<span></span>';
    for (var day = 1; day <= days; day++) {
      var iso = toISO(new Date(first.getFullYear(), first.getMonth(), day)), list = occ[iso] || [];
      // ein Zeitraum zählt einmal (an seinem ersten Tag im Monat), nicht an jedem Tag
      var counted = list.filter(function (it) { return !it.end || iso === it.due || day === 1; }).length;
      count += counted;
      if (iso >= todayIso) upcoming += counted;
      if (!list.length && iso >= todayIso) free++;
      // Urlaubstage (Zeitraum) sind keine Frist: eigene Farbe (lila), solange an dem Tag sonst nichts steht.
      // Sonst zählt der Rest: nur Termine mit Uhrzeit = teilweise belegt (hellblau), sonst ganztägig belegt (blau)
      var other = list.filter(function (it) { return !it.end; });
      var vac = list.length > 0 && !other.length;
      if (vac) hasVac = true;
      var partly = other.length && other.every(function (it) { return it.time; });
      // vergangene Urlaubstage sind nicht "überfällig"
      var late = iso < todayIso && other.length > 0;
      var cls = "yd" + (list.length ? (late ? " late" : vac ? " vac" : partly ? " part" : " due") : "") + (iso === todayIso ? " today" : "") + (iso < todayIso && !list.length ? " past" : "") + (hol[iso] ? " hol" : "");
      cells += '<button type="button" class="' + cls + '" data-act="yday" data-id="' + iso + '"' + (hol[iso] ? ' title="' + esc(hol[iso]) + '"' : "") + '>' + day + '</button>';
    }
    months += '<div class="ymonth"><h4>' + esc(monthFmt.format(first)) + '</h4>' +
      '<p class="ysum">' + (count ? t("year.count", { n: count }) + " · " : "") + t("year.free", { n: free }) + '</p>' +
      '<div class="ygrid ywd">' + wds + '</div><div class="ygrid">' + cells + '</div></div>';
  }
  var range = '<b>' + esc(shortFmt.format(start)) + ' – ' + esc(shortFmt.format(end)) + '</b>';
  openSheet('<h3>' + esc(t("year.title")) + '</h3>' +
    (locked ? '<div class="ynav"><span></span>' + range + '<span></span></div>'
      : '<div class="ynav"><button type="button" class="linkbtn plain" data-act="ynav" data-id="-12" aria-label="‹">‹</button>' + range +
        '<button type="button" class="linkbtn plain" data-act="ynav" data-id="12" aria-label="›">›</button></div>') +
    // Feiertage: Land wählbar (Standard = Land der App-Sprache), nicht im gesperrten Kalender
    (locked ? "" : '<label class="yholpick"><span>' + esc(t("year.holFor")) + '</span><select id="yhol">' +
      [["", t("year.holNone")]].concat(holidayCountries()).map(function (c) {
        return '<option value="' + c[0] + '"' + (c[0] === holidayCountry() ? " selected" : "") + '>' + esc(c[1]) + '</option>';
      }).join("") + '</select></label>') +
    // Punkt und Wort bleiben zusammen (sonst rutscht beim Umbruch z. B. der Ring von "heute" in die Zeile davor)
    '<p class="ylegend">' + [["due", "year.legendDue"], ["part", "year.legendPart"], ["late", "year.legendLate"], ["today", "year.legendToday"], ["", "year.legendFree"]].concat(hasVac ? [["vac", "year.legendVac"]] : [], HOLIDAYS[holidayCountry()] ? [["hol", "year.legendHol"]] : []).map(function (l) {
      return '<span class="ylg"><span class="yd ' + l[0] + '"></span>' + esc(t(l[1])) + '</span>';
    }).join("") + '</p>' +
    (locked
      ? '<div class="ylock"><div class="ymonths" inert aria-hidden="true">' + months + '</div>' +
        '<div class="ylockbox"><h4>' + ico("lock") + ' ' + esc(t("year.lockTitle")) + '</h4>' +
        '<p>' + (upcoming ? t("year.lockText", { c: t("year.count", { n: upcoming }) }) : esc(t("year.lockEmpty"))) + '</p>' +
        '<button type="button" class="btn" data-act="plus">' + esc(t("year.lockBtn")) + '</button></div></div>' +
        '<div class="ydetail" id="ydetail"><button type="button" class="btn light" data-act="close">OK</button></div>'
      : '<div class="ymonths">' + months + '</div>' +
        '<div class="ydetail" id="ydetail"><p class="muted">' + esc(t("year.hint")) + '</p>' +
        '<button type="button" class="btn light" data-act="close">OK</button></div>'));
  showYear.occ = occ;
  showYear.hol = hol;
  var pick = document.getElementById("yhol");
  if (pick) pick.addEventListener("change", function () { setHolidayCountry(pick.value); showYear(); });
}
// Freie Zeiten eines Tages zwischen 08:00 und 20:00: Termine mit Uhrzeit belegen ihre Zeit
// (ohne Endzeit eine Stunde), ganztägige Fristen belegen keine Uhrzeit. Lücken unter 15 Minuten zählen nicht.
var DAY_FROM = "08:00", DAY_TO = "20:00";
function minutes(hm) { return +hm.slice(0, 2) * 60 + +hm.slice(3, 5); }
function hhmm(m) { return pad(Math.floor(m / 60)) + ":" + pad(m % 60); }
function freeSlots(list) {
  var busy = list.filter(function (it) { return it.time; }).map(function (it) {
    var a = minutes(it.time), b = it.timeEnd ? minutes(it.timeEnd) : a + 60;
    return [a, Math.max(b, a + 1)];
  }).sort(function (x, y) { return x[0] - y[0]; });
  var free = [], at = minutes(DAY_FROM), end = minutes(DAY_TO);
  busy.forEach(function (b) {
    if (b[0] - at >= 15 && at < end) free.push([at, Math.min(b[0], end)]);
    at = Math.max(at, b[1]);
  });
  if (end - at >= 15) free.push([at, end]);
  return free.map(function (f) { return [hhmm(f[0]), hhmm(f[1])]; });
}
function showYearDay(iso) {
  var box = document.getElementById("ydetail"), list = (showYear.occ || {})[iso] || [];
  var timed = list.filter(function (it) { return it.time; }), slots = freeSlots(list);
  document.querySelectorAll(".yd.sel").forEach(function (b) { b.classList.remove("sel"); });
  var btn = document.querySelector('.yd[data-id="' + iso + '"]');
  if (btn) btn.classList.add("sel");
  var wd = new Intl.DateTimeFormat(LOCALE, { weekday: "long" }).format(fromISO(iso));
  var hol = (showYear.hol || {})[iso];
  box.innerHTML = '<p class="ydate"><b>' + esc(wd.charAt(0).toLocaleUpperCase(LOCALE) + wd.slice(1) + ", " + fmt(fromISO(iso))) + '</b></p>' +
    (hol ? '<p class="yhol">' + esc(t("year.holiday", { name: hol })) + '</p>' : "") +
    // Fristen des Tages nach Uhrzeit (ganztägige zuerst); "+ Frist an diesem Tag" an jedem Tag ab heute,
    // auch an belegten - ein Termin belegt nur seine Uhrzeit, nicht den ganzen Tag
    (list.length ? list.slice().sort(function (a, b) { return (a.time || "") < (b.time || "") ? -1 : (a.time || "") > (b.time || "") ? 1 : 0; }).map(card).join("")
      : '<p class="muted">' + esc(t("year.dayFree")) + '</p>') +
    // freie Zeiten nur an Tagen mit Terminen mit Uhrzeit (sonst ist der ganze Tag frei)
    (timed.length ? (slots.length
      ? '<ul class="yslots">' + slots.map(function (f) { return '<li>' + esc(t("year.freeSlot", { from: f[0], to: f[1] })) + '</li>'; }).join("") + '</ul>'
      : '<p class="muted">' + esc(t("year.noSlot", { from: DAY_FROM, to: DAY_TO })) + '</p>') : "") +
    (canEdit() && iso >= toISO(today()) ? '<button type="button" class="btn" data-act="yadd" data-id="' + iso + '" data-time="' + (timed.length && slots.length ? slots[0][0] : "") + '">' + esc(t("year.add")) + '</button>' : "") +
    '<button type="button" class="btn light" data-act="close">OK</button>';
}
// Neue eigene Frist mit dem gewählten Tag als Datum
// "+ Frist an diesem Tag": erst die ganze Auswahl, die gewählte Vorlage bekommt dann den Tag (und an einem
// Tag mit Terminen die erste freie Uhrzeit). Gilt, bis das Fenster geschlossen wird.
var dayPick = null;
function addOnDay(iso, time) {
  showPicker();
  dayPick = { iso: iso, time: time || "" };
}
// Den gewählten Tag nur eintragen, wo das Datumsfeld wirklich der Fälligkeitstag ist
// (nicht bei Vertragsbeginn, letzter Kontrolle, Abreise …) - geprüft mit der Rechnung der Vorlage selbst
function prefillDay(tp, form) {
  var p = dayPick, v = {};
  tp.fields.forEach(function (f) { v[f.key] = f.type === "date" ? p.iso : f.value != null ? String(f.value) : ""; });
  var dateField = tp.fields.filter(function (f) { return f.type === "date"; })[0], r = null;
  try { r = dateField && tp.compute(v); } catch (e) { r = null; }
  if (r && r.due && toISO(r.due) === p.iso) form.elements[dateField.key].value = p.iso;
  if (p.time) form.elements.time.value = p.time;
  Array.prototype.forEach.call(form.elements, function (el) {
    if (el.name) ["input", "change"].forEach(function (ev) { el.dispatchEvent(new Event(ev, { bubbles: true })); });
  });
}

function setFilter(f) {
  listFilter = FILTER_DAYS[f] != null ? f : "all";
  try { localStorage.setItem("livo.filter", listFilter); } catch (e) {}
  render();
}
function card(it) {
  var s = status(it);
  // Auf jeder Karte das Fälligkeitsdatum mit Uhrzeit (die Erinnerung steht in der Frist selbst)
  var sub = it.end ? dueText(it) : t("card.due", { x: dueText(it) });
  if (it.tpl === "meine" && MY_CAT.cat) sub = MY_CAT.cat + " · " + sub; // eigene Kategorie, z. B. "George Kalender"
  return '<button type="button" class="card st-' + s.key + '" data-open="' + it.id + '">' +
    icoBox(it) +
    '<span class="txt"><b>' + esc(it.title) + '</b><small>' + esc(sub) + '</small></span>' +
    '<span class="pill">' + esc(pillText(s)) + '</span><span class="chev" aria-hidden="true">›</span></button>';
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
  dayPick = null;
  sheet.hidden = true;
  sheetBg.hidden = true;
  document.body.classList.remove("lock");
}

function showPicker() {
  var html = '<h3>' + t("picker.title") + '</h3>' +
    '<button type="button" class="btn light" data-act="voice">' + ico("mic") + " " + t("picker.voice") + '</button>';
  var visible = visibleTemplates();
  function tplBtn(tp) { return '<button type="button" class="tpl" data-tpl="' + tp.id + '">' + esc(tplTitle(tp)) + '</button>'; }
  function catHead(c) {
    return '<div class="cat">' + catIco(c) + " " + esc(catName(c)) +
      (c.id === "mine" ? ' <button type="button" class="catedit" data-act="mycat" aria-label="' + esc(t("mycat.rename")) + '" title="' + esc(t("mycat.rename")) + '">' + ico("pencil") + '</button>' : "") + '</div>';
  }
  CATEGORIES.forEach(function (c) {
    var list = visible.filter(function (tp) { return tp.cat === c.id || tp.also === c.id; });
    if (!list.length || c.id === "mine") return;
    if (c.id === "own") {
      // "Eigene" und die eigene Kategorie nebeneinander: links "Eigene Frist", rechts z. B. "George" (Stern) mit ihrer
      // Unterkategorie - Überschriften und Knöpfe je auf einer Linie. Noch keine eigene Kategorie: rechts "+ anlegen"
      var mine = find(CATEGORIES, "mine"), mineTpl = find(TEMPLATES, "meine");
      html += MY_CAT.cat
        ? '<div class="tpls catpair">' + catHead(c) + catHead(mine) + tplBtn(list[0]) + tplBtn(mineTpl) + '</div>'
        : catHead(c) + '<div class="tpls">' + tplBtn(list[0]) + '<button type="button" class="tpl newcat" data-act="mycat">+ ' + esc(t("mycat.new")) + '</button></div>';
      return;
    }
    html += catHead(c) + '<div class="tpls">' + list.map(tplBtn).join("") + '</div>';
  });
  openSheet(html + '<button type="button" class="btn light" data-act="close">' + t("cancel") + '</button>');
}

// Eigene Kategorie anlegen oder umbenennen: genau eine Kategorie mit einer Unterkategorie
function showMyCat() {
  openSheet('<h3>' + ico("star") + ' ' + t(MY_CAT.cat ? "mycat.rename" : "mycat.new") + '</h3><form id="frm" novalidate>' +
    '<p class="hint">' + esc(t("mycat.hint")) + '</p>' +
    '<label class="field"><span>' + t("mycat.cat") + '</span><input name="cat" maxlength="40" value="' + esc(MY_CAT.cat) + '" placeholder="' + esc(t("mycat.catPh")) + '"></label>' +
    '<label class="field"><span>' + t("mycat.sub") + '</span><input name="sub" maxlength="40" value="' + esc(MY_CAT.sub) + '" placeholder="' + esc(t("mycat.subPh")) + '"></label>' +
    '<p class="err" id="err"></p>' +
    '<button class="btn" type="submit">' + t("save") + '</button>' +
    '<button class="btn light" type="button" data-act="add">' + t("back") + '</button></form>');
  var form = document.getElementById("frm");
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var cat = form.elements.cat.value.trim().slice(0, 40), sub = form.elements.sub.value.trim().slice(0, 40);
    if (!cat || !sub) { document.getElementById("err").textContent = t("mycat.err"); return; }
    var btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      await saveMyCat(cat, sub);
    } catch (err) {
      btn.disabled = false;
      document.getElementById("err").textContent = t("err.save");
      return;
    }
    render(); // Karten zeigen den neuen Namen
    showPicker();
    toast(t("saved.plain"));
  });
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
  openSheet('<h3>' + ico("mic") + ' Hey Livo</h3>' +
    '<p class="muted">' + esc(t("voice.intro")) + '</p>' +
    (Recognition
      ? '<button type="button" class="mic" id="micBtn" aria-label="' + esc(t("voice.speak")) + '">' + ico("mic") + '</button>'
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
// Freiwillige Notiz zu jeder Frist. Bleibt in der App: nicht in Erinnerungen, Teilen-Links und Kalender.
function noteHTML(note) {
  return '<label class="field"><span>' + t("form.note") + opt() + '</span><textarea name="note" rows="2" maxlength="' + NOTE_MAX + '" placeholder="' + esc(t("form.notePh")) + '">' + esc(note || "") + '</textarea></label>';
}
// Eigenes Textfeld statt type="time": Die Android-Uhrzeitauswahl versteckt bei Samsung im
// Tastatur-Modus den Knopf "Set". Man tippt "2030" auf der Zahlentastatur, daraus wird 20:30.
function timeHTML(time, remindMin, timeEnd) {
  var selected = remindMin == null ? SOON_DEFAULT : remindMin;
  return '<label class="field"><span>' + t("form.time") + opt() + '</span><input name="time" type="text" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="' + esc(t("form.timePh")) + '" value="' + esc(time || "") + '"></label>' +
    // Endzeit ("bis"), erscheint erst mit einer Uhrzeit
    '<label class="field" id="timeEndField"' + (time ? "" : " hidden") + '><span>' + t("form.timeEnd") + opt() + '</span><input name="timeEnd" type="text" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="' + esc(t("form.timeEndPh")) + '" value="' + esc(timeEnd || "") + '"></label>' +
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
  [input, form.elements.timeEnd].forEach(function (el) {
    if (!el) return;
    el.addEventListener("input", function () {
      // Nach vier Ziffern gleich den Doppelpunkt setzen
      if (/^\d{4}$/.test(el.value) && parseTime(el.value)) el.value = parseTime(el.value);
      document.getElementById("soonField").hidden = !input.value.trim();
      document.getElementById("timeEndField").hidden = !input.value.trim();
    });
    el.addEventListener("blur", function () {
      var v = parseTime(el.value);
      if (v) el.value = v;
    });
  });
}
// Endzeit aus dem Formular: "" (keine), "HH:MM" oder null (mit Fehlermeldung) - muss nach der Uhrzeit liegen
function readTimeEnd(form) {
  var start = parseTime(form.elements.time.value), el = form.elements.timeEnd;
  if (!start || !el) return "";
  var v = parseTime(el.value);
  if (v === "") return "";
  if (v === null) { document.getElementById("err").textContent = t("form.errTime"); return null; }
  if (v <= start) { document.getElementById("err").textContent = t("form.errTimeEnd"); return null; }
  return v;
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

/* ---------- Überschneidung: zur selben Zeit steht schon etwas ---------- */
// Andere Fristen mit Uhrzeit am selben Tag, deren Zeiten sich überschneiden (ohne Endzeit zählt 1 Stunde).
// Wiederholungen in Tagen (jeden Tag, jede Woche …) zählen an jedem ihrer Tage. Nur ein Hinweis, speichern geht trotzdem.
function minutesOf(hm) { return parseInt(hm.slice(0, 2), 10) * 60 + parseInt(hm.slice(3, 5), 10); }
function onDay(o, day) {
  if (o.due === day) return true;
  if (!(o.everyDays > 0) || o.end) return false;
  var diff = Math.round((fromISO(day) - fromISO(o.due)) / 86400000);
  return diff > 0 && diff % o.everyDays === 0;
}
function clashHTML(it) {
  if (!it || !it.time || !it.due || it.end) return "";
  var a = minutesOf(it.time), b = it.timeEnd ? minutesOf(it.timeEnd) : a + 60;
  if (b <= a) b = a + 60;
  var list = items.filter(function (o) {
    if (o.id === it.id || !o.time || !onDay(o, it.due)) return false;
    var c = minutesOf(o.time), d = o.timeEnd ? minutesOf(o.timeEnd) : c + 60;
    return a < d && c < b;
  });
  if (!list.length) return "";
  return '<p class="clash">' + esc(t("clash", { list: list.map(function (o) { return quote(o.title) + " (" + o.time + ")"; }).join(", ") })) + '</p>';
}
// Bestätigen und Bearbeiten: Hinweis beim Tippen aktualisieren
function wireClash(form, base) {
  function update() {
    var end = parseTime(form.elements.timeEnd.value);
    document.getElementById("clash").innerHTML = clashHTML({
      id: base.id, due: form.elements.due.value, end: form.elements.end ? form.elements.end.value : "",
      time: parseTime(form.elements.time.value) || "", timeEnd: end || ""
    });
  }
  form.addEventListener("input", update);
  update();
}

function itemFormHTML(it, opts) {
  return '<form id="frm" novalidate>' + (opts.intro || "") +
    '<label class="field"><span>' + t("form.what") + '</span><input name="title" type="text" value="' + esc(it.title) + '"></label>' +
    '<label class="field"><span>' + (it.end ? t("form.from") : opts.dateLabel || t("form.due")) + '</span><input name="due" type="date" value="' + esc(it.due) + '"></label>' +
    // Zeitraum: letzter Tag statt Uhrzeit
    (it.end ? '<label class="field"><span>' + t("form.until") + '</span><input name="end" type="date" value="' + esc(it.end) + '"></label>' : "") +
    noteHTML(it.note) +
    (it.end ? '<div hidden>' + timeHTML("", undefined) + '</div>' : timeHTML(it.time, it.remindMin, it.timeEnd)) +
    // ein Zeitraum wiederholt sich nicht (beim Erledigen würde sonst nur der erste Tag weiterrücken)
    (it.end ? '<div hidden>' + repeatHTML(it) + '</div>' : repeatHTML(it)) +
    leadHTML(it.lead) +
    '<div id="clash"></div><p class="err" id="err"></p><button class="btn" type="submit">' + t("save") + '</button>' + (opts.back || "") + '</form>';
}
// Liest das Formular in "it" ein; false, wenn Titel oder Datum fehlen
function readItemForm(form, it) {
  var title = form.elements.title.value.trim(), due = form.elements.due.value;
  if (!title || !due || !isDate(fromISO(due))) {
    document.getElementById("err").textContent = t("form.err");
    return false;
  }
  var end = form.elements.end ? form.elements.end.value : "";
  if (form.elements.end && (!end || !isDate(fromISO(end)) || end < due)) {
    document.getElementById("err").textContent = t("form.errUntil");
    return false;
  }
  var time = readTime(form);
  if (time === null) return false;
  var timeEnd = readTimeEnd(form);
  if (timeEnd === null) return false;
  var rep = readRepeat(form);
  if (!rep) return false;
  it.title = title;
  it.due = due;
  if (end) it.end = end;
  it.time = time;
  it.timeEnd = time ? timeEnd : "";
  it.remindMin = readSoon(form);
  it.every = rep.every;
  it.everyDays = rep.everyDays;
  it.lead = readLead(form, it.lead);
  it.note = form.elements.note.value.trim();
  return true;
}

function showDraft(d, said) {
  var tp = find(TEMPLATES, d.tpl), hint = tplHint(tp);
  openSheet('<h3>' + catIco(find(CATEGORIES, tp.cat)) + ' ' + t("draft.title") + '</h3>' +
    '<p class="said">' + esc(quote(said)) + '</p>' +
    itemFormHTML(d, {
      intro: (d.due ? "" : '<p class="err">' + t("draft.noDate") + '</p>') + (hint ? '<p class="hint">' + esc(hint) + '</p>' : ""),
      back: '<button class="btn light" type="button" data-act="voice">' + t("draft.again") + '</button>'
    }));
  var form = document.getElementById("frm");
  wireTime(form);
  wireRepeat(form);
  wireClash(form, d);
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!readItemForm(form, d)) return;
    saving(form, addItem(d), t("saved", { x: remindText(d) }), true);
  });
}

// Wartet auf das Speichern; bei Erfolg Blatt zu, sonst Fehler im Formular.
// share: neue Frist - die Meldung bekommt den Knopf "Teilen" (WhatsApp, Viber …)
// what: Ziel, Name usw. aus dem Formular der Vorlage (für den Titel eines Vorschlags)
async function saving(form, promise, okText, share, what) {
  var btn = form.querySelector("[type=submit]");
  btn.disabled = true;
  btn.textContent = t("saving");
  try {
    var saved = await promise;
    // Neue Frist: passt ein nächster Schritt dazu, fragt Livo gleich nach ("Livo denkt mit").
    // Ein Fehler dabei darf das Speichern nicht als gescheitert melden.
    var next = [];
    try { if (share && saved) next = followFor(saved, what); } catch (e) { next = []; }
    render();
    if (next.length) return showFollow(saved, next, okText);
    closeSheet();
    toast(okText, share && saved ? saved.id : "");
  } catch (err) {
    document.getElementById("err").textContent = errText(err);
    btn.disabled = false;
    btn.textContent = t("save");
  }
}

/* ---------- Livo denkt mit: Vorschläge nach dem Speichern ---------- */
// Nach einer neuen Frist aus diesen Vorlagen schlägt Livo den nächsten Schritt vor:
// gift / checkin = eine zweite Frist zum Antippen, doc = Reisepass oder Ausweis eintragen
// (nur, solange noch keiner eingetragen ist). Nicht beim Bearbeiten, Erneuern oder bei geteilten Fristen.
var FOLLOW = { geburtstag: ["gift"], hochzeitstag: ["gift"], reise: ["checkin", "doc"] };
var GIFT_DAYS = 5;    // das Geschenk ist 5 Tage vor dem Tag fällig (Erinnerung: lead der Vorlage davor)
var followNow = null; // { item, list, ok } - die gerade gezeigten Vorschläge
function followFor(it, what) {
  var out = [];
  (FOLLOW[it.tpl] || []).forEach(function (key) {
    if (key === "doc") {
      if (!items.some(function (x) { return x.tpl === "reisepass" || x.tpl === "personalausweis" || x.tpl === "kinderpass"; })) out.push({ key: key });
      return;
    }
    var f = followItem(key, it, what);
    if (f) out.push({ key: key, item: f });
  });
  return out;
}
// Die vorgeschlagene Frist - oder null, wenn ihr Tag schon vorbei ist oder es sie schon gibt
function followItem(key, it, what) {
  var tp = find(TEMPLATES, key === "gift" ? "geschenk" : "checkin"), f;
  if (key === "gift") {
    if (it.everyDays) return null; // nur zu jährlichen oder einmaligen Tagen
    f = { title: tplName(tp, { what: it.title }), due: toISO(addDays(fromISO(it.due), -GIFT_DAYS)), every: it.every || 0 };
  } else {
    // Aus Hey Livo kommt nur der Titel; ohne Ziel ("Reise / Urlaub") heißt es einfach "Online-Check-in"
    if (what == null) what = it.title === tplName(find(TEMPLATES, it.tpl), {}) ? "" : it.title;
    f = { title: tplName(tp, { what: what }), due: it.due, every: 0 };
  }
  f.tpl = tp.id; f.lead = tp.lead; f.everyDays = 0; f.time = ""; f.from = "due"; f.renew = false; f.note = "";
  if (f.due < toISO(today())) return null;
  if (items.some(function (x) { return x.tpl === f.tpl && (x.due === f.due || x.title === f.title); })) return null;
  return f;
}
function followCardHTML(s, i) {
  if (s.key === "doc") {
    return '<div class="fcard"><p>' + esc(t("follow.doc")) + '</p><div class="fbtns">' +
      ["reisepass", "personalausweis"].map(function (id) {
        return '<button type="button" class="btn light" data-act="followTpl" data-id="' + id + '">+ ' + esc(tplTitle(find(TEMPLATES, id))) + '</button>';
      }).join("") + '</div></div>';
  }
  var f = s.item;
  return '<div class="fcard"><p>' + esc(t("follow." + s.key)) + '</p>' +
    '<div class="fitem">' + icoBox(f) + '<div><b>' + esc(f.title) + '</b><small>' +
    t("preview", { due: esc(dueText(f)), remind: esc(remindText(f)), every: esc(everyText(f)) }) + '</small></div></div>' +
    '<button type="button" class="btn" data-act="follow" data-id="' + i + '">' + t("follow.add") + '</button></div>';
}
function showFollow(it, list, okText) {
  followNow = { item: it, list: list, ok: okText };
  document.getElementById("toast").hidden = true; // eine alte Meldung darf die Vorschläge nicht verdecken
  openSheet('<h3>' + t("saved.plain") + '</h3>' +
    '<p class="fsaved">' + esc(it.title) + " · " + esc(t("dl.remind")) + " " + esc(remindText(it)) + '</p>' +
    '<div class="follow-head">' + ico("lightbulb") + ' ' + esc(t("follow.head")) + '</div>' +
    list.map(followCardHTML).join("") +
    '<button type="button" class="btn light" data-act="followDone">' + t("follow.done") + '</button>');
}
async function addFollow(btn, i) {
  var s = followNow && followNow.list[+i];
  if (!s || !s.item || s.added) return;
  btn.disabled = true;
  try { await addItem(s.item); } catch (e) { btn.disabled = false; toast(errText(e)); return; }
  s.added = true;
  btn.outerHTML = '<p class="fdone">' + t("follow.added") + '</p>';
  render();
}
function followDone() {
  var f = followNow;
  followNow = null;
  closeSheet();
  if (f) toast(f.ok, f.item.id);
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
  } else if (f.type === "months" || f.type === "days") {
    input = '<input name="' + f.key + '" type="number" min="1" max="' + (f.type === "days" ? 365 : 120) + '" inputmode="numeric" value="' + esc(v) + '">';
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
  // Zeitraum: der letzte Tag darf nicht vor dem ersten liegen
  if (r.end && (!isDate(r.end) || r.end < r.due)) return null;
  return { tpl: tp.id, title: tplName(tp, v), due: toISO(r.due), end: r.end ? toISO(r.end) : "", time: "", every: r.every || 0, everyDays: r.everyDays || 0, from: tp.from || "due", lead: lead, renew: !!tp.renew };
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
  openSheet('<h3>' + catIco(find(CATEGORIES, tp.cat)) + " " + esc(tplTitle(tp)) + '</h3><form id="frm" novalidate>' +
    (hint ? '<p class="hint">' + esc(hint) + '</p>' : "") + guideLinkHTML(tp) +
    tp.fields.map(function (f) { return fieldHTML(tp, f); }).join("") +
    noteHTML("") +
    // Zeitraum (Urlaubstage): ganze Tage, keine Uhrzeit
    (tp.range ? '<div hidden>' + timeHTML("", undefined) + '</div>' : timeHTML("", undefined)) +
    leadHTML(tp.lead) +
    '<div class="preview" id="pv"></div><div id="clash"></div><p class="err" id="err"></p>' +
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
      var end = parseTime(form.elements.timeEnd.value);
      it.timeEnd = it.time && end && end > it.time ? end : "";
      it.remindMin = readSoon(form);
      it.note = form.elements.note.value.trim();
    }
    return it;
  }
  function update() {
    var it = current();
    var pv = it ? t("preview", { due: esc(dueText(it)), remind: esc(remindText(it)), every: esc(everyText(it)) }) : t("preview.empty");
    // Zeitraum: "Zeitraum 21.12. – 06.01. …" statt "Fällig am …"
    if (it && it.end) pv = esc(t("dl.range")) + " " + pv.slice(pv.indexOf("<b>"));
    document.getElementById("pv").innerHTML = pv;
    document.getElementById("clash").innerHTML = clashHTML(it);
  }
  form.addEventListener("input", update);
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (form.elements.everyN && !readRepeat(form)) return;
    var it = current();
    if (!it) { document.getElementById("err").textContent = t("form.errFields"); return; }
    if (readTime(form) === null || readTimeEnd(form) === null) return;
    var v = readValues(form, tp);
    saving(form, addItem(it), t("saved", { x: remindText(it) }), true, v.what || v.who || "");
  });
  if (dayPick) prefillDay(tp, form);
  update();
}

/* ---------- Eine Frist ansehen, erledigen, bearbeiten ---------- */
function showItem(id) {
  var it = find(items, id);
  if (!it) return;
  var s = status(it), tp = find(TEMPLATES, it.tpl), hint = tp ? tplHint(tp) : "";
  var main = repeats(it) ? t("done.next") : it.renew ? t("done.renew") : t("done");
  openSheet('<div class="st-' + s.key + '"><div class="d-head">' + icoBox(it) + '<div><h3>' + esc(it.title) + '</h3>' +
    '<span class="pill">' + esc(pillText(s)) + '</span></div></div>' +
    '<dl><dt>' + t(it.end ? "dl.range" : "dl.due") + '</dt><dd>' + esc(dueText(it)) + '</dd>' +
    '<dt>' + t("dl.remind") + '</dt><dd>' + esc(it.lead ? t("dl.remindVal", { n: it.lead, x: remindText(it) }) : t("dl.remindDay") + " (" + remindText(it) + ")") + '</dd>' +
    lastHTML(it) +
    (it.time && it.remindMin ? '<dt>' + t("dl.soon") + '</dt><dd>' + esc(soonText(it.remindMin)) + '</dd>' : "") +
    '<dt>' + t("dl.every") + '</dt><dd>' + esc(everyText(it)) + '</dd>' +
    (it.note ? '<dt>' + t("form.note") + '</dt><dd class="dd-note">' + esc(it.note) + '</dd>' : "") + '</dl>' +
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
  wireClash(form, it);
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

// Eine Frist teilen: WhatsApp, Viber oder das Teilen-Menü des Geräts (SMS, Mail …).
// Jeder darf teilen, auch nach der Testphase - jeder Link ist kostenlose Werbung.
// Der Link trägt die Frist selbst (?add=Titel&d=Datum …, nichts wird gespeichert); wer ihn antippt,
// übernimmt sie mit einem Tipp (showIncoming). von=whatsapp | viber | teilen landet im Wochenbericht.
function shareLink(it, via) {
  var q = "add=" + encodeURIComponent(it.title) + "&d=" + it.due;
  if (it.time) q += "&h=" + it.time + (it.timeEnd ? "&he=" + it.timeEnd : "") + (it.remindMin ? "&s=" + it.remindMin : "");
  if (it.every) q += "&rm=" + it.every;
  if (it.everyDays) q += "&rd=" + it.everyDays;
  if (it.renew) q += "&nv=1";
  return "https://heylivo.com/app/?" + q + "&l=" + it.lead + (it.tpl && it.tpl !== "eigene" && it.tpl !== "meine" ? "&tpl=" + it.tpl : "") + "&von=" + via;
}
function shareText(it, via) {
  return "📅 " + it.title + " – " + t("card.due", { x: dueText(it) }) + "\n\n" + t("share.save") + "\n" + shareLink(it, via);
}
function showShare(id) {
  var it = find(items, id);
  if (!it) return;
  document.getElementById("toast").hidden = true; // auch aus der Meldung nach dem Speichern
  openSheet('<h3>' + t("share.title") + '</h3>' +
    '<p class="hint">' + esc(t("share.text")) + '</p>' +
    '<a class="btn wa" href="https://wa.me/?text=' + encodeURIComponent(shareText(it, "whatsapp")) + '" target="_blank" rel="noopener">WhatsApp</a>' +
    '<a class="btn viber" href="viber://forward?text=' + encodeURIComponent(shareText(it, "viber")) + '">Viber</a>' +
    '<button type="button" class="btn light" data-act="shareOther" data-id="' + it.id + '">' + t("share.other") + '</button>' +
    '<button class="btn light" type="button" data-open="' + it.id + '">' + t("back") + '</button>');
}
async function shareItem(id) {
  var it = find(items, id);
  if (!it) return;
  var text = shareText(it, "teilen");
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

/* ---------- Geteilte Frist übernehmen (Link aus WhatsApp, Viber …) ---------- */
// Alles kommt aus dem Link - deshalb jeden Wert prüfen; die Datenbank prüft beim Speichern noch einmal.
var incoming = null;
function readIncoming() {
  function g(k) { return params.get(k) || ""; }
  function num(k, max) { var n = parseInt(g(k), 10); return n > 0 && n <= max ? n : 0; }
  function hm(k) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(g(k)) ? g(k) : ""; }
  history.replaceState(null, "", location.pathname); // ein Neuladen fragt nicht noch einmal
  var title = g("add").trim().slice(0, 120), due = g("d"), time = hm("h");
  if (!title || !/^\d{4}-\d\d-\d\d$/.test(due) || toISO(fromISO(due)) !== due) return null;
  var lead = parseInt(g("l"), 10), it = {
    tpl: find(TEMPLATES, g("tpl")) ? g("tpl") : "eigene", title: title, due: due, time: time,
    timeEnd: time && hm("he") > time ? hm("he") : "", every: num("rm", 240), everyDays: num("rd", 3650), from: "due",
    lead: lead >= 0 && lead <= 365 ? lead : 14, renew: g("nv") === "1", remindMin: time ? num("s", 1440) : 0
  };
  if (it.every && it.everyDays) it.everyDays = 0;
  // Wiederholt sich die Frist und liegt schon zurück: der nächste Termin ab heute
  if (repeats(it)) { var d = fromISO(due); while (d < today()) d = nextRepeat(d, it); it.due = toISO(d); }
  return it;
}
function showIncoming(it) {
  incoming = it;
  if (!it) return;
  var have = items.some(function (x) { return x.title === it.title && x.due === it.due && (x.time || "") === it.time; });
  var past = it.due < toISO(today());
  openSheet('<p class="muted">' + esc(t("in.title")) + '</p>' +
    '<div class="d-head">' + icoBox(it) + '<div><h3>' + esc(it.title) + '</h3></div></div>' +
    '<dl><dt>' + t("dl.due") + '</dt><dd>' + esc(dueText(it)) + '</dd>' +
    (past ? "" : '<dt>' + t("dl.remind") + '</dt><dd>' + esc(t("dl.remindVal", { n: it.lead, x: remindText(it) })) + '</dd>') +
    (repeats(it) ? '<dt>' + t("dl.every") + '</dt><dd>' + esc(everyText(it)) + '</dd>' : "") + '</dl>' +
    (past || have
      ? '<p class="hint">' + esc(t(past ? "in.past" : "in.have")) + '</p><button type="button" class="btn" data-act="close">OK</button>'
      : '<button type="button" class="btn" data-act="inAdd">' + t("in.btn") + '</button>' +
        '<button type="button" class="btn light" data-act="close">' + t("in.no") + '</button>'));
}
async function addIncoming(btn) {
  var it = incoming;
  if (!it) return;
  if (!canEdit()) return showPlus();
  btn.disabled = true;
  try { await addItem(it); } catch (e) { btn.disabled = false; toast(errText(e)); return; }
  incoming = null;
  render();
  if (pushState !== "off") { closeSheet(); return toast(t("saved", { x: remindText(it) })); }
  // Erinnerungen sind noch aus: gleich hier einschalten lassen, sonst meldet sich Livo nie
  openSheet('<h3>' + t("saved.plain") + '</h3><p class="hint">' + esc(t("in.push")) + '</p>' +
    '<button type="button" class="btn" data-act="push">' + t("push.card") + '</button>' +
    '<button type="button" class="btn light" data-act="close">' + t("gift.later") + '</button>');
}

/* ---------- Kalender-Abo (Livo Plus, Edge Function "calendar") ---------- */
// Ein geheimer Link pro Konto; Google, Apple und Outlook holen darüber die Fristen ab.
// Im Demo zeigen die Knöpfe auf den Beispiel-Kalender.
var calFeedUrl = "";
function calendarHTML() {
  return '<div class="calbox" id="calBox"><h4>' + ico("calendar") + ' ' + esc(t("cal.title")) + '</h4>' +
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
  var buyUrl = PLUS_LINK && userId && !DEMO && !PLAY
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
      : PLAY && isPlus() ? "" // in der Play-App: kein Kauf, mit Plus auch kein "kommt bald"
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

/* ---------- Gratis-Aktion: Livo Plus geschenkt (Link ?gift=<Code> aus der Instagram-DM) ---------- */
// Ein Tipp schaltet Plus für ein Jahr frei - Datenbank-Funktion redeem_gift (0015), ohne Stripe und ohne Preis.
// Danach der Hinweis, das Konto zu sichern: sonst hängt das Geschenk nur an diesem Browser
// (bei Instagram oft der eingebaute Browser der App).
var giftCode = "";
var giftPending = false; // "Erste Frist eintragen" im Geschenk-Fenster: nach der nächsten neuen Frist einlösen
// Beim Öffnen des Links: Wer noch keine Frist hat, trägt erst eine ein - dann kommt das Geschenk von selbst.
// Messung 11.11.: Aus ~100 Besuchern der Gratis-Werbung hat niemand eine Frist angelegt, nur 3 haben eingelöst.
// Im Browser von Facebook/Instagram auf Android zuerst nach Chrome (dort gibt es Erinnerungen; Code und Herkunft
// gehen im Link mit). "Ohne Frist einlösen" bleibt - die Teilnahmebedingungen versprechen einen Tipp.
// Ansehen: ?demo=1&empty=1&gift=X bzw. zusätzlich &inapp=android
function showGiftStart() {
  if (IN_APP && IN_APP_ANDROID && !inappClosed) return showGiftChrome();
  if (!items.length) return showGiftWait();
  showGift();
}
function showGiftChrome() {
  openSheet('<h3>' + t("gift.wait") + '</h3>' +
    '<p class="hint">' + t("gift.chrome") + '</p>' +
    '<a class="btn" href="' + esc(chromeLink()) + '">' + t("inapp.btn") + '</a>' +
    '<button type="button" class="btn light" data-act="giftHere">' + t("gift.here") + '</button>');
}
function showGiftWait() {
  openSheet('<h3>' + t("gift.wait") + '</h3>' +
    '<p class="hint">' + t("gift.waitText") + '</p>' +
    '<button type="button" class="btn" data-act="giftFirst">' + t("gift.first") + '</button>' +
    '<p class="legal"><button type="button" class="linkbtn" data-act="giftRedeem">' + t("gift.direct") + '</button> · ' +
    '<a href="' + (LANG === "de" ? "../aktion" : "../en/giveaway") + '" target="_blank" rel="noopener">' + t("gift.terms") + '</a></p>' +
    '<button type="button" class="btn light" data-act="close">' + t("gift.later") + '</button>');
}
function showGift(msg) {
  openSheet('<h3>' + t("gift.title") + '</h3>' +
    '<p class="hint">' + t("gift.text") + '</p>' +
    (msg ? '<p class="err">' + esc(msg) + '</p>' : "") +
    '<button type="button" class="btn" data-act="giftRedeem">' + t("gift.btn") + '</button>' +
    '<p class="legal"><a href="' + (LANG === "de" ? "../aktion" : "../en/giveaway") + '" target="_blank" rel="noopener">' + t("gift.terms") + '</a></p>' +
    '<button type="button" class="btn light" data-act="close">' + t("gift.later") + '</button>');
}
function showGiftDone(already) {
  // Noch keine Frist: Zuerst dorthin führen, ohne Frist bringt das Gratis-Jahr nichts (Wochenbericht 09.11.: 15 Besucher aus der Werbung, keine Frist).
  // "Konto sichern" bleibt direkt darunter, der Hinweis dazu steht danach weiter in der Leiste unter "Konto".
  var first = !items.length;
  openSheet('<h3>' + (already ? t("gift.already") : t("gift.title")) + '</h3>' +
    (plusUntil ? '<p class="hint">' + t("gift.done", { date: fmt(fromISO(plusUntil)) }) + '</p>' : "") +
    (first ? '<button type="button" class="btn" data-act="add">' + t("gift.first") + '</button>' : "") +
    (userEmail
      ? '<button type="button" class="btn' + (first ? " light" : "") + '" data-act="close">' + (first ? t("gift.later") : "OK") + '</button>'
      : '<p class="muted">' + t("gift.secure") + '</p>' +
        '<button type="button" class="btn' + (first ? " light" : "") + '" data-act="account">' + t("acc.secure") + '</button>' +
        '<button type="button" class="btn light" data-act="close">' + t("gift.later") + '</button>'));
}
// Antwort von redeem_gift, oder null bei einem Netzfehler
async function redeemCode() {
  if (DEMO) return { ok: true, plus_until: toISO(addMonths(today(), 12)) };
  var r = await sb.rpc("redeem_gift", { p_code: giftCode });
  return r.error ? null : (r.data || {});
}
function giftApplied(res) {
  if (res.plus_until) plusUntil = res.plus_until;
  history.replaceState(null, "", location.pathname);
  render();
}
function giftError(res) {
  return t(res.error === "used_up" ? "gift.errUsed" : res.error === "expired" ? "gift.errExpired" : "gift.errInvalid");
}
async function redeemGift(btn) {
  btn.disabled = true;
  var res = await redeemCode();
  if (!res) { btn.disabled = false; toast(t("toast.retry")); return; }
  if (res.ok || res.error === "already") { giftApplied(res); return showGiftDone(!res.ok); }
  showGift(giftError(res));
}
// Nach der ersten Frist (giftPending): einlösen und zeigen. Läuft nach dem Speichern (setTimeout in addItem) -
// ist dann noch ein Fenster offen ("Livo denkt mit"), reicht eine kurze Meldung.
async function giftAfterFirst() {
  var res = await redeemCode();
  if (!res) return toast(t("toast.retry"));
  if (!(res.ok || res.error === "already")) return showGift(giftError(res));
  giftApplied(res);
  if (sheet.hidden) showGiftDone(!res.ok);
  else toast(t("gift.done", { date: fmt(fromISO(plusUntil)) }));
}

/* ---------- Kurze Meldung ---------- */
// shareId: Knopf "Teilen" für diese Frist - die Meldung bleibt dann länger stehen, damit man ihn erwischt
var toastTimer;
function toast(msg, shareId) {
  var el = document.getElementById("toast");
  el.className = "toast" + (shareId ? " withbtn" : "");
  el.innerHTML = '<span>' + esc(msg) + '</span>' + (shareId ? '<button type="button" class="toastbtn" data-act="share" data-id="' + esc(shareId) + '">' + t("share") + '</button>' : "");
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.hidden = true; }, shareId ? 6000 : 2800);
}

/* ---------- Klicks ---------- */
document.addEventListener("click", function (e) {
  var el = e.target.closest("[data-act],[data-open],[data-tpl]");
  if (!el) return;
  if (el.hasAttribute("data-open")) return showItem(el.getAttribute("data-open"));
  var act = el.getAttribute("data-act"), id = el.getAttribute("data-id");
  // Anlegen und Ändern nur in der Testphase oder mit Livo Plus (Löschen und Ansehen immer)
  var changes = el.hasAttribute("data-tpl") || act === "add" || act === "voice" || act === "done" || act === "edit" || act === "follow" || act === "followTpl";
  if (act === "calendar") return showPlus("calendar");
  if (act === "plus" || (changes && !canEdit())) return showPlus();
  if (el.hasAttribute("data-tpl")) return showNew(el.getAttribute("data-tpl"));
  // Erinnerungen einschalten: über die Karte oder direkt über das Glockensymbol, wenn sie aus sind
  if (act === "push" || (act === "info" && id === "push" && pushState === "off")) {
    if (act === "info") infoTab = "push";
    el.disabled = true;
    if (sheet.contains(el)) closeSheet(); // Knopf im Fenster nach einer geteilten Frist
    enablePush().then(function (ok) {
      render();
      toast(ok ? t("toast.pushOn") : pushState === "blocked" ? t("toast.pushBlocked") : t("toast.pushOff"));
    }, function () {
      render();
      toast(t("toast.retry"));
    });
    return;
  }
  // Ausschalten über die Glocke (wenn sie an sind) oder den Link darunter - immer mit Rückfrage
  if (act === "pushoff" || (act === "info" && id === "push" && pushState === "on")) {
    if (act === "info") infoTab = "push";
    // Abbrechen: an bleibt an, unter der Glocke steht dann "Erinnerungen sind an"
    if (!confirm(t("push.offConfirm"))) { if (act === "info") document.getElementById("status").innerHTML = infoHTML(); return; }
    el.disabled = true;
    disablePush().then(function (ok) {
      render();
      toast(ok ? t("toast.pushOffDone") : t("toast.retry"));
    });
    return;
  }
  if (act === "add") showPicker();
  else if (act === "voice") showVoice();
  else if (act === "close") closeSheet();
  else if (act === "done") markDone(id);
  else if (act === "edit") showEdit(id, false);
  else if (act === "del") removeItem(id);
  else if (act === "share") showShare(id);
  else if (act === "follow") addFollow(el, id);
  else if (act === "followTpl") showNew(id);
  else if (act === "followDone") followDone();
  else if (act === "shareOther") shareItem(id);
  else if (act === "mycat") showMyCat();
  else if (act === "heroGo") heroGo();
  else if (act === "inappClose") { inappClosed = true; try { sessionStorage.setItem("livo.inapp", "x"); } catch (e) {} render(); }
  else if (act === "tipClose") { tipClosedOn = toISO(today()); try { localStorage.setItem("livo.tip2", tipClosedOn); } catch (e) {} var tipBox = document.querySelector(".tipbox"); if (tipBox) tipBox.remove(); }
  else if (act === "todayWeek") { setFilter("week"); var sec = document.querySelector(".sec-row"); if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" }); }
  else if (act === "inAdd") addIncoming(el);
  else if (act === "calcopy") copyText(calFeedUrl, t("toast.linkCopied"));
  else if (act === "calreset") resetCalendar();
  else if (act === "howto") showHowto();
  else if (act === "filter") setFilter(id);
  else if (act === "info") setInfoTab(id);
  else if (act === "year") { yearShift = 0; showYear(); }
  else if (act === "ynav") { yearShift += +id; showYear(); }
  else if (act === "yday") showYearDay(id);
  else if (act === "yadd") addOnDay(id, el.getAttribute("data-time"));
  else if (act === "account" || act === "signin") {
    // data-then="plus": nach dem Sichern bzw. Anmelden geht das Kauf-Fenster wieder auf
    var then = el.getAttribute("data-then") || (accFlow && el.closest("#sheet") ? accFlow.then : "");
    showAccount(act === "signin" ? "signin" : "");
    if (accFlow) accFlow.then = then;
  }
  else if (act === "giftRedeem") redeemGift(el);
  else if (act === "giftFirst") { giftPending = true; showPicker(); }
  else if (act === "giftHere") { if (items.length) showGift(); else showGiftWait(); }
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
  document.getElementById("fabText").textContent = t("add");
  // "← Startseite" oben in der Mitte - das Logo führt auch dorthin, aber das sieht man nicht.
  // In der Play-App beides nicht: Die Website nennt Preis und Stripe-Kauf (Zahlungsrichtlinie von Google Play).
  var brandLink = document.getElementById("brand"), homeLink = document.getElementById("homeLink");
  if (PLAY) {
    brandLink.removeAttribute("href");
    homeLink.style.display = "none"; // .homelink setzt display:flex, "hidden" allein reicht nicht
  } else {
    brandLink.href = homeLink.href = LANG === "de" ? "../" : "../en/";
  }
  document.getElementById("homeText").textContent = t("home");
  // Ratgeber und Rechtliches unten: Deutsch auf die deutschen Seiten, alle anderen Sprachen auf die englischen
  var links = document.getElementById("appLinks"), de = LANG === "de";
  if (links) links.innerHTML = [
    [de ? "../ratgeber/" : "../en/deadlines-germany/", "legal.guides"],
    [de ? "../impressum.html" : "../en/imprint.html", "legal.imprint"],
    [de ? "../datenschutz.html" : "../en/privacy.html", "legal.privacy"],
    [de ? "../agb.html" : "../en/terms.html", "legal.terms"]
  ].map(function (l) { return '<a href="' + l[0] + '">' + esc(t(l[1])) + '</a>'; }).join("") +
    // Facebook, Instagram, TikTok, YouTube und Pinterest (öffnen außerhalb der App)
    '<span class="social"><a href="https://www.facebook.com/heylivo" target="_blank" rel="noopener" aria-label="Facebook" title="Facebook"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></a><a href="https://www.instagram.com/heylivo.app/" target="_blank" rel="noopener" aria-label="Instagram" title="Instagram"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.4" cy="6.6" r="1.2" fill="currentColor"/></svg></a>' +
    '<a href="https://www.tiktok.com/@heylivo" target="_blank" rel="noopener" aria-label="TikTok" title="TikTok"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.53.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg></a><a href="https://www.youtube.com/@heylivoapp" target="_blank" rel="noopener" aria-label="YouTube" title="YouTube"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg></a><a href="https://www.pinterest.com/heylivo/" target="_blank" rel="noopener" aria-label="Pinterest" title="Pinterest"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z"/></svg></a></span>';
}

/* ---------- Start ---------- */
async function start() {
  var list = document.getElementById("list");
  setupLanguage();
  loadTip();
  if (DEMO) {
    if (params.get("empty") !== "1") seedDemo(); // &empty=1: Demo wie beim ersten Besuch, ohne Beispiel-Fristen
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
  giftCode = (params.get("gift") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 30);
  if (giftCode) showGiftStart(); // Gratis-Aktion: ?gift=<Code> aus der DM, dem Facebook-Beitrag oder der Werbung
  else if (params.get("add")) showIncoming(readIncoming()); // geteilte Frist (WhatsApp, Viber …)
  else if (params.get("say")) understand(params.get("say"));
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
