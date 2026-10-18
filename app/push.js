// heylivo: Push-Erinnerungen einschalten. Der Service Worker (sw.js) zeigt sie an,
// die Edge Function send-reminders verschickt sie täglich. Der Schlüssel unten
// ist der öffentliche Teil des VAPID-Paars, der private liegt nur bei Supabase.

var VAPID_PUBLIC_KEY = "BAqUU6kCUTgMyhumAuCzqpRB5NSn8HviKiOU9gq15bVIEEkh2Bl0t2yq9ZuHJ5OaOH6BfFERFk4F1h56UIDNPrk";
var pushSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
var isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
// "on" | "off" | "blocked" | "ios-install" (iPhone: erst zum Home-Bildschirm) | "unsupported" | "" (unbekannt)
var pushState = "";
var swReg = null;

function base64UrlToBytes(s) {
  var b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  var bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  return Uint8Array.from(bin, function (c) { return c.charCodeAt(0); });
}

// Manche Browser antworten hier nie - dann lieber ohne Push weiter als hängen
function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise(function (resolve) { setTimeout(function () { resolve(null); }, ms); })]);
}

async function initPush() {
  if (DEMO) return;
  if (!pushSupported) { pushState = isIOS && !isStandalone ? "ios-install" : "unsupported"; return; }
  try {
    swReg = await withTimeout(navigator.serviceWorker.register("sw.js"), 8000);
    if (!swReg) { pushState = "off"; return; }
    if (Notification.permission === "denied") { pushState = "blocked"; return; }
    var sub = await withTimeout(swReg.pushManager.getSubscription(), 8000);
    pushState = sub && Notification.permission === "granted" ? "on" : "off";
    // Das Gerät beim Konto halten (z. B. wenn der Browser das Abo erneuert hat)
    if (pushState === "on" && !(await keepSubscription(swReg, sub))) pushState = "off";
  } catch (e) {
    pushState = "off";
  }
}

function subscribe(reg) {
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY) });
}

// Speichert das Abo beim aktuellen Konto. Gehört es noch einem früheren anonymen Konto
// dieses Browsers (z. B. nach gelöschten Website-Daten), darf das neue Konto die Zeile
// nicht übernehmen (RLS) - dann ein frisches Abo holen. Sonst sagt die App "an",
// aber die Erinnerungen gehen an das alte Konto.
async function keepSubscription(reg, sub) {
  try {
    await saveSubscription(sub);
    return true;
  } catch (e) { /* weiter unten neu abonnieren */ }
  try {
    await sub.unsubscribe();
    await saveSubscription(await subscribe(reg));
    return true;
  } catch (e) {
    return false;
  }
}

async function saveSubscription(sub) {
  var j = sub.toJSON();
  var r = await sb.from("push_subscriptions").upsert(
    { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth_key: j.keys.auth, lang: LANG },
    { onConflict: "endpoint" }
  );
  if (r.error) throw r.error;
}

// Muss direkt aus dem Tippen kommen, sonst fragt Safari nicht nach der Erlaubnis
async function enablePush() {
  var reg = swReg;
  if (!reg || !reg.active) {
    await navigator.serviceWorker.register("sw.js");
    reg = await withTimeout(navigator.serviceWorker.ready, 8000);
    if (!reg) return false;
  }
  var sub;
  try {
    sub = await subscribe(reg);
  } catch (e) {
    pushState = Notification.permission === "denied" ? "blocked" : "off";
    return false;
  }
  if (!(await keepSubscription(reg, sub))) {
    pushState = "off";
    return false;
  }
  pushState = "on";
  sendTestPush();
  return true;
}

// Erinnerungen auf diesem Gerät aus: Abo aus der Datenbank löschen (eigene Zeile, RLS) und im Browser kündigen
async function disablePush() {
  try {
    var reg = swReg || (await navigator.serviceWorker.getRegistration());
    var sub = reg && (await reg.pushManager.getSubscription());
    if (sub) {
      var r = await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      if (r.error) return false;
      await sub.unsubscribe();
    }
  } catch (e) { return false; }
  pushState = "off";
  return true;
}

// Eine erste Nachricht sofort, damit man sieht, dass es klappt
async function sendTestPush() {
  try {
    var s = await sb.auth.getSession();
    var token = s.data.session && s.data.session.access_token;
    if (!token) return;
    await fetch(SUPABASE_URL + "/functions/v1/send-reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: "Bearer " + token },
      body: JSON.stringify({ action: "test" })
    });
  } catch (e) { /* die täglichen Erinnerungen kommen trotzdem */ }
}

// Karte bzw. Hinweis über der Liste
function pushHTML() {
  if (DEMO || !items.length || !canEdit()) return "";
  if (pushState === "off") {
    return '<button type="button" class="pushcard" data-act="push"><span class="mic-ico">🔔</span>' +
      '<span><b>' + t("push.card") + '</b><small>' + t("push.cardSub") + '</small></span></button>';
  }
  if (pushState === "ios-install") return '<div class="pushinfo">' + t("push.ios") + '</div>';
  if (pushState === "blocked") return '<div class="pushinfo">' + t("push.blocked") + '</div>';
  if (pushState === "unsupported") return '<div class="pushinfo">' + t("push.unsupported") + '</div>';
  if (pushState === "on") return '<p class="quota">' + t("push.on") + ' · <button type="button" class="linkbtn" data-act="pushoff">' + t("push.turnOff") + '</button></p>';
  return "";
}
