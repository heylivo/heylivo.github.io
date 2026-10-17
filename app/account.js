// heylivo: Konto sichern und anmelden – mit einem 6-stelligen Code per E-Mail, ohne Passwort.
// Ohne Konto hängt alles (Fristen, Testphase, Livo Plus) am anonymen Konto dieses Browsers.
// "Konto sichern" hängt eine E-Mail-Adresse an genau dieses Konto: Die ID bleibt, nichts wird
// kopiert. "Anmelden" holt das gesicherte Konto auf ein neues Gerät; Fristen, die dort schon
// ohne Konto eingetragen waren, kommen mit - aber nur, solange dort die Testphase läuft
// (sonst ließe sich eine abgelaufene Testphase mit einem leeren Konto neu starten).
// Die Mails (Supabase-Vorlagen "Change email address" und "Magic link", siehe
// supabase/email-templates/) enthalten nur den Code, keinen Link: Ein Link würde auf dem
// Handy den Browser öffnen statt der installierten App.

var userEmail = ""; // bestätigte E-Mail-Adresse, leer = anonymes Konto
var accFlow = null; // laufender Ablauf: { mode: "secure" | "signin", email, sent }
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function setUser(user) {
  userId = user.id;
  userEmail = !user.is_anonymous && user.email ? user.email : "";
}

// "Beta:" vorne im Text wird zum Schild BETA (style.css .beta), der Rest beginnt groß
function betaNote(s) {
  var m = /^(B[eê]ta)\s*:\s*/.exec(s);
  if (!m) return s;
  return '<span class="beta">' + m[1] + '</span>' +
    s.slice(m[0].length).replace(/^([^\p{L}]*)(\p{L})/u, function (x, p, c) { return p + c.toLocaleUpperCase(LOCALE); });
}

// Zeile oben: ohne Konto "nur in diesem Browser" (auf einem neuen Gerät ohne Fristen: "Anmelden"),
// mit Konto die gesicherte Adresse
function renderNote() {
  var el = document.getElementById("note");
  if (DEMO) { el.textContent = t("note.demo"); return; }
  el.classList.toggle("ok", !!userEmail);
  el.classList.toggle("row", !userEmail && !items.length);
  if (userEmail) {
    el.innerHTML = t("note.secured", { email: "<b>" + esc(userEmail) + "</b>" }) +
      ' · <button type="button" class="linkbtn" data-act="account">' + t("acc.manage") + '</button>';
  } else if (items.length) {
    el.innerHTML = betaNote(t("note.beta")) + ' <button type="button" class="linkbtn" data-act="account">' + t("acc.secure") + '</button>';
  } else {
    // Neu hier: Text + "So funktioniert's" links, "Anmelden" als Knopf rechts
    el.innerHTML = '<span class="note-txt">' + betaNote(t("note.new")) +
      ' <button type="button" class="linkbtn plain" data-act="howto">' + t("note.how") + '</button></span>' +
      '<button type="button" class="notebtn" data-act="signin">' + t("note.signin") + '</button>';
  }
}

// "So funktioniert's": vier kurze Schritte, darunter Anmelden
function showHowto() {
  var icons = ["📝", "🔔", "📱", "🔒"];
  openSheet('<h3>' + t("how.title") + '</h3><ol class="howto">' +
    icons.map(function (ic, i) {
      return '<li><span class="howto-ico">' + ic + '</span><span><b>' + t("how." + (i + 1) + "t") + '</b>' + t("how." + (i + 1)) + '</span></li>';
    }).join("") + '</ol>' +
    '<p class="muted">' + t("how.signin") + '</p>' +
    '<button type="button" class="btn" data-act="signin">' + t("acc.signin") + '</button>' +
    '<button type="button" class="btn light" data-act="close">OK</button>');
}

function showAccount(mode) {
  if (DEMO) return;
  if (userEmail) return showAccountInfo();
  mode = mode || "secure";
  if (!accFlow || accFlow.mode !== mode) accFlow = { mode: mode, email: accFlow ? accFlow.email : "", sent: false };
  if (accFlow.sent) showCode(); else showEmail();
}

