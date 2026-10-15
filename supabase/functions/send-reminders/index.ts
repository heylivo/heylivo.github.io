// heylivo: Push-Erinnerungen.
// - POST {"action":"run"} mit Header x-cron-secret: täglich per pg_cron (0003_reminders_cron.sql).
//   Erinnert jeden Nutzer in der Testphase oder mit Livo Plus an alle Fristen, deren
//   Erinnerungszeit erreicht ist (Fälligkeit minus lead_days) - einmal pro Fälligkeit
//   (notified_for). Mehrere Fristen am selben Tag kommen als eine Nachricht.
//   Danach die Hinweise zum Ende der Testphase (7 Tage vorher, am letzten Tag, am Tag danach)
//   per Push und an gesicherte Konten per E-Mail (Resend) - einmal pro Stufe (usage.trial_notice).
// - POST {"action":"soon"} mit Header x-cron-secret: jede Minute per pg_cron (0005_soon_reminders.sql).
//   Erinnert kurz vor Terminen mit Uhrzeit (remind_min Minuten vorher), einmal pro Termin
//   (time_notified_for). Die Uhrzeit gilt in der Zeitzone, in der die Frist gespeichert wurde.
// - POST {"action":"test"} mit dem Login des Nutzers (Authorization: Bearer <access token>):
//   sofort eine Probe-Nachricht an seine Geräte, nach "Erinnerungen einschalten".
//
// Web Push wie in Smart Menu (staff-push): RFC 8291 (aes128gcm) + RFC 8292 (VAPID)
// mit Web Crypto, ohne npm-Paket. Der private VAPID-Schlüssel liegt nur als
// Function-Secret VAPID_PRIVATE_KEY bei Supabase, nie im Repo.

import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const VAPID = {
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
  subject: Deno.env.get('VAPID_SUBJECT') ?? 'https://heylivo.com'
};
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const APP_URL = 'https://heylivo.com/app/';
const TRIAL_DAYS = 30;
// Nur echte Push-Dienste der Browser - ein Abo ist nur eine URL, an die diese Funktion sendet.
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];
// Eine Erinnerung, die erst am nächsten Tag ankommt, hilft trotzdem noch.
const TTL_SECONDS = 24 * 3600;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type Sub = { endpoint: string; p256dh: string; auth_key: string; user_id: string; lang?: string };
const SUB_COLUMNS = 'endpoint, p256dh, auth_key, user_id, lang';

