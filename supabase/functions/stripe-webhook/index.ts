// heylivo: Stripe-Webhook für Livo Plus (11,99 € inkl. MwSt. für 1 Jahr, ohne
// automatische Verlängerung).
// Gekauft wird über einen Stripe-Zahlungslink im eigenen Stripe-Konto von heylivo;
// die App hängt die Nutzer-ID als client_reference_id an. Bei einer bezahlten Sitzung
// (checkout.session.completed bzw. checkout.session.async_payment_succeeded) verlängert
// diese Funktion plans.plus_until um ein Jahr - ab heute oder ab dem alten Ende, falls
// Plus noch läuft - und schickt dem Inhaber eine kurze Mail über den Kauf (Resend,
// Absender hallo@heylivo.com). Klappt die Mail nicht, ist Plus trotzdem freigeschaltet.
// Der Käufer bekommt eine eigene Kaufbestätigung (Deutsch, wenn seine App auf Deutsch steht,
// sonst Englisch - die Vertragssprachen) mit Vertragsdaten und dem vollständigen Text der AGB
// samt Widerrufsbelehrung, frisch von heylivo.com geholt (Bestätigung auf dauerhaftem Datenträger).
// Aktionscodes (Stripe-Gutschein mit 100 % Rabatt, z. B. für Social-Media-Aktionen): Stripe meldet
// dann 0 € und payment_status "no_payment_required" - das zählt wie ein Kauf, die Mails sagen "gratis".
// Test ohne Kauf und ohne Datenbank: POST {"test":"confirmation","lang":"de"|"en"[,"free":true]} mit Header
// x-cron-secret schickt eine Probe-Bestätigung an OWNER_EMAIL (mit "free" die Fassung für einen Gratis-Code).
//
// Signaturprüfung wie in der Stripe-Doku (HMAC-SHA256 über "t.payload") mit Web Crypto,
// ohne npm-Paket. Secrets: STRIPE_WEBHOOK_SECRET (whsec_...), RESEND_API_KEY (re_...),
// OWNER_EMAIL (Empfänger der Kaufmail), CRON_SECRET (nur für den Test) und optional
// LIVO_PAYMENT_LINK_ID (plink_...) - dann zählt nur genau dieser Zahlungslink.

