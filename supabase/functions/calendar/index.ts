// heylivo: Kalender-Abo für Livo Plus (iCalendar, RFC 5545).
// Google, Apple und Outlook holen https://<projekt>.supabase.co/functions/v1/calendar/<token>.ics
// regelmäßig ab. Der Token ist geheim (Tabelle calendar_feeds, 0010_calendar.sql); die App
// holt ihn über calendar_feed() und zeigt die Abo-Knöpfe nur mit Livo Plus.
// - Pro Frist ein Termin am nächsten Fälligkeitstag, ohne Wiederholungsregel: Kopiert jemand
//   einen Termin in einen anderen Kalender, wiederholt er sich dort nicht für immer.
// - Ohne aktives Livo Plus kommt ein gültiger, leerer Kalender (Google behält bei Fehlern die
//   alten Termine), nach einem Kauf ein einzelner Hinweis "Livo Plus ist abgelaufen".
// - /calendar/demo-de.ics (de, en, …) liefert Beispiel-Fristen ohne Datenbank, zum Ausprobieren.
// Muss mit "Verify JWT" AUS laufen - Kalender schicken keinen Schlüssel mit.
// Der Teil zwischen "ics:start" und "ics:end" ist reines JavaScript ohne Typen, damit ihn die
// lokale Testseite __preview-ics.html im Browser ausführen kann.
// @ts-nocheck

import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const TOKEN = /^[0-9a-f]{64}$/;