// Texte der Push-Nachrichten je App-Sprache (das Gerät merkt sich die Sprache beim Einschalten)
const TEXT: Record<string, Record<string, string>> = {
  de: {
    today: 'heute fällig', tomorrow: 'morgen fällig', yesterday: 'seit gestern fällig', overdue: 'seit {n} Tagen fällig',
    days: 'in {n} Tagen', months: 'in {n} Monaten', years: 'in {n} Jahren', dueOn: 'fällig am {date}', clock: ' Uhr',
    many: '{n} Fristen brauchen deine Aufmerksamkeit', more: '… und {n} weitere',
    soon: 'Beginnt in {n} Minuten · {time}', soon1: 'Beginnt in 1 Minute · {time}', now: 'Jetzt · {time}',
    testTitle: '✓ Erinnerungen sind an', testBody: 'Livo meldet sich, sobald eine Frist näher rückt.'
  },
  en: {
    today: 'due today', tomorrow: 'due tomorrow', yesterday: 'overdue since yesterday', overdue: '{n} days overdue',
    days: 'in {n} days', months: 'in {n} months', years: 'in {n} years', dueOn: 'due {date}', clock: '',
    many: '{n} deadlines need your attention', more: '… and {n} more',
    soon: 'Starts in {n} minutes · {time}', soon1: 'Starts in 1 minute · {time}', now: 'Now · {time}',
    testTitle: '✓ Reminders are on', testBody: 'Livo will get in touch when a deadline is coming up.'
  },
  it: {
    today: 'scade oggi', tomorrow: 'scade domani', yesterday: 'scaduto da ieri', overdue: 'scaduto da {n} giorni',
    days: 'tra {n} giorni', months: 'tra {n} mesi', years: 'tra {n} anni', dueOn: 'scade il {date}', clock: '',
    many: '{n} scadenze richiedono la tua attenzione', more: '… e altre {n}',
    soon: 'Inizia tra {n} minuti · {time}', soon1: 'Inizia tra 1 minuto · {time}', now: 'Adesso · {time}',
    testTitle: '✓ Promemoria attivi', testBody: 'Livo ti avvisa quando una scadenza si avvicina.'
  },
  el: {
    today: 'λήγει σήμερα', tomorrow: 'λήγει αύριο', yesterday: 'έληξε χθες', overdue: 'έληξε πριν από {n} μέρες',
    days: 'σε {n} μέρες', months: 'σε {n} μήνες', years: 'σε {n} χρόνια', dueOn: 'λήγει {date}', clock: '',
    many: '{n} προθεσμίες θέλουν την προσοχή σου', more: '… και {n} ακόμα',
    soon: 'Ξεκινά σε {n} λεπτά · {time}', soon1: 'Ξεκινά σε 1 λεπτό · {time}', now: 'Τώρα · {time}',
    testTitle: '✓ Οι υπενθυμίσεις είναι ενεργές', testBody: 'Το Livo θα σε ειδοποιεί όταν πλησιάζει μια προθεσμία.'
  },
  es: {
    today: 'vence hoy', tomorrow: 'vence mañana', yesterday: 'venció ayer', overdue: 'vencido hace {n} días',
    days: 'en {n} días', months: 'en {n} meses', years: 'en {n} años', dueOn: 'vence el {date}', clock: '',
    many: '{n} plazos necesitan tu atención', more: '… y {n} más',
    soon: 'Empieza en {n} minutos · {time}', soon1: 'Empieza en 1 minuto · {time}', now: 'Ahora · {time}',
    testTitle: '✓ Avisos activados', testBody: 'Livo te avisará cuando se acerque un plazo.'
  },
  fr: {
    today: "aujourd'hui", tomorrow: 'demain', yesterday: 'en retard depuis hier', overdue: 'en retard de {n} jours',
    days: 'dans {n} jours', months: 'dans {n} mois', years: 'dans {n} ans', dueOn: 'échéance le {date}', clock: '',
    many: '{n} échéances demandent votre attention', more: '… et {n} autres',
    soon: 'Commence dans {n} minutes · {time}', soon1: 'Commence dans 1 minute · {time}', now: 'Maintenant · {time}',
    testTitle: '✓ Rappels activés', testBody: 'Livo vous préviendra quand une échéance approche.'
  },
  nl: {
    today: 'vandaag', tomorrow: 'morgen', yesterday: 'sinds gisteren verlopen', overdue: '{n} dagen te laat',
    days: 'over {n} dagen', months: 'over {n} maanden', years: 'over {n} jaar', dueOn: 'uiterlijk {date}', clock: ' uur',
    many: '{n} deadlines vragen je aandacht', more: '… en nog {n}',
    soon: 'Begint over {n} minuten · {time}', soon1: 'Begint over 1 minuut · {time}', now: 'Nu · {time}',
    testTitle: '✓ Herinneringen staan aan', testBody: 'Livo laat van zich horen als een deadline dichterbij komt.'
  },
  pt: {
    today: 'vence hoje', tomorrow: 'vence amanhã', yesterday: 'venceu ontem', overdue: 'atrasado há {n} dias',
    days: 'daqui a {n} dias', months: 'daqui a {n} meses', years: 'daqui a {n} anos', dueOn: 'vence em {date}', clock: '',
    many: '{n} prazos precisam da sua atenção', more: '… e mais {n}',
    soon: 'Começa daqui a {n} minutos · {time}', soon1: 'Começa daqui a 1 minuto · {time}', now: 'Agora · {time}',
    testTitle: '✓ Lembretes ativos', testBody: 'O Livo avisa quando um prazo se aproximar.'
  },
  tr: {
    today: 'bugün', tomorrow: 'yarın', yesterday: 'dün geçti', overdue: '{n} gün geçti',
    days: '{n} gün sonra', months: '{n} ay sonra', years: '{n} yıl sonra', dueOn: 'son tarih {date}', clock: '',
    many: '{n} tarih ilgini bekliyor', more: '… ve {n} tane daha',
    soon: '{n} dakika sonra başlıyor · {time}', soon1: '1 dakika sonra başlıyor · {time}', now: 'Şimdi · {time}',
    testTitle: '✓ Hatırlatmalar açık', testBody: 'Bir tarih yaklaştığında Livo haber verir.'
  },
  pl: {
    today: 'dziś', tomorrow: 'jutro', yesterday: 'minął wczoraj', overdue: '{n} dni po terminie',
    days: 'za {n} dni', months: 'za {n} miesięcy', 'months.few': 'za {n} miesiące', years: 'za {n} lat', 'years.few': 'za {n} lata',
    dueOn: 'termin {date}', clock: '',
    many: '{n} terminów wymaga twojej uwagi', 'many.few': '{n} terminy wymagają twojej uwagi', more: '… i {n} więcej',
    soon: 'Zaczyna się za {n} minut · {time}', 'soon.few': 'Zaczyna się za {n} minuty · {time}', soon1: 'Zaczyna się za 1 minutę · {time}', now: 'Teraz · {time}',
    testTitle: '✓ Przypomnienia są włączone', testBody: 'Livo da znać, gdy zbliży się termin.'
  }
};
// Polnisch: 2–4, 22–24 … haben eine eigene Mehrzahl ("za 3 miesiące", aber "za 5 miesięcy")
function fewForm(n: number): boolean {
  const a = Math.abs(n) % 10, b = Math.abs(n) % 100;
  return a >= 2 && a <= 4 && (b < 12 || b > 14);
}
function tx(lang: string | undefined, key: string, vars: Record<string, string | number> = {}): string {
  const table = TEXT[lang ?? ''] ?? TEXT.en;
  const k = typeof vars.n === 'number' && table[`${key}.few`] && fewForm(vars.n) ? `${key}.few` : key;
  const s = table[k] ?? TEXT.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (m, name) => (vars[name] != null ? String(vars[name]) : m));
}
type Deadline = { id: string; user_id: string; title: string; due: string; due_time: string | null; lead_days: number; notified_for: string | null };
type SoonRow = { id: string; user_id: string; title: string; due: string; due_time: string; remind_min: number; tz: string | null; time_notified_for: string | null };
type Payload = { title: string; body: string; tag: string; url: string; urgency?: string };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

// --- Datum: "JJJJ-MM-TT", gerechnet in UTC, "heute" in deutscher Zeit -----------
function berlinToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}
// Deutsch "31.03.2027", Englisch "31 Mar 2027" (eindeutig, egal ob das Handy Tag oder Monat
// zuerst schreibt), die anderen Sprachen in ihrer üblichen Schreibweise ("31/03/2027", "31-03-2027" …)
const DATE_LOCALES: Record<string, string> = {
  it: 'it-IT', el: 'el-GR', es: 'es-ES', fr: 'fr-FR', nl: 'nl-NL', pt: 'pt-PT', tr: 'tr-TR', pl: 'pl-PL'
};
function fmt(iso: string, lang?: string): string {
  const [y, m, d] = iso.split('-');
  if (lang === 'de') return `${d}.${m}.${y}`;
  const date = new Date(`${iso}T00:00:00Z`);
  const locale = DATE_LOCALES[lang ?? ''];
  if (locale) return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(date);
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}
// Gleiche Texte wie in der App (whenText in app.js)
function whenText(days: number, lang?: string): string {
  if (days === 0) return tx(lang, 'today');
  if (days === 1) return tx(lang, 'tomorrow');
  if (days === -1) return tx(lang, 'yesterday');
  if (days < 0) return tx(lang, 'overdue', { n: -days });
  if (days <= 60) return tx(lang, 'days', { n: days });
  const months = Math.round(days / 30.44);
  if (months < 24) return tx(lang, 'months', { n: months });
  return tx(lang, 'years', { n: Math.round(days / 365.25) });
}

// --- Web Push: RFC 8291 + RFC 8292, wie staff-push in Smart Menu -----------------
const encoder = new TextEncoder();

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

