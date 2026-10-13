// heylivo: Stripe-Webhook für Livo Plus (11,99 € inkl. MwSt. für 1 Jahr, ohne
// automatische Verlängerung).
// Gekauft wird über einen Stripe-Zahlungslink im eigenen Stripe-Konto von heylivo;
// die App hängt die Nutzer-ID als client_reference_id an. Bei einer bezahlten Sitzung
// (checkout.session.completed bzw. checkout.session.async_payment_succeeded) verlängert
// diese Funktion plans.plus_until um ein Jahr - ab heute oder ab dem alten Ende, falls
// Plus noch läuft - und schickt dem Inhaber eine kurze Mail über den Kauf (Resend,
// Absender hallo@heylivo.com). Klappt die Mail nicht, ist Plus trotzdem freigeschaltet.
//
// Signaturprüfung wie in der Stripe-Doku (HMAC-SHA256 über "t.payload") mit Web Crypto,
// ohne npm-Paket. Secrets: STRIPE_WEBHOOK_SECRET (whsec_...), RESEND_API_KEY (re_...),
// OWNER_EMAIL (Empfänger der Kaufmail) und optional LIVO_PAYMENT_LINK_ID (plink_...) -
// dann zählt nur genau dieser Zahlungslink.

import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
const PAYMENT_LINK = Deno.env.get('LIVO_PAYMENT_LINK_ID') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const OWNER_EMAIL = Deno.env.get('OWNER_EMAIL') ?? '';
const FROM_EMAIL = 'heylivo <hallo@heylivo.com>';
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
  amount_total?: number; client_reference_id?: string | null; customer_details?: { email?: string | null } | null;
};

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
  const amount = `${((session.amount_total ?? 0) / 100).toFixed(2).replace('.', ',')} €`;
  const rows: [string, string][] = [
    ['Käufer', session.customer_details?.email ?? '-'],
    ['Betrag', amount],
    ['Livo Plus gilt bis', `${d}.${m}.${y}`],
    ['Konto-ID', userId],
    ['Stripe-Sitzung', session.id]
  ];
  const html = '<p>Neuer Kauf von Livo Plus – Plus ist automatisch freigeschaltet.</p><table cellpadding="4">' +
    rows.map(([label, value]) => `<tr><td><b>${escapeHtml(label)}</b></td><td>${escapeHtml(value)}</td></tr>`).join('') + '</table>';
  const text = 'Neuer Kauf von Livo Plus – Plus ist automatisch freigeschaltet.\n\n' + rows.map(([label, value]) => `${label}: ${value}`).join('\n');
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [OWNER_EMAIL], subject: `Neuer Livo-Plus-Kauf – ${amount}`, html, text })
    });
    if (!response.ok) console.error('Owner mail failed', session.id, response.status, await response.text());
  } catch (error) {
    console.error('Owner mail failed', session.id, error);
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const payload = await request.text();
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
  // Nur Livo-Plus-Käufe: über einen Zahlungslink, in Euro, mit einer heylivo-Nutzer-ID
  const fromOurLink = PAYMENT_LINK ? session.payment_link === PAYMENT_LINK : !!session.payment_link && session.amount_total === PRICE_CENTS;
  if (session.mode !== 'payment' || !fromOurLink || session.currency !== 'eur' || !UUID.test(userId)) return json({ received: true, ignored: true });
  if (session.payment_status !== 'paid') return json({ received: true, ignored: 'unpaid' });

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
  return json({ received: true, plusUntil });
});