// --- ics:start ---
const APP_URL = 'https://heylivo.com/app/';
const ICS_LANGS = ['de', 'en', 'it', 'el', 'es', 'fr', 'nl', 'pt', 'tr', 'pl'];
const ICS_TEXT = {
  de: {
    name: 'heylivo – Fristen',
    about: 'Deine Fristen aus heylivo. Ändern und erledigen in der App: {app}',
    event: 'Frist aus heylivo – ändern, erledigen und erinnern lassen in der App: {app}',
    expired: 'Livo Plus ist abgelaufen – Kalender pausiert',
    expiredText: 'Verlängere Livo Plus in der App, dann erscheinen deine Fristen hier wieder: {plus}',
    demo: ['Personalausweis läuft ab', 'TÜV / Hauptuntersuchung', 'Zahnarzt-Kontrolle', 'Handyvertrag – Laufzeit endet']
  },
  en: {
    name: 'heylivo – deadlines',
    about: 'Your deadlines from heylivo. Change them and mark them done in the app: {app}',
    event: 'Deadline from heylivo – change it, mark it done and get reminders in the app: {app}',
    expired: 'Livo Plus has expired – calendar paused',
    expiredText: 'Renew Livo Plus in the app and your deadlines will show up here again: {plus}',
    demo: ['ID card expires', 'Car inspection (TÜV)', 'Dental check-up', 'Phone contract – minimum term ends']
  },
  it: {
    name: 'heylivo – scadenze',
    about: "Le tue scadenze da heylivo. Modificale e segnale come fatte nell'app: {app}",
    event: "Scadenza da heylivo – modificala, segnala come fatta e ricevi promemoria nell'app: {app}",
    expired: 'Livo Plus è scaduto – calendario in pausa',
    expiredText: "Rinnova Livo Plus nell'app e le tue scadenze torneranno qui: {plus}",
    demo: ["Scade la carta d'identità", 'Revisione auto', 'Controllo dal dentista', 'Contratto telefonico – fine vincolo']
  },
  el: {
    name: 'heylivo – προθεσμίες',
    about: 'Οι προθεσμίες σου από το heylivo. Αλλαγές και ολοκλήρωση στην εφαρμογή: {app}',
    event: 'Προθεσμία από το heylivo – αλλαγή, ολοκλήρωση και υπενθυμίσεις στην εφαρμογή: {app}',
    expired: 'Το Livo Plus έληξε – το ημερολόγιο σε παύση',
    expiredText: 'Ανανέωσε το Livo Plus στην εφαρμογή και οι προθεσμίες σου θα εμφανιστούν ξανά εδώ: {plus}',
    demo: ['Λήγει η ταυτότητα', 'ΚΤΕΟ', 'Έλεγχος στον οδοντίατρο', 'Συμβόλαιο κινητού – λήξη δέσμευσης']
  },
  es: {
    name: 'heylivo – plazos',
    about: 'Tus plazos de heylivo. Cámbialos y márcalos como hechos en la app: {app}',
    event: 'Plazo de heylivo – cámbialo, márcalo como hecho y recibe avisos en la app: {app}',
    expired: 'Livo Plus ha caducado – calendario en pausa',
    expiredText: 'Renueva Livo Plus en la app y tus plazos volverán a aparecer aquí: {plus}',
    demo: ['Caduca el DNI', 'ITV', 'Revisión dental', 'Contrato móvil – fin de permanencia']
  },
  fr: {
    name: 'heylivo – échéances',
    about: "Vos échéances heylivo. Modifiez-les et marquez-les comme faites dans l'application : {app}",
    event: "Échéance heylivo – modifiez-la, marquez-la comme faite et recevez des rappels dans l'application : {app}",
    expired: 'Livo Plus a expiré – calendrier en pause',
    expiredText: "Renouvelez Livo Plus dans l'application et vos échéances réapparaîtront ici : {plus}",
    demo: ["Carte d'identité expire", 'Contrôle technique', 'Contrôle chez le dentiste', "Forfait mobile – fin d'engagement"]
  },
  nl: {
    name: 'heylivo – deadlines',
    about: 'Je deadlines uit heylivo. Wijzigen en afvinken in de app: {app}',
    event: 'Deadline uit heylivo – wijzigen, afvinken en herinneringen in de app: {app}',
    expired: 'Livo Plus is verlopen – agenda gepauzeerd',
    expiredText: 'Verleng Livo Plus in de app, dan verschijnen je deadlines hier weer: {plus}',
    demo: ['Identiteitskaart verloopt', 'APK / autokeuring', 'Tandartscontrole', 'Abonnement – looptijd eindigt']
  },
  pt: {
    name: 'heylivo – prazos',
    about: 'Os seus prazos do heylivo. Altere-os e marque-os como feitos na app: {app}',
    event: 'Prazo do heylivo – altere, marque como feito e receba lembretes na app: {app}',
    expired: 'O Livo Plus expirou – calendário em pausa',
    expiredText: 'Renove o Livo Plus na app e os seus prazos voltam a aparecer aqui: {plus}',
    demo: ['Cartão de Cidadão expira', 'Inspeção do carro', 'Consulta no dentista', 'Contrato de telemóvel – fim da fidelização']
  },
  tr: {
    name: 'heylivo – tarihler',
    about: "heylivo'daki tarihlerin. Uygulamada değiştir ve tamamlandı olarak işaretle: {app}",
    event: "heylivo'dan bir tarih – uygulamada değiştir, tamamla ve hatırlatma al: {app}",
    expired: "Livo Plus'ın süresi doldu – takvim duraklatıldı",
    expiredText: "Livo Plus'ı uygulamada uzat, tarihlerin burada yeniden görünsün: {plus}",
    demo: ['Kimlik kartının süresi doluyor', 'Araç muayenesi', 'Diş kontrolü', 'Telefon sözleşmesi – taahhüt bitiyor']
  },
  pl: {
    name: 'heylivo – terminy',
    about: 'Twoje terminy z heylivo. Zmieniaj je i oznaczaj jako zrobione w aplikacji: {app}',
    event: 'Termin z heylivo – zmień go, oznacz jako zrobiony i otrzymuj przypomnienia w aplikacji: {app}',
    expired: 'Livo Plus wygasł – kalendarz wstrzymany',
    expiredText: 'Przedłuż Livo Plus w aplikacji, a Twoje terminy znów się tu pojawią: {plus}',
    demo: ['Dowód osobisty traci ważność', 'Przegląd techniczny', 'Kontrola u dentysty', 'Umowa na telefon – koniec okresu umowy']
  }
};