async function hkdf(salt: Uint8Array, secret: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

// Die Nachricht als ein einziger aes128gcm-Record für ein Abo (RFC 8291)
async function encryptPayload(plaintext: Uint8Array, uaPublic: Uint8Array, authSecret: Uint8Array): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, keys.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdhSecret, concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // 0x02 = Trennzeichen des letzten (hier einzigen) Records
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, concat(plaintext, new Uint8Array([2]))));
  // Kopf: Salt, Record-Größe 4096, dann unser einmaliger öffentlicher Schlüssel
  const header = new Uint8Array(21);
  header.set(salt);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, ciphertext);
}

// RFC 8292: kurzlebiges JWT für den Push-Dienst, signiert mit dem Schlüsselpaar,
// mit dem der Browser abonniert hat (VAPID_PUBLIC_KEY in push.js)
async function vapidAuthorization(endpoint: string): Promise<string> {
  const point = fromBase64Url(VAPID.publicKey);
  const jwk = { kty: 'EC', crv: 'P-256', x: toBase64Url(point.slice(1, 33)), y: toBase64Url(point.slice(33, 65)), d: VAPID.privateKey };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const segment = (value: unknown) => toBase64Url(encoder.encode(JSON.stringify(value)));
  const unsigned = `${segment({ typ: 'JWT', alg: 'ES256' })}.${segment({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID.subject })}`;
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(unsigned)));
  return `vapid t=${unsigned}.${toBase64Url(signature)}, k=${VAPID.publicKey}`;
}

// HTTP-Status des Push-Dienstes (201 = angenommen), 0 wenn nicht erreichbar
async function sendPush(target: Sub, payload: Payload): Promise<number> {
  try {
    const body = await encryptPayload(encoder.encode(JSON.stringify(payload)), fromBase64Url(target.p256dh), fromBase64Url(target.auth_key));
    const response = await fetch(target.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidAuthorization(target.endpoint),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(payload.urgency === 'high' ? 3600 : TTL_SECONDS),
        Urgency: payload.urgency === 'high' ? 'high' : 'normal'
      },
      body
    });
    await response.body?.cancel();
    return response.status;
  } catch {
    return 0;
  }
}
// --- Ende Web Push ----------------------------------------------------------------

function validEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && PUSH_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

// An alle Geräte eines Nutzers; abgemeldete oder ungültige Geräte werden vergessen.
// Ergebnis: wie viele Geräte die Nachricht angenommen haben.
async function deliver(targets: Sub[], payload: Payload): Promise<number> {
  let ok = 0;
  for (const target of targets) {
    if (!validEndpoint(target.endpoint)) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', target.endpoint);
      continue;
    }
    const status = await sendPush(target, payload);
    if (status >= 200 && status < 300) ok++;
    else if (status === 404 || status === 410) await supabase.from('push_subscriptions').delete().eq('endpoint', target.endpoint);
  }
  return ok;
}

// Liest alle Zeilen, auch über die 1000er-Grenze der API hinaus
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

function messageFor(list: Deadline[], today: string, lang?: string): Payload {
  list.sort((a, b) => a.due.localeCompare(b.due));
  if (list.length === 1) {
    const d = list[0];
    const when = whenText(daysBetween(today, d.due), lang);
    const clock = d.due_time ? `, ${d.due_time.slice(0, 5)}${tx(lang, 'clock')}` : '';
    return {
      title: d.title,
      body: `${when.charAt(0).toUpperCase()}${when.slice(1)} · ${tx(lang, 'dueOn', { date: fmt(d.due, lang) })}${clock}`,
      tag: `livo-${d.id}`,
      url: APP_URL
    };
  }
  const lines = list.slice(0, 4).map((d) => `${d.title} – ${whenText(daysBetween(today, d.due), lang)}`);
  if (list.length > 4) lines.push(tx(lang, 'more', { n: list.length - 4 }));
  return { title: tx(lang, 'many', { n: list.length }), body: lines.join('\n'), tag: 'livo-daily', url: APP_URL };
}

// Nur wer in der Testphase ist oder Livo Plus hat (gleiche Regel wie 0002_trial.sql)
async function eligibleUsers(today: string): Promise<Set<string>> {
  const [plus, trial] = await Promise.all([
    fetchAll<{ user_id: string }>((a, b) => supabase.from('plans').select('user_id').gte('plus_until', today).order('user_id').range(a, b)),
    fetchAll<{ user_id: string }>((a, b) => supabase.from('usage').select('user_id').gte('trial_started', addDays(today, -TRIAL_DAYS)).order('user_id').range(a, b))
  ]);
  return new Set([...plus, ...trial].map((row) => row.user_id));
}

async function subscriptionsOf(userIds: string[]): Promise<Sub[]> {
  const subs: Sub[] = [];
  for (let i = 0; i < userIds.length; i += 100) {
    const { data } = await supabase.from('push_subscriptions').select(SUB_COLUMNS).in('user_id', userIds.slice(i, i + 100));
    subs.push(...((data ?? []) as Sub[]));
  }
  return subs;
}

// Datum + Uhrzeit in einer Zeitzone (z. B. "2026-11-03", "10:00", "Europe/Berlin") als UTC-Millisekunden
function zonedToUtc(date: string, time: string, tz: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let zone = tz;
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); } catch { zone = 'Europe/Berlin'; }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(new Date(guess));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const shownThere = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return guess - (shownThere - guess);
}