import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
const PAYMENT_LINK = Deno.env.get('LIVO_PAYMENT_LINK_ID') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const OWNER_EMAIL = Deno.env.get('OWNER_EMAIL') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const FROM_EMAIL = 'heylivo <hallo@heylivo.com>';
const REPLY_TO = 'hallo@heylivo.com';
const SITE = 'https://heylivo.com';
const PRICE_CENTS = 1199;
const TOLERANCE_SECONDS = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Header "t=1700000000,v1=abc…[,v1=…]" - mindestens eine v1-Signatur muss passen
async function validSignature(payload: string, header: string): Promise<boolean> {
  if (!WEBHOOK_SECRET) return false;
  let timestamp = '';
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [key, value] = part.split('=');
    if (key === 't') timestamp = value;
    if (key === 'v1' && value) signatures.push(value);
  }
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`)));
  const expected = Array.from(mac, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return signatures.some((signature) => sameText(signature, expected));
}

function berlinToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}
function addYear(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

type Session = {
  id: string; mode?: string; payment_link?: string | null; payment_status?: string; currency?: string;
  amount_total?: number; amount_subtotal?: number; total_details?: { amount_discount?: number } | null;
  client_reference_id?: string | null; customer_details?: { email?: string | null } | null;
};

function euroDe(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

// Kurze Mail an den Inhaber über einen neuen Kauf. Fehler nur protokollieren -
// Plus ist zu diesem Zeitpunkt schon freigeschaltet.
async function notifyOwner(session: Session, userId: string, plusUntil: string): Promise<void> {
  if (!RESEND_API_KEY || !OWNER_EMAIL) {
    console.error('RESEND_API_KEY or OWNER_EMAIL missing - no owner mail', session.id);
    return;
  }
  const [y, m, d] = plusUntil.split('-');
  const amount = euroDe(session.amount_total ?? 0);
  const discount = session.total_details?.amount_discount ?? 0;
  const free = (session.amount_total ?? 0) === 0 && discount > 0;
  const rows: [string, string][] = [
    ['Käufer', session.customer_details?.email ?? '-'],
    ['Betrag', amount]
  ];
  if (discount > 0) rows.push(['Rabatt (Aktionscode)', euroDe(discount)]);
  rows.push(['Livo Plus gilt bis', `${d}.${m}.${y}`], ['Konto-ID', userId], ['Stripe-Sitzung', session.id]);
  const lead = free ? 'Livo Plus per Gratis-Code eingelöst – Plus ist automatisch freigeschaltet.' : 'Neuer Kauf von Livo Plus – Plus ist automatisch freigeschaltet.';
  const subject = free ? 'Livo Plus per Gratis-Code eingelöst' : `Neuer Livo-Plus-Kauf – ${amount}`;
  const html = `<p>${escapeHtml(lead)}</p><table cellpadding="4">` +
    rows.map(([label, value]) => `<tr><td><b>${escapeHtml(label)}</b></td><td>${escapeHtml(value)}</td></tr>`).join('') + '</table>';
  const text = `${lead}\n\n` + rows.map(([label, value]) => `${label}: ${value}`).join('\n');
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [OWNER_EMAIL], subject, html, text })
    });
    if (!response.ok) console.error('Owner mail failed', session.id, response.status, await response.text());
  } catch (error) {
    console.error('Owner mail failed', session.id, error);
  }
}

// --- Kaufbestätigung an den Käufer --------------------------------------------------------------
const ENTITIES: Record<string, string> = {
  '&shy;': '', '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  '&bdquo;': '„', '&ldquo;': '“', '&rdquo;': '”', '&ndash;': '–', '&euro;': '€'
};

// Die gültige AGB-Seite als Text (Überschriften, Absätze, Aufzählungen) - ohne den Verweis auf frühere Fassungen.
// null, wenn sie nicht geladen werden kann; dann steht in der Mail nur der Link.
async function termsText(lang: 'de' | 'en'): Promise<{ version: string; text: string } | null> {
  try {
    const response = await fetch(`${SITE}/${lang === 'de' ? 'agb.html' : 'en/terms.html'}`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const main = (await response.text()).match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? '';
    const text = main
      .replace(/<(h1|h2|h3)[^>]*>/gi, '\n\n').replace(/<\/(h1|h2|h3)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n• ').replace(/<(p|div)[^>]*>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&[#a-z0-9]+;/gi, (entity) => ENTITIES[entity] ?? entity)
      .split('\n').map((line) => line.replace(/\s+/g, ' ').trim())
      .filter((line) => !/^(Frühere Fassung|Earlier version)/.test(line))
      .join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text.includes(lang === 'de' ? 'Widerrufsbelehrung' : 'Withdrawal instructions')) throw new Error('withdrawal text missing');
    const version = text.match(/(Gültig ab|Effective): ([^\n]+)/)?.[2]?.trim() ?? '';
    return { version, text };
  } catch (error) {
    console.error('Terms could not be loaded for the purchase confirmation', lang, error);
    return null;
  }
}

// AGB-Text für den HTML-Teil: echte Zeilenumbrüche (Outlook ignoriert white-space:pre-wrap) und fette Überschriften
const HEADING = /^(\d+\.\d*\s|Widerrufsbelehrung$|Widerrufsrecht$|Folgen des Widerrufs$|Muster-Widerrufsformular$|Withdrawal instructions$|Right of withdrawal$|Effects of withdrawal$|Model withdrawal form$|Allgemeine Gesch|Terms of use)/;
function termsHtml(text: string): string {
  return text.split('\n').map((line) => {
    const safe = escapeHtml(line);
    return line.length < 70 && HEADING.test(line) ? `<b>${safe}</b>` : safe;
  }).join('<br>');
}

function dateText(iso: string, lang: 'de' | 'en'): string {
  const [y, m, d] = iso.split('-');
  if (lang === 'de') return `${d}.${m}.${y}`;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

async function confirmBuyer(to: string, lang: 'de' | 'en', plusUntil: string, paidOn: string, cents: number): Promise<boolean> {
  if (!RESEND_API_KEY || !to) {
    console.error('RESEND_API_KEY or buyer email missing - no purchase confirmation');
    return false;
  }
  const de = lang === 'de';
  // 0 € = mit einem Aktionscode eingelöst (100 % Rabatt) - dann ohne "Kauf" und ohne Stripe-Quittung
  const free = cents === 0;
  const price = de ? `${(cents / 100).toFixed(2).replace('.', ',')} €` : `€${(cents / 100).toFixed(2)}`;
  const until = dateText(plusUntil, lang);
  const terms = await termsText(lang);
  const termsUrl = `${SITE}/${de ? 'agb.html' : 'en/terms.html'}`;
  const rows: [string, string][] = de ? [
    ['Produkt', 'Livo Plus für 1 Jahr'],
    ['Preis', free ? 'gratis mit Aktionscode (regulär 11,99 € inkl. MwSt.), keine automatische Verlängerung'
      : `${price} inkl. MwSt., Einmalzahlung, keine automatische Verlängerung`],
    [free ? 'Eingelöst am' : 'Gekauft am', dateText(paidOn, lang)],
    ['Livo Plus gilt bis', until],
    ['Anbieter', 'heylivo, George Tsiafitsas, Dimokritou 22, 85101 Rhodos, Griechenland, hallo@heylivo.com']
  ] : [
    ['Product', 'Livo Plus for 1 year'],
    ['Price', free ? 'free with a promo code (regular price €11.99 incl. VAT), no automatic renewal'
      : `${price} incl. VAT, one-off payment, no automatic renewal`],
    [free ? 'Redeemed on' : 'Bought on', dateText(paidOn, lang)],
    ['Livo Plus valid until', until],
    ['Provider', 'heylivo, George Tsiafitsas, Dimokritou 22, 85101 Rhodes, Greece, hallo@heylivo.com']
  ];
  const subject = de ? `${free ? 'Bestätigung' : 'Kaufbestätigung'}: Livo Plus bis ${until}` : `${free ? 'Confirmation' : 'Purchase confirmation'}: Livo Plus until ${until}`;
  const title = de ? 'Livo Plus ist aktiv ✓' : 'Livo Plus is active ✓';
  const hello = de ? 'Hallo!' : 'Hello!';
  const intro = free
    ? (de ? 'Dein Aktionscode ist eingelöst! Livo Plus ist für dein Konto freigeschaltet – ein Jahr lang, ohne Kosten. Danach endet es automatisch, du musst nichts kündigen.'
          : 'Your promo code has been redeemed! Livo Plus is now active for your account – for one year, free of charge. It ends automatically afterwards, there is nothing to cancel.')
    : (de ? 'Danke für deinen Kauf! Livo Plus ist für dein Konto freigeschaltet. Die Zahlungsquittung schickt dir unser Zahlungsdienstleister Stripe separat.'
          : 'Thank you for your purchase! Livo Plus is now active for your account. Our payment provider Stripe sends you the payment receipt separately.');
  const governed = de ? (free ? 'Für Livo Plus gelten' : 'Für diesen Kauf gelten') : (free ? 'Livo Plus is governed by' : 'This purchase is governed by');
  const termsIntro = terms
    ? (de ? `${governed} unsere Allgemeinen Geschäftsbedingungen mit Widerrufsbelehrung in der Fassung gültig ab ${terms.version}. Hier ist der vollständige Text – bitte bewahre diese E-Mail auf.`
          : `${governed} our terms of use and sale, including the withdrawal instructions, effective ${terms.version}. Here is the full text – please keep this email.`)
    : (de ? `${governed} unsere Allgemeinen Geschäftsbedingungen mit Widerrufsbelehrung: ${termsUrl}`
          : `${governed} our terms of use and sale, including the withdrawal instructions: ${termsUrl}`);
  const text = [hello, intro, rows.map(([label, value]) => `${label}: ${value}`).join('\n'), termsIntro, terms?.text ?? '', '-- \nheylivo · heylivo.com']
    .filter(Boolean).join('\n\n');
  const html = `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f7fb;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f7fb;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e8f2;border-radius:18px;">