function icsLang(lang) { return ICS_LANGS.indexOf(lang) >= 0 ? lang : 'en'; }
function icsText(lang, key) {
  const appLink = APP_URL + '?lang=' + lang;
  return String(ICS_TEXT[lang][key]).replace('{app}', appLink).replace('{plus}', appLink + '&show=plus');
}

// Text-Werte: \ ; , und Zeilenumbrüche maskieren
function icsEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Zeilen höchstens 75 Bytes (UTF-8), Fortsetzung mit Leerzeichen - nie mitten in einem Zeichen trennen
function icsFold(line) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts = [];
  let current = '', size = 0, limit = 75;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > limit) { parts.push(current); current = ''; size = 0; limit = 74; }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function icsDate(iso) { return iso.slice(0, 10).replace(/-/g, ''); }
function icsUtc(ms) {
  const d = new Date(ms);
  return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + 'T' +
    pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + 'Z';
}
function addDaysIso(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate());
}

// Datum + Uhrzeit in einer Zeitzone als UTC-Millisekunden (wie zonedToUtc in send-reminders)
function zonedUtc(date, time, tz) {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let zone = tz || 'Europe/Berlin';
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); } catch (e) { zone = 'Europe/Berlin'; }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(new Date(guess));
  const get = (type) => Number((parts.find((part) => part.type === type) || {}).value);
  const shownThere = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return guess - (shownThere - guess);
}

// Ein Termin. item: { id, title, due, due_time, tz, lead_days, remind_min }
function icsEvent(item, lang, stamp, nowMs) {
  const lines = ['BEGIN:VEVENT', 'UID:heylivo-' + item.id + '@heylivo.com', 'DTSTAMP:' + stamp];
  const tz = item.tz || 'Europe/Berlin';
  if (item.due_time) {
    const start = zonedUtc(item.due, item.due_time.slice(0, 5), tz);
    lines.push('DTSTART:' + icsUtc(start), 'DTEND:' + icsUtc(start + 3600000));
  } else {
    lines.push('DTSTART;VALUE=DATE:' + icsDate(item.due), 'DTEND;VALUE=DATE:' + icsDate(addDaysIso(item.due, 1)));
    lines.push('TRANSP:TRANSPARENT');
  }
  lines.push('SUMMARY:' + icsEscape(item.title), 'DESCRIPTION:' + icsEscape(icsText(lang, 'event')));
  // Erinnerung wie in der App: so viele Tage vorher um 9:00 (nur wenn noch in der Zukunft);
  // bei Terminen mit Uhrzeit zusätzlich "kurz vorher". Google übernimmt Erinnerungen aus Abos nicht.
  const lead = Number(item.lead_days) || 0;
  if (lead > 0) {
    const at = zonedUtc(addDaysIso(item.due, -lead), '09:00', tz);
    if (at > nowMs) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(item.title), 'TRIGGER;VALUE=DATE-TIME:' + icsUtc(at), 'END:VALARM');
  }
  if (item.due_time && Number(item.remind_min) > 0) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(item.title), 'TRIGGER:-PT' + Number(item.remind_min) + 'M', 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines;
}

// Ganzer Kalender. events: Liste wie bei icsEvent; expiredOn: Datum für den Hinweis "abgelaufen" oder ''
function buildCalendar(lang, events, expiredOn, nowMs) {
  lang = icsLang(lang);
  const stamp = icsUtc(nowMs);
  let lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//heylivo//Fristen//' + lang.toUpperCase(), 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsEscape(icsText(lang, 'name')), 'NAME:' + icsEscape(icsText(lang, 'name')),
    'X-WR-CALDESC:' + icsEscape(icsText(lang, 'about')), 'DESCRIPTION:' + icsEscape(icsText(lang, 'about')),
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H', 'COLOR:royalblue'
  ];
  events.forEach((item) => { lines = lines.concat(icsEvent(item, lang, stamp, nowMs)); });
  if (expiredOn) {
    lines = lines.concat(['BEGIN:VEVENT', 'UID:heylivo-plus-expired-' + icsDate(expiredOn) + '@heylivo.com', 'DTSTAMP:' + stamp,
      'DTSTART;VALUE=DATE:' + icsDate(expiredOn), 'DTEND;VALUE=DATE:' + icsDate(addDaysIso(expiredOn, 1)), 'TRANSP:TRANSPARENT',
      'SUMMARY:' + icsEscape(icsText(lang, 'expired')), 'DESCRIPTION:' + icsEscape(icsText(lang, 'expiredText')), 'END:VEVENT']);
  }
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}