// Kurz vor Terminen mit Uhrzeit. Fenster: ab "remind_min vorher" bis 15 Minuten nach
// Beginn, falls ein Lauf ausgefallen ist - danach hilft die Nachricht nicht mehr.
async function runSoon() {
  const now = Date.now();
  const today = berlinToday();
  const { data, error } = await supabase.from('deadlines')
    .select('id, user_id, title, due, due_time, remind_min, tz, time_notified_for')
    .not('due_time', 'is', null).not('remind_min', 'is', null)
    .gte('due', addDays(today, -1)).lte('due', addDays(today, 2));
  if (error) throw error;
  const candidates = ((data ?? []) as SoonRow[]).filter((row) => {
    const key = `${row.due} ${row.due_time.slice(0, 5)}`;
    if (row.time_notified_for === key) return false;
    const at = zonedToUtc(row.due, row.due_time, row.tz || 'Europe/Berlin');
    return now >= at - row.remind_min * 60000 && now <= at + 15 * 60000;
  });
  if (!candidates.length) return { soon: 0 };
  const eligible = await eligibleUsers(today);
  const rows = candidates.filter((row) => eligible.has(row.user_id));
  const subs = await subscriptionsOf([...new Set(rows.map((row) => row.user_id))]);
  let sent = 0;
  for (const row of rows) {
    const targets = subs.filter((sub) => sub.user_id === row.user_id);
    if (!targets.length) continue;
    const at = zonedToUtc(row.due, row.due_time, row.tz || 'Europe/Berlin');
    const minutes = Math.round((at - now) / 60000);
    const time = row.due_time.slice(0, 5);
    const lang = targets[0].lang;
    const clock = time + tx(lang, 'clock');
    const body = minutes > 1 ? tx(lang, 'soon', { n: minutes, time: clock }) : minutes === 1 ? tx(lang, 'soon1', { time: clock }) : tx(lang, 'now', { time: clock });
    const ok = await deliver(targets, { title: row.title, body, tag: `livo-soon-${row.id}`, url: APP_URL, urgency: 'high' });
    if (!ok) continue;
    sent++;
    await supabase.from('deadlines').update({ time_notified_for: `${row.due} ${time}` }).eq('id', row.id);
  }
  return { soon: sent };
}

async function runReminders() {
  const today = berlinToday();
  const eligible = await eligibleUsers(today);
  if (!eligible.size) return { today, users: 0, devices: 0, deadlines: 0 };

  const rows = await fetchAll<Deadline>((a, b) => supabase.from('deadlines')
    .select('id, user_id, title, due, due_time, lead_days, notified_for')
    .lte('due', addDays(today, 366)).order('id').range(a, b));
  const byUser = new Map<string, Deadline[]>();
  for (const row of rows) {
    if (!eligible.has(row.user_id) || row.notified_for === row.due || addDays(row.due, -row.lead_days) > today) continue;
    byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);
  }

  const subs = await subscriptionsOf([...byUser.keys()]);

  let users = 0, devices = 0, deadlines = 0;
  for (const [userId, list] of byUser) {
    const targets = subs.filter((sub) => sub.user_id === userId);
    // Ohne Gerät noch nichts abhaken - die Erinnerung kommt, sobald Push an ist.
    if (!targets.length) continue;
    const ok = await deliver(targets, messageFor(list, today, targets[0].lang));
    if (!ok) continue;
    users++;
    devices += ok;
    deadlines += list.length;
    await Promise.all(list.map((d) => supabase.from('deadlines').update({ notified_for: d.due }).eq('id', d.id)));
  }
  return { today, users, devices, deadlines };
}

// --- Hinweise zum Ende der Testphase ------------------------------------------------
// Stufe 1 "endet in n Tagen" (ab 7 Tage vorher), 2 "endet heute", 3 "ist vorbei" (bis 3 Tage
// danach) - als Push an alle Geräte und als E-Mail an gesicherte Konten. usage.trial_notice
// (0008_trial_notice.sql) merkt sich die zuletzt verschickte Stufe: jede kommt höchstens einmal,
// nach einem ausgefallenen Lauf nur die aktuelle. Wer Livo Plus hat, bekommt nichts. Erreicht
// weder Push noch E-Mail jemanden, wird nichts abgehakt - der Hinweis kommt, sobald Push an ist.
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const MAIL_FROM = 'Livo <hallo@heylivo.com>';
const MAIL_REPLY_TO = 'hallo@heylivo.com';
const PLUS_URL = `${APP_URL}?show=plus`;
const NOTICE_DAYS_BEFORE = 7;
const NOTICE_DAYS_AFTER = 3;
const NBSP = String.fromCharCode(160);

