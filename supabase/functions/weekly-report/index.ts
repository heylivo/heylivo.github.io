// heylivo: Wochenbericht für den Inhaber per E-Mail (Resend, Absender hallo@heylivo.com,
// Empfänger das Secret OWNER_EMAIL - dieselbe Adresse wie die Kaufmail von stripe-webhook).
// - POST {"action":"report"} mit Header x-cron-secret: jeden Montag per pg_cron (0013_weekly_report.sql).
//   Zählt alle Nutzer - auch die anonymen ohne E-Mail - nach Testphase, E-Mail und Livo Plus,
//   dazu die Neuen der letzten Woche (Montag bis Sonntag). Liest nur, ändert nichts.
// Gleiche Regeln wie die App (livo_guard in 0002_trial.sql) und send-reminders: Testphase =
// 30 Tage ab der ersten gespeicherten Frist (usage.trial_started), Livo Plus = plans.plus_until
// ab heute. Jedes neue Browserfenster (auch InPrivate) ist ein neuer anonymer Nutzer - eigene
// Tests zählen also mit.
// Secrets wie bei send-reminders und stripe-webhook: CRON_SECRET, RESEND_API_KEY, OWNER_EMAIL.

import { createClient, type User } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const OWNER_EMAIL = Deno.env.get('OWNER_EMAIL') ?? '';
const FROM_EMAIL = 'heylivo <hallo@heylivo.com>';
const TRIAL_DAYS = 30;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// --- Datum: "JJJJ-MM-TT", "heute" in deutscher Zeit (wie send-reminders) ----------
function berlinDate(date = new Date()): string {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
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

type Person = { email: string; date: string };
type Report = {
  today: string;
  weekFrom: string;
  weekTo: string;
  trialAnon: number; // in der Testphase, anonym (ohne E-Mail)
  trialMail: Person[]; // in der Testphase, Konto gesichert - date = letzter Testtag
  plus: Person[]; // Livo Plus läuft - date = plus_until
  overAnon: number; // Testphase vorbei, ohne Plus, anonym
  overMail: Person[]; // Testphase vorbei, ohne Plus, mit E-Mail - date = letzter Testtag
  openedOnly: number; // App geöffnet, aber noch keine Frist gespeichert
  total: number;
  endingSoon: number; // Testphase endet in den nächsten 7 Tagen
  newUsers: number; // letzte Woche zum ersten Mal geöffnet
  newTrials: number; // letzte Woche die erste Frist gespeichert
  newPlus: number; // letzte Woche Livo Plus gekauft oder verlängert
};
type PlanRow = { user_id: string; plus_until: string | null; email: string | null; updated_at: string };

async function collect(today: string): Promise<Report> {
  const users: User[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  const usage = new Map((await fetchAll<{ user_id: string; trial_started: string | null }>((a, b) =>
    supabase.from('usage').select('user_id, trial_started').order('user_id').range(a, b)))
    .map((row) => [row.user_id, row.trial_started] as const));
  // updated_at schreibt nur stripe-webhook, bei jedem Kauf
  const plans = new Map((await fetchAll<PlanRow>((a, b) =>
    supabase.from('plans').select('user_id, plus_until, email, updated_at').order('user_id').range(a, b)))
    .map((row) => [row.user_id, row] as const));

  // Letzte Woche = die 7 Tage vor heute (Montag bis Sonntag, wenn der Bericht montags kommt)
  const weekFrom = addDays(today, -7);
  const weekTo = addDays(today, -1);
  const lastWeek = (iso: string | null | undefined) => !!iso && iso >= weekFrom && iso <= weekTo;
  const report: Report = {
    today, weekFrom, weekTo, trialAnon: 0, trialMail: [], plus: [], overAnon: 0, overMail: [],
    openedOnly: 0, total: users.length, endingSoon: 0, newUsers: 0, newTrials: 0, newPlus: 0
  };
  for (const user of users) {
    const email = !user.is_anonymous && user.email ? user.email : '';
    const started = usage.get(user.id) ?? null;
    const plan = plans.get(user.id);
    if (lastWeek(berlinDate(new Date(user.created_at)))) report.newUsers++;
    if (lastWeek(started)) report.newTrials++;
    if (plan?.plus_until && plan.plus_until >= today) {
      report.plus.push({ email: email || plan.email || '-', date: plan.plus_until });
      if (lastWeek(berlinDate(new Date(plan.updated_at)))) report.newPlus++;
      continue;
    }
    if (!started) {
      report.openedOnly++;
      continue;
    }
    const lastDay = addDays(started, TRIAL_DAYS);
    if (lastDay >= today) {
      if (lastDay <= addDays(today, 6)) report.endingSoon++;
      if (email) report.trialMail.push({ email, date: lastDay });
      else report.trialAnon++;
    } else if (email) report.overMail.push({ email, date: lastDay });
    else report.overAnon++;
  }
  report.trialMail.sort((a, b) => a.date.localeCompare(b.date));
  report.plus.sort((a, b) => a.date.localeCompare(b.date));
  report.overMail.sort((a, b) => b.date.localeCompare(a.date));
  return report;
}

// --- Bericht als Betreff, HTML und Text ---------------------------------------------
// Die lokale Vorschau __preview-report.html liest diesen Block mit.
// <report-render>
const LIST_MAX = 50; // längere Listen kürzen, der Bericht soll auf einen Blick lesbar bleiben
const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}
function dateDe(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
function dayMonth(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}.${m}.`;
}
function weekday(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

function renderReport(r: Report): { subject: string; html: string; text: string } {
  const week = `${dayMonth(r.weekFrom)}–${dayMonth(r.weekTo)}`;
  const stand = `Stand ${weekday(r.today)}, ${dateDe(r.today)}`;
  const subject = `heylivo-Wochenbericht: ${r.trialAnon} testen ohne E-Mail, ${r.trialMail.length} mit E-Mail, ${r.plus.length} Plus`;
  const tiles: [string, number][] = [
    ['Testen ohne E-Mail', r.trialAnon],
    ['Testen mit E-Mail', r.trialMail.length],
    ['Livo Plus', r.plus.length]
  ];
  const over = r.overAnon + r.overMail.length;
  const sections: [string, [string, string][]][] = [
    [`Letzte Woche (${week})`, [
      ['App zum ersten Mal geöffnet', String(r.newUsers)],
      ['Erste Frist gespeichert (Testphase gestartet)', String(r.newTrials)],
      ['Livo Plus gekauft', String(r.newPlus)]
    ]],
    ['Insgesamt', [
      ['Testphase endet in den nächsten 7 Tagen', String(r.endingSoon)],
      ['Testphase vorbei, ohne Plus', r.overMail.length ? `${over} (davon ${r.overMail.length} mit E-Mail)` : String(over)],
      ['App nur geöffnet, noch keine Frist', String(r.openedOnly)],
      ['Alle Nutzer zusammen', String(r.total)]
    ]]
  ];
  const lists: [string, Person[], string][] = [
    ['Livo Plus', r.plus, 'bis'],
    ['In der Testphase mit E-Mail', r.trialMail, 'Testphase bis'],
    ['Testphase vorbei, mit E-Mail', r.overMail, 'Testphase endete am']
  ];
  const listRows = (people: Person[], prefix: string): [string, string][] => {
    const rows: [string, string][] = people.slice(0, LIST_MAX).map((p) => [p.email, `${prefix} ${dateDe(p.date)}`]);
    if (people.length > LIST_MAX) rows.push([`… und ${people.length - LIST_MAX} weitere`, '']);
    return rows;
  };
  const filled = lists.filter(([, people]) => people.length).map(([title, people, prefix]): [string, [string, string][]] => [title, listRows(people, prefix)]);

  // Hintergrund auf der Zelle selbst, damit alle Kacheln gleich hoch sind; dazwischen schmale Leerzellen
  const tileHtml = tiles.map(([label, n], i) => {
    const plus = i === tiles.length - 1;
    return (i ? '<td width="2%" style="font-size:0;line-height:0;">&nbsp;</td>' : '') +
      `<td width="32%" valign="top" style="padding:14px 6px 12px;border-radius:14px;background:${plus ? '#3062f9' : '#eaf0ff'};text-align:center;font-family:${FONT};">` +
      `<div style="font-size:30px;font-weight:800;line-height:1.1;color:${plus ? '#ffffff' : '#0b1420'};">${n}</div>` +
      // "E-Mail" nie am Bindestrich umbrechen (schmale Kacheln auf dem Handy)
      `<div style="margin-top:5px;font-size:12px;line-height:1.3;color:${plus ? '#dfe7ff' : '#5b6475'};">${escapeHtml(label).replace('E-Mail', '<span style="white-space:nowrap;">E-Mail</span>')}</div></td>`;
  }).join('');
  const cell = `padding:8px 0;border-bottom:1px solid #eef1f7;font-family:${FONT};line-height:1.35;`;
  const sectionHtml = (title: string, rows: string[]) =>
    `<tr><td style="padding:22px 24px 0;font-family:${FONT};">` +
    `<div style="font-size:12px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:#5b6475;">${escapeHtml(title)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:4px;">${rows.join('')}</table></td></tr>`;
  // Zahlen: Text links, Zahl rechts
  const numberRow = ([label, value]: [string, string]) =>
    `<tr><td style="${cell}font-size:15px;color:#0b1420;">${escapeHtml(label)}</td>` +
    `<td align="right" valign="top" style="${cell}padding-left:12px;font-size:15px;font-weight:800;color:#0b1420;white-space:nowrap;">${escapeHtml(value)}</td></tr>`;
  // Listen: Adresse oben, Datum darunter - so bleibt die Adresse auch auf dem Handy ganz
  const personRow = ([email, when]: [string, string]) =>
    `<tr><td style="${cell}"><div style="font-size:14px;color:#0b1420;word-break:break-word;">${escapeHtml(email)}</div>` +
    (when ? `<div style="margin-top:2px;font-size:13px;color:#5b6475;">${escapeHtml(when)}</div>` : '') + '</td></tr>';

  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f7fb;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f7fb;">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border:1px solid #e3e8f2;border-radius:18px;">
<tr><td style="padding:26px 24px 4px;font-family:${FONT};">
<img src="https://heylivo.com/icon.png" width="36" height="36" alt="" style="vertical-align:middle;border:0;">
<span style="vertical-align:middle;font-size:23px;font-weight:800;letter-spacing:-0.5px;color:#0b1420;">hey<span style="color:#3062f9;">livo</span></span>
</td></tr>
<tr><td style="padding:18px 24px 0;font-family:${FONT};">
<div style="font-size:20px;font-weight:800;line-height:1.3;color:#0b1420;">Wochenbericht</div>
<div style="margin-top:4px;font-size:14px;line-height:1.4;color:#5b6475;">${escapeHtml(stand)}</div>
</td></tr>
<tr><td style="padding:18px 24px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${tileHtml}</tr></table>
</td></tr>
${sections.map(([title, rows]) => sectionHtml(title, rows.map(numberRow))).join('\n')}
${filled.map(([title, rows]) => sectionHtml(title, rows.map(personRow))).join('\n')}
<tr><td style="padding:22px 24px 26px;font-family:${FONT};font-size:13px;line-height:1.5;color:#5b6475;">Eigene Tests zählen mit: Jedes neue Browserfenster ist ein neuer anonymer Nutzer. Dieser Bericht kommt jeden Montag automatisch.</td></tr>
</table>
<p style="margin:16px 0 0;font-family:${FONT};font-size:12px;color:#8a93a6;"><a href="https://heylivo.com" style="color:#8a93a6;text-decoration:none;">heylivo.com</a></p>
</td></tr>
</table>
</body>
</html>`;

  const textBlock = (title: string, rows: [string, string][]) =>
    `${title.toUpperCase()}\n` + rows.map(([label, value]) => (value ? `${label}: ${value}` : label)).join('\n');
  const text = [
    `heylivo – Wochenbericht\n${stand}`,
    tiles.map(([label, n]) => `${label}: ${n}`).join('\n'),
    ...sections.map(([title, rows]) => textBlock(title, rows)),
    ...filled.map(([title, rows]) => textBlock(title, rows)),
    '-- \nEigene Tests zählen mit: Jedes neue Browserfenster ist ein neuer anonymer Nutzer. Dieser Bericht kommt jeden Montag automatisch.\nheylivo.com'
  ].join('\n\n');
  return { subject, html, text };
}
// </report-render>

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!CRON_SECRET || request.headers.get('x-cron-secret') !== CRON_SECRET) return json({ error: 'Not allowed.' }, 401);

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  if (body.action !== 'report') return json({ error: 'Unknown action.' }, 400);
  if (!RESEND_API_KEY || !OWNER_EMAIL) return json({ error: 'RESEND_API_KEY or OWNER_EMAIL missing.' }, 500);

  try {
    const report = await collect(berlinDate());
    const mail = renderReport(report);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [OWNER_EMAIL], subject: mail.subject, html: mail.html, text: mail.text })
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error('Weekly report mail failed', response.status, detail);
      return json({ error: 'Mail failed.', status: response.status }, 502);
    }
    // Nur Zahlen zurückgeben - die Adressen stehen ausschließlich in der Mail
    return json({
      sent: true, today: report.today, trialAnon: report.trialAnon, trialMail: report.trialMail.length,
      plus: report.plus.length, openedOnly: report.openedOnly, total: report.total
    });
  } catch (error) {
    console.error('Weekly report failed', error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