// Beispiel-Kalender ab heute: Ausweis in 58 Tagen, TÜV Monatsende in 7 Monaten, Zahnarzt in 31 Tagen um 10:00, Handyvertrag in 40 Tagen
function demoEvents(lang, todayIso) {
  const titles = ICS_TEXT[icsLang(lang)].demo;
  const tuev = addDaysIso(todayIso, 210).slice(0, 8) + '01';
  const tuevEnd = addDaysIso(addDaysIso(tuev, 32).slice(0, 8) + '01', -1);
  return [
    { id: 'demo-ausweis', title: titles[0], due: addDaysIso(todayIso, 58), due_time: null, tz: 'Europe/Berlin', lead_days: 90 },
    { id: 'demo-tuev', title: titles[1], due: tuevEnd, due_time: null, tz: 'Europe/Berlin', lead_days: 30 },
    { id: 'demo-zahnarzt', title: titles[2], due: addDaysIso(todayIso, 31), due_time: '10:00', tz: 'Europe/Berlin', lead_days: 14, remind_min: 60 },
    { id: 'demo-handy', title: titles[3], due: addDaysIso(todayIso, 40), due_time: null, tz: 'Europe/Berlin', lead_days: 45 }
  ];
}
// --- ics:end ---

function berlinToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}

function calendarResponse(body: string, head: boolean) {
  return new Response(head ? null : body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="heylivo.ics"',
      'Cache-Control': 'private, max-age=900'
    }
  });
}

Deno.serve(async (request) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  const head = request.method === 'HEAD';
  const url = new URL(request.url);
  // .../calendar/<token>.ics oder .../calendar?t=<token>
  const last = url.pathname.split('/').pop() ?? '';
  const name = (url.searchParams.get('t') || (last === 'calendar' ? '' : last)).replace(/\.ics$/i, '').toLowerCase();
  const now = Date.now();
  const today = berlinToday();

  const demo = /^demo(?:-([a-z]{2}))?$/.exec(name);
  if (demo) {
    const lang = demo[1] || 'de';
    return calendarResponse(buildCalendar(lang, demoEvents(lang, today), '', now), head);
  }
  if (!TOKEN.test(name)) return new Response('Unknown calendar', { status: 404 });

  const { data: feed, error } = await supabase.from('calendar_feeds').select('user_id, lang').eq('token', name).maybeSingle();
  if (error) return new Response('Try again later', { status: 503 });
  if (!feed) return new Response('Unknown calendar', { status: 404 });

  const { data: plan } = await supabase.from('plans').select('plus_until').eq('user_id', feed.user_id).maybeSingle();
  const plusUntil = plan?.plus_until ?? null;
  if (!plusUntil || plusUntil < today) {
    // Leer lassen, nach einem früheren Kauf mit einem Hinweis am Tag nach dem Ablauf
    const expiredOn = plusUntil ? new Date(Date.parse(plusUntil + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10) : '';
    return calendarResponse(buildCalendar(feed.lang, [], expiredOn, now), head);
  }

  const { data: rows, error: rowsError } = await supabase.from('deadlines')
    .select('id, title, due, due_time, tz, lead_days, remind_min')
    .eq('user_id', feed.user_id).order('due').limit(500);
  if (rowsError) return new Response('Try again later', { status: 503 });
  return calendarResponse(buildCalendar(feed.lang, rows ?? [], '', now), head);
});