// Texte je App-Sprache (die lokale Vorschau der Mails liest diesen Block mit)
// <trial-text>
const TRIAL_TEXT: Record<string, Record<string, string>> = {
  de: {
    endsIn: 'Deine Testphase endet in {n} Tagen', endsTomorrow: 'Deine Testphase endet morgen',
    endsToday: 'Deine Testphase endet heute', over: 'Deine Testphase ist vorbei',
    overSubject: 'Deine Testphase ist vorbei – Erinnerungen pausieren',
    push1: 'Mit Livo Plus geht alles weiter – 11,99 € für ein Jahr, kein Abo.',
    push2: 'Ab morgen erinnert dich Livo nur noch mit Livo Plus – 11,99 € für ein Jahr.',
    push3: 'Deine Fristen sind noch da, aber Erinnerungen pausieren. Mit Livo Plus geht es weiter.',
    hi: 'Hallo!',
    mail1: 'Deine kostenlose Testphase bei heylivo endet am {date}. Danach bleiben deine Fristen gespeichert und du kannst sie weiter ansehen. Neue Fristen, Änderungen und Erinnerungen gibt es dann nur noch mit Livo Plus.',
    mail2: 'Heute ist der letzte Tag deiner kostenlosen Testphase bei heylivo. Ab morgen erinnert dich Livo nur noch mit Livo Plus an deine Fristen. Deine Fristen bleiben gespeichert.',
    mail3: 'Deine kostenlose Testphase bei heylivo ist vorbei. Deine Fristen sind weiter gespeichert und du kannst sie ansehen. Erinnerungen bekommst du aber erst wieder mit Livo Plus – verlass dich bis dahin bitte nicht darauf, dass Livo sich meldet.',
    plus: 'Livo Plus: 11,99 € inkl. MwSt. für ein ganzes Jahr – einmal zahlen, kein Abo, keine Kündigung.',
    button: 'Livo Plus ansehen',
    footer: 'Du bekommst diese E-Mail, weil du dein heylivo-Konto mit dieser Adresse gesichert hast. Keine Hinweise zur Testphase mehr? Antworte einfach auf diese E-Mail.'
  },
  en: {
    endsIn: 'Your trial ends in {n} days', endsTomorrow: 'Your trial ends tomorrow',
    endsToday: 'Your trial ends today', over: 'Your trial is over',
    overSubject: 'Your trial is over – reminders are paused',
    push1: 'Livo Plus keeps everything going – €11.99 for a year, no subscription.',
    push2: 'From tomorrow, Livo only reminds you with Livo Plus – €11.99 for a year.',
    push3: 'Your deadlines are still there, but reminders are paused. Livo Plus keeps you going.',
    hi: 'Hi!',
    mail1: 'Your free heylivo trial ends on {date}. After that, your deadlines stay saved and you can still view them. Adding, changing and reminders are then only available with Livo Plus.',
    mail2: 'Today is the last day of your free heylivo trial. From tomorrow, Livo only reminds you of your deadlines with Livo Plus. Your deadlines stay saved.',
    mail3: "Your free heylivo trial is over. Your deadlines are still saved and you can view them. But reminders only come back with Livo Plus – so until then, please don't count on Livo getting in touch.",
    plus: 'Livo Plus: €11.99 incl. VAT for a whole year – pay once, no subscription, nothing to cancel.',
    button: 'See Livo Plus',
    footer: "You're getting this email because you secured your heylivo account with this address. No more trial notices? Just reply to this email."
  },
  it: {
    endsIn: 'La tua prova finisce tra {n} giorni', endsTomorrow: 'La tua prova finisce domani',
    endsToday: 'La tua prova finisce oggi', over: 'La tua prova è finita',
    overSubject: 'La tua prova è finita – promemoria in pausa',
    push1: 'Con Livo Plus tutto continua – 11,99 € per un anno, nessun abbonamento.',
    push2: 'Da domani Livo ti ricorda le scadenze solo con Livo Plus – 11,99 € per un anno.',
    push3: 'Le tue scadenze ci sono ancora, ma i promemoria sono in pausa. Con Livo Plus si continua.',
    hi: 'Ciao!',
    mail1: 'La tua prova gratuita di heylivo finisce il {date}. Dopo, le tue scadenze restano salvate e puoi continuare a vederle. Aggiungere, modificare e ricevere promemoria sarà possibile solo con Livo Plus.',
    mail2: "Oggi è l'ultimo giorno della tua prova gratuita di heylivo. Da domani Livo ti ricorda le tue scadenze solo con Livo Plus. Le tue scadenze restano salvate.",
    mail3: 'La tua prova gratuita di heylivo è finita. Le tue scadenze sono ancora salvate e puoi vederle. I promemoria però tornano solo con Livo Plus: fino ad allora non contare sugli avvisi di Livo.',
    plus: 'Livo Plus: 11,99 € IVA inclusa per un anno intero – paghi una volta, nessun abbonamento, nessuna disdetta.',
    button: 'Scopri Livo Plus',
    footer: 'Ricevi questa email perché hai protetto il tuo account heylivo con questo indirizzo. Non vuoi più avvisi sulla prova? Rispondi semplicemente a questa email.'
  },
  el: {
    endsIn: 'Η δοκιμή σου τελειώνει σε {n} μέρες', endsTomorrow: 'Η δοκιμή σου τελειώνει αύριο',
    endsToday: 'Η δοκιμή σου τελειώνει σήμερα', over: 'Η δοκιμή σου τελείωσε',
    overSubject: 'Η δοκιμή σου τελείωσε – οι υπενθυμίσεις σταματούν',
    push1: 'Με το Livo Plus όλα συνεχίζουν – 11,99 € για έναν χρόνο, χωρίς συνδρομή.',
    push2: 'Από αύριο το Livo σού θυμίζει τις προθεσμίες μόνο με το Livo Plus – 11,99 € για έναν χρόνο.',
    push3: 'Οι προθεσμίες σου είναι ακόμα εδώ, αλλά οι υπενθυμίσεις σταματούν. Με το Livo Plus συνεχίζεις.',
    hi: 'Γεια σου!',
    mail1: 'Η δωρεάν δοκιμή σου στο heylivo τελειώνει στις {date}. Μετά οι προθεσμίες σου μένουν αποθηκευμένες και μπορείς να τις βλέπεις. Νέες καταχωρίσεις, αλλαγές και υπενθυμίσεις θα υπάρχουν μόνο με το Livo Plus.',
    mail2: 'Σήμερα είναι η τελευταία μέρα της δωρεάν δοκιμής σου στο heylivo. Από αύριο το Livo σού θυμίζει τις προθεσμίες σου μόνο με το Livo Plus. Οι προθεσμίες σου μένουν αποθηκευμένες.',
    mail3: 'Η δωρεάν δοκιμή σου στο heylivo τελείωσε. Οι προθεσμίες σου είναι ακόμα αποθηκευμένες και μπορείς να τις βλέπεις. Υπενθυμίσεις όμως θα παίρνεις ξανά μόνο με το Livo Plus – μέχρι τότε μη βασίζεσαι στις ειδοποιήσεις του Livo.',
    plus: 'Livo Plus: 11,99 € με ΦΠΑ για έναν ολόκληρο χρόνο – πληρώνεις μία φορά, χωρίς συνδρομή, χωρίς ακύρωση.',
    button: 'Δες το Livo Plus',
    footer: 'Λαμβάνεις αυτό το email επειδή δημιούργησες λογαριασμό στο heylivo με αυτή τη διεύθυνση. Δεν θέλεις άλλες ειδοποιήσεις για τη δοκιμή; Απλώς απάντησε σε αυτό το email.'
  },
  es: {
    endsIn: 'Tu prueba termina en {n} días', endsTomorrow: 'Tu prueba termina mañana',
    endsToday: 'Tu prueba termina hoy', over: 'Tu prueba ha terminado',
    overSubject: 'Tu prueba ha terminado – avisos en pausa',
    push1: 'Con Livo Plus todo sigue – 11,99 € por un año, sin suscripción.',
    push2: 'Desde mañana, Livo solo te avisa con Livo Plus – 11,99 € por un año.',
    push3: 'Tus plazos siguen ahí, pero los avisos están en pausa. Con Livo Plus sigues adelante.',
    hi: '¡Hola!',
    mail1: 'Tu prueba gratuita de heylivo termina el {date}. Después, tus plazos siguen guardados y puedes seguir viéndolos. Añadir, cambiar y recibir avisos solo será posible con Livo Plus.',
    mail2: 'Hoy es el último día de tu prueba gratuita de heylivo. Desde mañana, Livo solo te avisa de tus plazos con Livo Plus. Tus plazos siguen guardados.',
    mail3: 'Tu prueba gratuita de heylivo ha terminado. Tus plazos siguen guardados y puedes verlos. Pero solo volverás a recibir avisos con Livo Plus: hasta entonces, no cuentes con que Livo te avise.',
    plus: 'Livo Plus: 11,99 € IVA incluido por un año entero – pagas una vez, sin suscripción, sin cancelaciones.',
    button: 'Ver Livo Plus',
    footer: 'Recibes este correo porque aseguraste tu cuenta de heylivo con esta dirección. ¿No quieres más avisos sobre la prueba? Simplemente responde a este correo.'
  },
  fr: {
    endsIn: 'Votre essai se termine dans {n} jours', endsTomorrow: 'Votre essai se termine demain',
    endsToday: "Votre essai se termine aujourd'hui", over: 'Votre essai est terminé',
    overSubject: 'Votre essai est terminé – rappels en pause',
    push1: 'Avec Livo Plus, tout continue – 11,99 € pour un an, sans abonnement.',
    push2: "Dès demain, Livo ne vous rappelle vos échéances qu'avec Livo Plus – 11,99 € pour un an.",
    push3: 'Vos échéances sont toujours là, mais les rappels sont en pause. Avec Livo Plus, tout continue.',
    hi: 'Bonjour,',
    mail1: 'Votre essai gratuit de heylivo se termine le {date}. Ensuite, vos échéances restent enregistrées et consultables. Pour en ajouter, les modifier et recevoir des rappels, il vous faudra Livo Plus.',
    mail2: "Aujourd'hui est le dernier jour de votre essai gratuit de heylivo. Dès demain, Livo ne vous rappelle vos échéances qu'avec Livo Plus. Vos échéances restent enregistrées.",
    mail3: "Votre essai gratuit de heylivo est terminé. Vos échéances restent enregistrées et consultables. Mais vous ne recevrez de nouveau des rappels qu'avec Livo Plus : d'ici là, ne comptez pas sur Livo pour vous prévenir.",
    plus: 'Livo Plus : 11,99 € TTC pour une année entière – un seul paiement, sans abonnement, sans résiliation.',
    button: 'Découvrir Livo Plus',
    footer: "Vous recevez cet e-mail parce que vous avez sécurisé votre compte heylivo avec cette adresse. Vous ne souhaitez plus d'informations sur l'essai ? Répondez simplement à cet e-mail."
  },
  nl: {
    endsIn: 'Je proefperiode eindigt over {n} dagen', endsTomorrow: 'Je proefperiode eindigt morgen',
    endsToday: 'Je proefperiode eindigt vandaag', over: 'Je proefperiode is voorbij',
    overSubject: 'Je proefperiode is voorbij – herinneringen op pauze',
    push1: 'Met Livo Plus gaat alles gewoon door – € 11,99 per jaar, geen abonnement.',
    push2: 'Vanaf morgen herinnert Livo je alleen nog met Livo Plus – € 11,99 per jaar.',
    push3: 'Je deadlines zijn er nog, maar herinneringen staan op pauze. Met Livo Plus ga je verder.',
    hi: 'Hoi!',
    mail1: 'Je gratis proefperiode bij heylivo eindigt op {date}. Daarna blijven je deadlines bewaard en kun je ze blijven bekijken. Toevoegen, wijzigen en herinneringen krijgen kan dan alleen nog met Livo Plus.',
    mail2: 'Vandaag is de laatste dag van je gratis proefperiode bij heylivo. Vanaf morgen herinnert Livo je alleen nog met Livo Plus aan je deadlines. Je deadlines blijven bewaard.',
    mail3: 'Je gratis proefperiode bij heylivo is voorbij. Je deadlines zijn nog bewaard en je kunt ze bekijken. Herinneringen krijg je pas weer met Livo Plus – reken er tot dan dus niet op dat Livo zich meldt.',
    plus: 'Livo Plus: € 11,99 incl. btw voor een heel jaar – één keer betalen, geen abonnement, niets opzeggen.',
    button: 'Bekijk Livo Plus',
    footer: 'Je krijgt deze e-mail omdat je je heylivo-account met dit adres hebt beveiligd. Geen berichten meer over de proefperiode? Beantwoord deze e-mail gewoon.'
  },
  pt: {
    endsIn: 'O seu teste termina daqui a {n} dias', endsTomorrow: 'O seu teste termina amanhã',
    endsToday: 'O seu teste termina hoje', over: 'O seu teste terminou',
    overSubject: 'O seu teste terminou – lembretes em pausa',
    push1: 'Com o Livo Plus tudo continua – 11,99 € por um ano, sem subscrição.',
    push2: 'A partir de amanhã, o Livo só lhe lembra os prazos com o Livo Plus – 11,99 € por um ano.',
    push3: 'Os seus prazos continuam aqui, mas os lembretes estão em pausa. Com o Livo Plus, tudo continua.',
    hi: 'Olá!',
    mail1: 'O seu teste gratuito do heylivo termina a {date}. Depois disso, os seus prazos continuam guardados e pode continuar a vê-los. Adicionar, alterar e receber lembretes só será possível com o Livo Plus.',
    mail2: 'Hoje é o último dia do seu teste gratuito do heylivo. A partir de amanhã, o Livo só lhe lembra os seus prazos com o Livo Plus. Os seus prazos continuam guardados.',
    mail3: 'O seu teste gratuito do heylivo terminou. Os seus prazos continuam guardados e pode vê-los. Mas só voltará a receber lembretes com o Livo Plus – até lá, não conte com os avisos do Livo.',
    plus: 'Livo Plus: 11,99 € com IVA por um ano inteiro – paga uma vez, sem subscrição, sem cancelamentos.',
    button: 'Ver o Livo Plus',
    footer: 'Recebe este e-mail porque protegeu a sua conta heylivo com este endereço. Não quer mais avisos sobre o teste? Basta responder a este e-mail.'
  },
  tr: {
    endsIn: 'Deneme süren {n} gün sonra bitiyor', endsTomorrow: 'Deneme süren yarın bitiyor',
    endsToday: 'Deneme süren bugün bitiyor', over: 'Deneme süren bitti',
    overSubject: 'Deneme süren bitti – hatırlatmalar duraklatıldı',
    push1: 'Livo Plus ile her şey devam eder – yılda 11,99 €, abonelik yok.',
    push2: 'Yarından itibaren Livo sana yalnızca Livo Plus ile hatırlatır – yılda 11,99 €.',
    push3: 'Tarihlerin hâlâ duruyor ama hatırlatmalar duraklatıldı. Livo Plus ile devam edebilirsin.',
    hi: 'Merhaba!',
    mail1: "heylivo'daki ücretsiz deneme süren {date} tarihinde bitiyor. Sonrasında tarihlerin kayıtlı kalır ve onları görmeye devam edebilirsin. Ekleme, değiştirme ve hatırlatmalar ise yalnızca Livo Plus ile mümkün olur.",
    mail2: "Bugün heylivo'daki ücretsiz deneme sürenin son günü. Yarından itibaren Livo tarihlerini sana yalnızca Livo Plus ile hatırlatır. Tarihlerin kayıtlı kalır.",
    mail3: "heylivo'daki ücretsiz deneme süren bitti. Tarihlerin hâlâ kayıtlı ve onları görebilirsin. Ama hatırlatmaları ancak Livo Plus ile yeniden alırsın – o zamana kadar Livo'nun sana haber vermesine güvenme.",
    plus: 'Livo Plus: Tam bir yıl için KDV dahil 11,99 € – bir kez öde, abonelik yok, iptal yok.',
    button: "Livo Plus'a göz at",
    footer: 'Bu e-postayı, heylivo hesabını bu adresle güvenceye aldığın için alıyorsun. Deneme süresiyle ilgili başka bildirim istemiyor musun? Bu e-postayı yanıtlaman yeterli.'
  },
  pl: {
    endsIn: 'Twój okres próbny kończy się za {n} dni', endsTomorrow: 'Twój okres próbny kończy się jutro',
    endsToday: 'Twój okres próbny kończy się dziś', over: 'Twój okres próbny się skończył',
    overSubject: 'Twój okres próbny się skończył – przypomnienia wstrzymane',
    push1: 'Z Livo Plus wszystko działa dalej – 11,99 € za rok, bez subskrypcji.',
    push2: 'Od jutra Livo przypomina o terminach tylko z Livo Plus – 11,99 € za rok.',
    push3: 'Twoje terminy nadal są zapisane, ale przypomnienia są wstrzymane. Z Livo Plus działasz dalej.',
    hi: 'Cześć!',
    mail1: 'Twój bezpłatny okres próbny w heylivo kończy się {date}. Potem twoje terminy zostają zapisane i nadal możesz je przeglądać. Dodawanie, zmiany i przypomnienia będą dostępne tylko z Livo Plus.',
    mail2: 'Dziś jest ostatni dzień twojego bezpłatnego okresu próbnego w heylivo. Od jutra Livo przypomina o twoich terminach tylko z Livo Plus. Twoje terminy zostają zapisane.',
    mail3: 'Twój bezpłatny okres próbny w heylivo się skończył. Twoje terminy są nadal zapisane i możesz je przeglądać. Przypomnienia dostaniesz jednak dopiero z Livo Plus – do tego czasu nie licz na to, że Livo się odezwie.',
    plus: 'Livo Plus: 11,99 € z VAT za cały rok – płacisz raz, bez subskrypcji, bez wypowiadania.',
    button: 'Zobacz Livo Plus',
    footer: 'Dostajesz tę wiadomość, bo twoje konto heylivo jest zabezpieczone tym adresem. Nie chcesz więcej informacji o okresie próbnym? Po prostu odpowiedz na tę wiadomość.'
  }
};
// </trial-text>