<tr><td style="padding:26px 28px 4px;font-family:${FONT};"><img src="${SITE}/icon.png" width="36" height="36" alt="" style="vertical-align:middle;border:0;"> <span style="vertical-align:middle;font-size:23px;font-weight:800;letter-spacing:-0.5px;color:#0b1420;">hey<span style="color:#3062f9;">livo</span></span></td></tr>
<tr><td style="padding:18px 28px 0;font-family:${FONT};font-size:20px;font-weight:800;line-height:1.3;color:#0b1420;">${escapeHtml(title)}</td></tr>
<tr><td style="padding:12px 28px 0;font-family:${FONT};font-size:16px;line-height:1.5;color:#0b1420;"><p style="margin:0 0 10px;">${hello}</p><p style="margin:0;">${escapeHtml(intro)}</p></td></tr>
<tr><td style="padding:14px 28px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.map(([label, value]) =>
    `<tr><td valign="top" style="padding:6px 12px 6px 0;font-family:${FONT};font-size:14px;color:#5b6475;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:6px 0;font-family:${FONT};font-size:14px;color:#0b1420;">${escapeHtml(value)}</td></tr>`).join('')}</table></td></tr>
<tr><td style="padding:16px 28px ${terms ? '0' : '26px'};font-family:${FONT};font-size:14px;line-height:1.5;color:#0b1420;">${terms ? escapeHtml(termsIntro) : `${escapeHtml(termsIntro.replace(termsUrl, ''))}<a href="${termsUrl}" style="color:#3062f9;">${termsUrl}</a>`}</td></tr>
${terms ? `<tr><td style="padding:6px 28px 0;font-family:${FONT};font-size:12px;color:#8a93a6;">${de ? 'Zum Lesen im grauen Feld scrollen.' : 'Scroll inside the grey box to read.'}</td></tr>
<tr><td style="padding:6px 28px 26px;"><div style="max-height:155px;overflow-y:auto;padding:12px 16px;border:1px solid #e3e8f2;border-radius:12px;background:#f5f7fb;font-family:${FONT};font-size:12.5px;line-height:1.5;color:#2a3342;">${termsHtml(terms.text)}</div></td></tr>` : ''}
</table>
<p style="margin:16px 0 0;font-family:${FONT};font-size:12px;color:#8a93a6;"><a href="${SITE}" style="color:#8a93a6;text-decoration:none;">heylivo.com</a></p>
</td></tr></table>
</body></html>`;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], reply_to: REPLY_TO, subject, html, text })
    });
    if (!response.ok) console.error('Purchase confirmation failed', response.status, await response.text());
    return response.ok;
  } catch (error) {
    console.error('Purchase confirmation failed', error);
    return false;
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const payload = await request.text();

  // Probe-Kaufbestätigung an den Inhaber - kein Kauf, keine Datenbank, nur mit dem Cron-Geheimnis
  const testSecret = request.headers.get('x-cron-secret');
  if (testSecret !== null) {
    if (!CRON_SECRET || !sameText(testSecret, CRON_SECRET)) return json({ error: 'Not allowed.' }, 401);
    let test: { test?: string; lang?: string; free?: boolean } = {};
    try {
      test = JSON.parse(payload);
    } catch {
      // unten als unbekannter Test abgelehnt
    }
    if (test.test !== 'confirmation') return json({ error: 'Unknown test.' }, 400);
    const lang = test.lang === 'de' ? 'de' : 'en';
    const today = berlinToday();
    const free = test.free === true;
    return json({ test: true, lang, free, sent: await confirmBuyer(OWNER_EMAIL, lang, addYear(today), today, free ? 0 : PRICE_CENTS) });
  }

  if (!(await validSignature(payload, request.headers.get('stripe-signature') ?? ''))) return json({ error: 'Invalid signature' }, 400);

  let event: { type?: string; data?: { object?: Session } };
  try {
    event = JSON.parse(payload);
  } catch {
    return json({ error: 'Invalid payload' }, 400);
  }
  // async_payment_succeeded: Zahlarten, die erst nach dem Bezahlvorgang bestätigt werden
  const paidEvent = event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded';
  if (!paidEvent || !event.data?.object) return json({ received: true });

  const session = event.data.object;
  const userId = String(session.client_reference_id ?? '');
  // Nur Livo-Plus-Käufe: über einen Zahlungslink, in Euro, mit einer heylivo-Nutzer-ID.
  // Der Listenpreis (vor Rabatt) muss 11,99 € sein - ein Aktionscode ändert nur den Endbetrag.
  const listPrice = session.amount_subtotal ?? session.amount_total;
  const fromOurLink = PAYMENT_LINK ? session.payment_link === PAYMENT_LINK : !!session.payment_link && listPrice === PRICE_CENTS;
  if (session.mode !== 'payment' || !fromOurLink || session.currency !== 'eur' || !UUID.test(userId)) return json({ received: true, ignored: true });
  // Gratis-Code (100 % Rabatt): Stripe meldet 0 € und "no_payment_required" statt "paid"
  const freeCode = session.amount_total === 0 && (session.total_details?.amount_discount ?? 0) > 0 && session.payment_status === 'no_payment_required';
  if (session.payment_status !== 'paid' && !freeCode) return json({ received: true, ignored: 'unpaid' });

  const { data: plan } = await supabase.from('plans').select('plus_until, stripe_session_id').eq('user_id', userId).maybeSingle();
  // Stripe stellt Ereignisse manchmal doppelt zu - dieselbe Zahlung nur einmal verbuchen
  if (plan?.stripe_session_id === session.id) return json({ received: true, duplicate: true });

  const today = berlinToday();
  const start = plan?.plus_until && plan.plus_until > today ? plan.plus_until : today;
  const plusUntil = addYear(start);
  const { error } = await supabase.from('plans').upsert({
    user_id: userId,
    plus_until: plusUntil,
    stripe_session_id: session.id,
    email: session.customer_details?.email ?? null,
    updated_at: new Date().toISOString()
  });
  if (error) {
    console.error('Livo Plus could not be saved', session.id, userId, error);
    // Unbekannte Nutzer-ID: ein neuer Versuch hilft nicht - nicht endlos wiederholen lassen
    if (error.code === '23503') return json({ received: true, error: 'unknown user' });
    return json({ error: 'Could not save' }, 500);
  }
  console.log('Livo Plus activated', userId, plusUntil, session.id);
  await notifyOwner(session, userId, plusUntil);
  // Kaufbestätigung an den Käufer - Plus ist schon freigeschaltet, ein Fehler hier darf den Kauf nicht scheitern lassen
  let confirmed = false;
  try {
    const { data: buyer } = await supabase.auth.admin.getUserById(userId);
    const lang = buyer?.user?.user_metadata?.lang === 'de' ? 'de' : 'en';
    const to = session.customer_details?.email || buyer?.user?.email || '';
    confirmed = await confirmBuyer(to, lang, plusUntil, today, session.amount_total ?? PRICE_CENTS);
  } catch (error) {
    console.error('Purchase confirmation failed', session.id, error);
  }
  return json({ received: true, plusUntil, confirmed });
});
