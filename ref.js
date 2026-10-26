/* heylivo: Woher kommt ein Besuch (Instagram, Google, Pinterest …)? Für den Wochenbericht.
   Im Browser wird nichts gespeichert (kein Cookie, kein localStorage): Die Herkunft geht über ?von=…
   in den Links bis zur App mit; die App legt sie beim ersten Öffnen nur als Stichwort im anonymen
   Konto ab (signInAnonymously, user_metadata.src). Reihenfolge: ?von= / utm_source, ?pin= (Pinterest),
   die verweisende Seite, zuletzt der In-App-Browser (Instagram, TikTok, Facebook).
   Mit data-decorate="no" (in der App) werden keine Links ergänzt. */
(function () {
  var HOSTS = [
    [/(^|\.)google\./, "google"], [/(^|\.)bing\.com$/, "bing"], [/(^|\.)duckduckgo\.com$/, "duckduckgo"],
    [/(^|\.)ecosia\.org$/, "ecosia"], [/(^|\.)yahoo\./, "yahoo"],
    [/(^|\.)instagram\.com$/, "instagram"], [/(^|\.)manychat\.com$/, "instagram"], [/(^|\.)tiktok\.com$/, "tiktok"],
    [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, "youtube"], [/(^|\.)pinterest\./, "pinterest"], [/(^|\.)pin\.it$/, "pinterest"],
    [/(^|\.)facebook\.com$|(^|\.)fb\.com$/, "facebook"], [/(^|\.)producthunt\.com$/, "producthunt"],
    [/(^|\.)reddit\.com$/, "reddit"], [/(^|\.)x\.com$|(^|\.)t\.co$|(^|\.)twitter\.com$/, "x"],
    [/(^|\.)linkedin\.com$|(^|\.)lnkd\.in$/, "linkedin"], [/(^|\.)whatsapp\.com$/, "whatsapp"]
  ];
  var script = document.currentScript;
  function clean(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9.-]/g, "").slice(0, 30); }

  function detect() {
    var q = new URLSearchParams(location.search);
    var v = clean(q.get("von") || q.get("utm_source"));
    if (v) return v;
    if (q.get("pin")) return "pinterest";
    var host = "";
    try { host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : ""; } catch (e) {}
    if (host && host !== location.hostname && !/(^|\.)heylivo\.com$/.test(host)) {
      for (var i = 0; i < HOSTS.length; i++) if (HOSTS[i][0].test(host)) return HOSTS[i][1];
      return clean(host); // eine andere Website: ihr Name
    }
    var ua = navigator.userAgent;
    if (/Instagram/.test(ua)) return "instagram";
    if (/musical_ly|TikTok|BytedanceWebview/i.test(ua)) return "tiktok";
    if (/FBAN|FBAV|FB_IAB/.test(ua)) return "facebook";
    return "";
  }

  var source = detect();
  window.heylivoSource = function () { return source; };

  // ?von= nicht in der Adresszeile stehen lassen - sonst nimmt jemand, der den Link teilt, die Herkunft mit
  try {
    var url = new URL(location.href);
    if (url.searchParams.has("von")) {
      url.searchParams.delete("von");
      history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    }
  } catch (e) {}

  // Eigene Links (Startseite, Ratgeber, App) tragen die Herkunft weiter
  if (!source || (script && script.getAttribute("data-decorate") === "no")) return;
  function decorate() {
    var links = document.querySelectorAll("a[href]");
    for (var i = 0; i < links.length; i++) {
      var raw = links[i].getAttribute("href");
      if (!raw || raw.charAt(0) === "#") continue;
      try {
        var u = new URL(raw, location.href);
        if (u.origin !== location.origin || u.searchParams.has("von")) continue;
        u.searchParams.set("von", source);
        links[i].setAttribute("href", u.pathname + u.search + u.hash);
      } catch (e) {}
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", decorate);
  else decorate();
})();