// Gleiches Aussehen wie die Code-Mails (supabase/email-templates); {name} wird ersetzt
// <trial-mail>
const TRIAL_MAIL_HTML = `<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f7fb;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f7fb;">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:460px;background:#ffffff;border:1px solid #e3e8f2;border-radius:18px;">
<tr><td style="padding:26px 28px 4px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<img src="https://heylivo.com/icon.png" width="36" height="36" alt="" style="vertical-align:middle;border:0;">
<span style="vertical-align:middle;font-size:23px;font-weight:800;letter-spacing:-0.5px;color:#0b1420;">hey<span style="color:#3062f9;">livo</span></span>
</td></tr>
<tr><td style="padding:18px 28px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:20px;font-weight:800;line-height:1.3;color:#0b1420;">{title}</td></tr>
<tr><td style="padding:12px 28px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#0b1420;">
<p style="margin:0 0 10px;">{hi}</p>
<p style="margin:0;">{text}</p>
</td></tr>
<tr><td style="padding:16px 28px 0;">
<div style="padding:12px 14px;border-radius:12px;background:#eaf0ff;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#0b1420;">{plus}</div>
</td></tr>
<tr><td align="center" style="padding:22px 28px 6px;">
<a href="{url}" style="display:inline-block;padding:13px 26px;border-radius:12px;background:#3062f9;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:800;color:#ffffff;text-decoration:none;">{button}</a>
</td></tr>
<tr><td style="padding:16px 28px 26px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#5b6475;">{footer}</td></tr>
</table>
<p style="margin:16px 0 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#8a93a6;"><a href="https://heylivo.com" style="color:#8a93a6;text-decoration:none;">heylivo.com</a></p>
</td></tr>
</table>
</body>
</html>`;
// </trial-mail>