// Schritt 1: E-Mail-Adresse. hint ersetzt den Hinweis oben (z. B. "gibt es schon - bitte anmelden").
function showEmail(hint) {
  var signin = accFlow.mode === "signin";
  if (!hint && signin && items.length && canEdit()) hint = t("acc.carry", { n: items.length });
  openSheet('<h3>' + (signin ? t("acc.signin") : "🔒 " + t("acc.secure")) + '</h3>' +
    '<p class="muted">' + t(signin ? "acc.signinIntro" : "acc.secureIntro") + '</p>' +
    (hint ? '<p class="hint">' + hint + '</p>' : "") +
    '<form id="accForm" novalidate><label class="field"><span>' + t("acc.email") + '</span>' +
    '<input name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" value="' + esc(accFlow.email) + '"></label>' +
    '<p class="err" id="err"></p><button class="btn" type="submit">' + t("acc.sendCode") + '</button></form>' +
    '<button type="button" class="btn light" data-act="' + (signin ? "account" : "signin") + '">' + t(signin ? "acc.toSecure" : "acc.toSignin") + '</button>' +
    '<button type="button" class="btn light" data-act="close">' + t("cancel") + '</button>');
  var form = document.getElementById("accForm");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = form.elements.email.value.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { document.getElementById("err").textContent = t("acc.errEmail"); return; }
    accFlow.email = email;
    sendCode(form.querySelector("[type=submit]"), false);
  });
}

// Schritt 2: der Code aus der Mail
function showCode() {
  openSheet('<h3>' + t("acc.codeTitle") + '</h3>' +
    '<p class="muted">' + t("acc.codeSent", { email: "<b>" + esc(accFlow.email) + "</b>" }) + '</p>' +
    '<form id="accForm" novalidate><label class="field"><span>' + t("acc.code") + '</span>' +
    '<input name="code" class="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10"></label>' +
    '<p class="err" id="err"></p><button class="btn" type="submit">' + t("acc.confirm") + '</button></form>' +
    '<button type="button" class="btn light" data-act="resend">' + t("acc.resend") + '</button>' +
    '<button type="button" class="btn light" data-act="otherEmail">' + t("acc.otherEmail") + '</button>');
  var form = document.getElementById("accForm"), input = form.elements.code;
  input.addEventListener("input", function () { input.value = input.value.replace(/\D/g, ""); });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var code = input.value.replace(/\D/g, "");
    if (code.length < 6) { document.getElementById("err").textContent = t("acc.errCode"); return; }
    verifyCode(code, form.querySelector("[type=submit]"));
  });
  input.focus();
}

function otherEmail() {
  accFlow.sent = false;
  showEmail();
}

// Sichern: Supabase merkt sich die Adresse am anonymen Konto, gültig wird sie erst mit dem Code.
// Anmelden: nur für Adressen, die schon zu einem Konto gehören (shouldCreateUser: false).
async function requestCode() {
  if (accFlow.mode === "signin") {
    return sb.auth.signInWithOtp({ email: accFlow.email, options: { shouldCreateUser: false } });
  }
  await sb.auth.updateUser({ data: { lang: LANG } }); // Sprache der Mail ({{ .Data.lang }} in der Vorlage)
  return sb.auth.updateUser({ email: accFlow.email });
}

async function sendCode(btn, again) {
  var label = btn.textContent, r;
  btn.disabled = true;
  btn.textContent = "…";
  try { r = await requestCode(); } catch (e) { r = { error: e }; }
  btn.disabled = false;
  btn.textContent = label;
  var err = r.error, msg = String(err && err.message || "");
  if (!err) {
    // Ist in Supabase "Confirm email" aus, gilt die Adresse sofort - dann ohne Code fertig
    var u = r.data && r.data.user;
    if (accFlow.mode === "secure" && u && !u.is_anonymous && u.email === accFlow.email) return secured(u);
    accFlow.sent = true;
    showCode();
    if (again) toast(t("acc.resent"));
    return;
  }
  if (accFlow.mode === "secure" && (err.code === "email_exists" || /already (been )?registered/i.test(msg))) {
    accFlow = { mode: "signin", email: accFlow.email, sent: false, then: accFlow.then };
    return showEmail(t("acc.errExists"));
  }
  var text = accFlow.mode === "signin" && (err.code === "otp_disabled" || /signups not allowed/i.test(msg)) ? t("acc.errNoAccount")
    : err.status === 429 || /rate limit|security purposes/i.test(msg) ? t("acc.errWait")
    : t("toast.retry");
  var box = document.getElementById("err");
  if (box) box.textContent = text; else toast(text);
}