function trialTx(lang: string | undefined, key: string, vars: Record<string, string | number> = {}): string {
  const table = TRIAL_TEXT[lang ?? ''] ?? TRIAL_TEXT.en;
  const text = (table[key] ?? TRIAL_TEXT.en[key] ?? key).replace(/\{(\w+)\}/g, (m, name) => (vars[name] != null ? String(vars[name]) : m));
  // Französisch: geschütztes Leerzeichen vor : ? ! ;
  return lang === 'fr' ? text.replace(/ ([:?!;])/g, `${NBSP}$1`) : text;
}

function trialStage(left: number): number {
  if (left >= 1 && left <= NOTICE_DAYS_BEFORE) return 1;
  if (left === 0) return 2;
  if (left < 0 && left >= -NOTICE_DAYS_AFTER) return 3;
  return 0;
}

function trialTitle(stage: number, left: number, lang?: string): string {
  if (stage === 1) return left === 1 ? trialTx(lang, 'endsTomorrow') : trialTx(lang, 'endsIn', { n: left });
  return trialTx(lang, stage === 2 ? 'endsToday' : 'over');
}

function trialPush(stage: number, left: number, lang?: string): Payload {
  return { title: trialTitle(stage, left, lang), body: trialTx(lang, `push${stage}`), tag: 'livo-trial', url: PLUS_URL };
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (c) => HTML_ESCAPES[c]);
}

type Mail = { subject: string; html: string; text: string };
function trialMail(stage: number, left: number, lastDay: string, lang?: string): Mail {
  const known = lang && TRIAL_TEXT[lang] ? lang : 'en';
  const url = `${PLUS_URL}&lang=${known}`;
  const title = trialTitle(stage, left, known);
  const parts: Record<string, string> = {
    title,
    hi: trialTx(known, 'hi'),
    text: trialTx(known, `mail${stage}`, { date: fmt(lastDay, known) }),
    plus: trialTx(known, 'plus'),
    button: trialTx(known, 'button'),
    footer: trialTx(known, 'footer')
  };
  const html = TRIAL_MAIL_HTML.replace(/\{(\w+)\}/g, (m, name) =>
    name === 'lang' ? known : name === 'url' ? url : parts[name] != null ? escapeHtml(parts[name]) : m);
  const text = `${parts.hi}\n\n${parts.text}\n\n${parts.plus}\n${parts.button}: ${url}\n\n-- \n${parts.footer}\nheylivo.com`;
  return { subject: stage === 3 ? trialTx(known, 'overSubject') : title, html, text };
}

async function sendMail(to: string, mail: Mail): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY missing - no trial mail');
    return false;
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: MAIL_FROM, to: [to], reply_to: MAIL_REPLY_TO, subject: mail.subject, html: mail.html, text: mail.text,
        // Abbestellen per Antwort-Mail, wie in der Fußzeile beschrieben
        headers: { 'List-Unsubscribe': `<mailto:${MAIL_REPLY_TO}?subject=Stop>` }
      })
    });
    if (!response.ok) console.error('Trial mail failed', response.status, await response.text());
    return response.ok;
  } catch (error) {
    console.error('Trial mail failed', error);
    return false;
  }
}

type TrialRow = { user_id: string; trial_started: string; trial_notice: number | null };

async function runTrialNotices(today: string) {
  const rows = await fetchAll<TrialRow>((a, b) => supabase.from('usage')
    .select('user_id, trial_started, trial_notice')
    .gte('trial_started', addDays(today, -TRIAL_DAYS - NOTICE_DAYS_AFTER))
    .lte('trial_started', addDays(today, NOTICE_DAYS_BEFORE - TRIAL_DAYS))
    .order('user_id').range(a, b));
  const due = rows.map((row) => {
    const lastDay = addDays(row.trial_started, TRIAL_DAYS);
    const left = daysBetween(today, lastDay);
    return { ...row, lastDay, left, stage: trialStage(left) };
  }).filter((row) => row.stage > (row.trial_notice ?? 0));
  if (!due.length) return { notices: 0, pushes: 0, mails: 0 };

  // Wer Livo Plus hat, braucht keinen Hinweis
  const plus = new Set((await fetchAll<{ user_id: string }>((a, b) => supabase.from('plans')
    .select('user_id').gte('plus_until', today).order('user_id').range(a, b))).map((row) => row.user_id));
  const open = due.filter((row) => !plus.has(row.user_id));
  const subs = await subscriptionsOf(open.map((row) => row.user_id));

  let notices = 0, pushes = 0, mails = 0;
  for (const row of open) {
    const targets = subs.filter((sub) => sub.user_id === row.user_id);
    const { data } = await supabase.auth.admin.getUserById(row.user_id);
    const user = data?.user;
    const email = user && !user.is_anonymous && user.email ? user.email : '';
    const pushed = targets.length ? await deliver(targets, trialPush(row.stage, row.left, targets[0].lang)) : 0;
    const lang = (user?.user_metadata?.lang as string | undefined) ?? targets[0]?.lang;
    const mailed = email ? await sendMail(email, trialMail(row.stage, row.left, row.lastDay, lang)) : false;
    if (!pushed && !mailed) continue;
    notices++;
    pushes += pushed;
    if (mailed) mails++;
    await supabase.from('usage').update({ trial_notice: row.stage }).eq('user_id', row.user_id);
  }
  return { notices, pushes, mails };
}

function errorText(error: unknown): string {
  return String((error as { message?: string })?.message ?? error);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!VAPID.publicKey || !VAPID.privateKey) return json({ error: 'Push is not configured.' }, 500);

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  if (body.action === 'run' || body.action === 'soon') {
    if (!CRON_SECRET || request.headers.get('x-cron-secret') !== CRON_SECRET) return json({ error: 'Not allowed.' }, 401);
    if (body.action === 'soon') {
      try {
        return json(await runSoon());
      } catch (error) {
        return json({ error: errorText(error) }, 500);
      }
    }
    // Erinnerungen und Hinweise zur Testphase getrennt - ein Fehler im einen Teil hält den anderen nicht auf
    let reminders: unknown, trial: unknown, failed = false;
    try {
      reminders = await runReminders();
    } catch (error) {
      failed = true;
      reminders = { error: errorText(error) };
    }
    try {
      trial = await runTrialNotices(berlinToday());
    } catch (error) {
      failed = true;
      trial = { error: errorText(error) };
    }
    return json({ reminders, trial }, failed ? 500 : 200);
  }

  if (body.action === 'test') {
    const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return json({ error: 'Not signed in.' }, 401);
    const { data: subs } = await supabase.from('push_subscriptions').select(SUB_COLUMNS).eq('user_id', data.user.id);
    const lang = (subs?.[0] as Sub | undefined)?.lang;
    const sent = await deliver((subs ?? []) as Sub[], {
      title: tx(lang, 'testTitle'),
      body: tx(lang, 'testBody'),
      tag: 'livo-on',
      url: APP_URL
    });
    return json({ sent });
  }

  return json({ error: 'Unknown action.' }, 400);
});