async function verifyCode(code, btn) {
  var signin = accFlow.mode === "signin";
  var carry = signin && canEdit() ? items.slice() : []; // Fristen dieses Geräts ohne Konto - kommen mit, solange die Testphase läuft
  var r;
  btn.disabled = true;
  btn.textContent = "…";
  try {
    r = await sb.auth.verifyOtp({ email: accFlow.email, token: code, type: signin ? "email" : "email_change" });
  } catch (e) { r = { error: e }; }
  if (r.error || !r.data || !r.data.user) {
    btn.disabled = false;
    btn.textContent = t("acc.confirm");
    var msg = String(r.error && r.error.message || "");
    document.getElementById("err").textContent = r.error && (r.error.status === 403 || /expired|invalid/i.test(msg)) ? t("acc.errCode") : t("toast.retry");
    return;
  }
  if (signin) signedIn(r.data.user, carry); else secured(r.data.user);
}

function secured(user) {
  var then = accFlow && accFlow.then;
  setUser(user);
  accFlow = null;
  closeSheet();
  render();
  toast(t("acc.secured"));
  if (then === "plus") showPlus(); // vom Kauf-Fenster aus gesichert: gleich weiter zum Kauf
}

async function signedIn(user, carry) {
  var then = accFlow && accFlow.then;
  setUser(user);
  accFlow = null;
  try { await sb.auth.updateUser({ data: { lang: LANG } }); } catch (e) { /* nur die Sprache der Mails */ }
  try { await loadAll(); } catch (e) { location.reload(); return; }
  var moved = 0;
  try {
    for (var i = 0; i < carry.length; i++) {
      var c = carry[i];
      if (items.some(function (x) { return x.title === c.title && x.due === c.due; })) continue;
      await addItem(Object.assign({}, c));
      moved++;
    }
  } catch (e) { /* z. B. Testphase des Kontos vorbei - der Rest bleibt auf dem alten Gerätekonto */ }
  closeSheet();
  render();
  toast(moved ? t("acc.welcomeCarry", { n: moved }) : t("acc.welcome"));
  if (then === "plus") showPlus();
  // Das Push-Abo dieses Geräts gehört noch dem anonymen Konto - initPush holt dann ein neues
  initPush().then(render, render);
}

function showAccountInfo() {
  openSheet('<h3>🔒 ' + t("acc.infoTitle") + '</h3>' +
    '<p class="muted">' + t("acc.info", { email: "<b>" + esc(userEmail) + "</b>" }) + '</p>' +
    '<p class="hint">' + t("acc.otherDevice") + '</p>' +
    '<button type="button" class="btn light" data-act="close">OK</button>' +
    '<button type="button" class="btn danger" data-act="signout">' + t("acc.signout") + '</button>');
}

async function signOutHere() {
  if (!confirm(t("acc.signoutConfirm"))) return;
  try {
    // Dieses Gerät bekommt keine Erinnerungen für das Konto mehr
    var sub = swReg ? await withTimeout(swReg.pushManager.getSubscription(), 5000) : null;
    if (sub) {
      await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
  } catch (e) { /* abmelden geht trotzdem */ }
  // Nur hier: der Standard "global" würde das Konto auch auf allen anderen Geräten abmelden
  await sb.auth.signOut({ scope: "local" });
  location.reload(); // danach bekommt der Browser wieder ein neues anonymes Konto
}
