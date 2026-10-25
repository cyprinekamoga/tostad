// Mejl via Resend. Anropas varje timme av databasens schema (pg_cron) för automatiska utskick:
// bokningsbekräftelse, fotorapport, omdöme på Google, betalningspåminnelse och svar till sökande.
// Administratörer skickar offerter och fakturor direkt härifrån. Utan inloggning går det bara att be
// om sin egen länk till Mina sidor eller ett nytt lösenord, och svaret avslöjar aldrig om adressen finns.
// Utan RESEND_API_KEY, eller när mejl är avstängt, skickas inget.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { bookingMail, photoReportMail, reviewMail, quoteMail, invoiceMail, applicantMail, portalLinkMail, passwordMail, urls, serviceName } from './templates.js';

const ORIGINS = ['https://tostadflytt.se', 'https://www.tostadflytt.se', 'https://tostadflytt-preview.netlify.app', 'http://localhost:4321', 'http://127.0.0.1:4321'];
const PREVIEW = /^https:\/\/[a-z0-9-]+--tostadflytt-preview\.netlify\.app$/;
const TZ = 'Europe/Stockholm';
const COMPANY = { name: 'TO Städ & Flytt' };
const DAY = 864e5;

const secretKey = (() => {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  return keys ? JSON.parse(keys).default : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
})();
const db = createClient(Deno.env.get('SUPABASE_URL')!, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

function cors(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) || PREVIEW.test(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
    Vary: 'Origin',
  };
}
const reply = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

const partsFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function zoned(when: string | number | Date) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(when)).map((x) => [x.type, x.value]));
  const hour = p.hour === '24' ? '00' : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}`, hour: Number(hour) };
}
const isEmail = (v: unknown): v is string => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) && v.length <= 254;
const placeholder = (email: string) => /\.byt-mejl@|@test\.invalid$/i.test(email);
const apiKey = () => Deno.env.get('RESEND_API_KEY') ?? '';

type Settings = Record<string, unknown> & {
  email_enabled: boolean;
  email_enabled_at: string | null;
  email_from: string;
  email: string;
  phone: string;
  bankgiro: string | null;
};

async function loadSettings() {
  const { data } = await db.from('company_settings').select('*').eq('id', 1).maybeSingle();
  return data as Settings | null;
}
const companyOf = (s: Settings) => ({ name: COMPANY.name, phone: s.phone, email: s.email, bankgiro: s.bankgiro });

/** Skickar ett mejl via Resend och loggar det. Returnerar null eller ett felmeddelande. */
async function send(
  s: Settings,
  m: { kind: string; ref_id?: string | null; customer_id?: string | null; to: string; subject: string; html: string; text: string; created_by?: string | null },
) {
  let error: string | null = null;
  let id: string | null = null;
  if (!apiKey()) error = 'Resend is not connected';
  else {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${COMPANY.name} <${s.email_from}>`, to: [m.to], reply_to: s.email, subject: m.subject, html: m.html, text: m.text }),
    });
    const body = await res.text();
    if (!res.ok) error = `Resend ${res.status}: ${body.slice(0, 300)}`;
    else id = (JSON.parse(body) as { id?: string }).id ?? null;
  }
  const { error: logError } = await db.from('email_log').insert({
    kind: m.kind,
    ref_id: m.ref_id ?? null,
    customer_id: m.customer_id ?? null,
    to_email: m.to,
    subject: m.subject.slice(0, 300),
    status: error ? 'fel' : 'skickat',
    provider_id: id,
    error: error?.slice(0, 500) ?? null,
    created_by: m.created_by ?? null,
  });
  if (logError) console.error('email_log', logError.message);
  return error;
}

async function sentRefs(kind: string, ids: string[]) {
  if (!ids.length) return new Set<string>();
  const { data } = await db.from('email_log').select('ref_id').eq('kind', kind).eq('status', 'skickat').in('ref_id', ids);
  return new Set((data ?? []).map((r) => r.ref_id as string));
}

/** Personlig länk till Mina sidor. Skapar en om kunden inte har någon och portalen inte är avstängd. */
async function portalUrl(c: { id: string; portal_token: string | null; portal_off: boolean }) {
  if (c.portal_off) return null;
  if (c.portal_token) return urls.portal(c.portal_token);
  const token = crypto.randomUUID();
  const { error } = await db.from('customers').update({ portal_token: token, portal_created_at: new Date().toISOString() }).eq('id', c.id).is('portal_token', null);
  return error ? null : urls.portal(token);
}

type Item = { kind: string; who: string; to: string | null; subject: string; skip?: string; go?: () => Promise<string | null> };

/** Alla automatiska utskick som väntar. Med go() skickas de. */
async function due(s: Settings, now: Date): Promise<Item[]> {
  const items: Item[] = [];
  const since = s.email_enabled_at ?? now.toISOString();
  const z = zoned(now);
  const company = companyOf(s);

  // Svar till sökande
  if (s.email_applicant) {
    const { data } = await db.from('applications').select('id, name, email, created_at, vacancies(title)').gte('created_at', since).order('created_at').limit(50);
    const done = await sentRefs('ansokan', (data ?? []).map((a) => a.id));
    for (const a of data ?? []) {
      if (done.has(a.id)) continue;
      // deno-lint-ignore no-explicit-any
      const mail = applicantMail({ name: a.name, title: (a as any).vacancies?.title ?? null, company });
      const ok = isEmail(a.email);
      items.push({ kind: 'Application', who: a.name, to: ok ? a.email : null, subject: mail.subject, skip: ok ? undefined : 'No valid email', go: () => send(s, { kind: 'ansokan', ref_id: a.id, to: a.email, ...mail }) });
    }
  }

  // Bokningsbekräftelse: ett mejl per jobb, eller ett för en hel serie.
  if (s.email_booking_confirm) {
    const { data } = await db
      .from('jobs')
      .select('id, series_id, service, starts_at, street, city, to_street, to_city, created_at, customers(id, name, email, kind, portal_token, portal_off), job_series(interval_weeks)')
      .eq('status', 'planerad')
      .gte('created_at', since)
      .gt('starts_at', now.toISOString())
      .not('customer_id', 'is', null)
      .order('starts_at')
      .limit(300);
    // deno-lint-ignore no-explicit-any
    const first = new Map<string, any>();
    for (const j of data ?? []) {
      const ref = j.series_id ?? j.id;
      if (!first.has(ref)) first.set(ref, j);
    }
    const done = await sentRefs('bokning', [...first.keys()]);
    for (const [ref, j] of first) {
      if (done.has(ref)) continue;
      // deno-lint-ignore no-explicit-any
      const c = (j as any).customers;
      const when = zoned(j.starts_at);
      // deno-lint-ignore no-explicit-any
      const repeatWeeks = j.series_id ? ((j as any).job_series?.interval_weeks ?? null) : null;
      const base = { kind: 'Booking confirmation', who: c?.name ?? '', subject: `Bokningsbekräftelse: ${serviceName(j.service)} ${when.date}` };
      if (c?.kind === 'company') items.push({ ...base, to: null, skip: 'Company customer' });
      else if (!isEmail(c?.email)) items.push({ ...base, to: null, skip: 'No email' });
      else
        items.push({
          ...base,
          to: c.email,
          go: async () => send(s, { kind: 'bokning', ref_id: ref, customer_id: c.id, to: c.email, ...bookingMail({ customer: c, job: j, date: when.date, time: when.time, repeatWeeks, portalUrl: await portalUrl(c), company }) }),
        });
    }
  }

  // Fotorapport samma kväll (från 19), för jobb som blev klara de senaste tre dagarna.
  if (s.email_photo_report) {
    const from = new Date(Math.max(Date.parse(since), now.getTime() - 3 * DAY)).toISOString();
    const { data } = await db
      .from('jobs')
      .select('id, service, starts_at, street, done_at, customers(id, name, email, kind, portal_token, portal_off), job_photos(path, kind, created_at)')
      .eq('status', 'klar')
      .gte('done_at', from)
      .not('customer_id', 'is', null)
      .limit(200);
    const withPhotos = (data ?? []).filter((j) => (j.job_photos ?? []).some((p: { kind: string }) => p.kind !== 'skada'));
    const done = await sentRefs('fotorapport', withPhotos.map((j) => j.id));
    for (const j of withPhotos) {
      if (done.has(j.id)) continue;
      // deno-lint-ignore no-explicit-any
      const c = (j as any).customers;
      const date = zoned(j.starts_at).date;
      const base = { kind: 'Photo report', who: c?.name ?? '', subject: `Fotorapport: ${serviceName(j.service)}${j.street ? ` ${j.street}` : ''}` };
      if (c?.kind === 'company') items.push({ ...base, to: null, skip: 'Company customer' });
      else if (!isEmail(c?.email)) items.push({ ...base, to: null, skip: 'No email' });
      else if (z.hour < 19 && zoned(j.done_at).date === z.date) items.push({ ...base, to: c.email, skip: 'Is sent at 19:00' });
      else
        items.push({
          ...base,
          to: c.email,
          go: async () => {
            const photos = (j.job_photos ?? []).filter((p: { kind: string }) => p.kind !== 'skada').sort((a: { kind: string; created_at: string }, b: { kind: string; created_at: string }) => (a.kind === b.kind ? a.created_at.localeCompare(b.created_at) : a.kind === 'efter' ? -1 : 1));
            const { data: signed } = await db.storage.from('job-photos').createSignedUrls(photos.map((p: { path: string }) => p.path), 30 * 86400);
            const links = (signed ?? []).map((x) => x.signedUrl).filter(Boolean) as string[];
            return send(s, { kind: 'fotorapport', ref_id: j.id, customer_id: c.id, to: c.email, ...photoReportMail({ customer: c, job: j, date, photos: links, portalUrl: await portalUrl(c), company }) });
          },
        });
    }
  }

  // Omdöme på Google när en faktura är betald (dagtid, högst en gång per kund och år).
  if (s.email_review && s.google_review_url) {
    const fromDate = [String(since).slice(0, 10), new Date(now.getTime() - 14 * DAY).toISOString().slice(0, 10)].sort()[1];
    const { data } = await db.from('invoices').select('id, buyer, customer_id, paid_at, customers(id, name, kind, email)').eq('kind', 'faktura').eq('status', 'betald').gte('paid_at', fromDate).limit(200);
    const done = await sentRefs('recension', (data ?? []).map((i) => i.id));
    const customerIds = [...new Set((data ?? []).map((i) => i.customer_id).filter(Boolean))] as string[];
    const recent = new Set<string>();
    if (customerIds.length) {
      const { data: logs } = await db.from('email_log').select('customer_id').eq('kind', 'recension').eq('status', 'skickat').in('customer_id', customerIds).gte('created_at', new Date(now.getTime() - 365 * DAY).toISOString());
      for (const l of logs ?? []) recent.add(l.customer_id as string);
    }
    for (const inv of data ?? []) {
      if (done.has(inv.id)) continue;
      // deno-lint-ignore no-explicit-any
      const c = (inv as any).customers;
      const to = (inv.buyer as { email?: string } | null)?.email || c?.email;
      const name = (inv.buyer as { name?: string } | null)?.name || c?.name || '';
      const base = { kind: 'Review request', who: name, subject: 'Tack! Vill du hjälpa oss med ett omdöme?' };
      if (c?.kind === 'company') items.push({ ...base, to: null, skip: 'Company customer' });
      else if (!isEmail(to)) items.push({ ...base, to: null, skip: 'No email' });
      else if (inv.customer_id && recent.has(inv.customer_id)) items.push({ ...base, to, skip: 'Already asked this year' });
      else if (z.hour < 9 || z.hour >= 20) items.push({ ...base, to, skip: 'Is sent between 9 and 20' });
      else {
        if (inv.customer_id) recent.add(inv.customer_id);
        items.push({ ...base, to, go: () => send(s, { kind: 'recension', ref_id: inv.id, customer_id: inv.customer_id, to, ...reviewMail({ name, reviewUrl: String(s.google_review_url), company }) }) });
      }
    }
  }

  // Betalningspåminnelser (dagtid): högst två, med reminder_days mellan, för fakturor skickade efter att mejl slogs på.
  if (s.email_reminders) {
    const days = Number(s.reminder_days) || 7;
    const lastDue = new Date(Date.parse(`${z.date}T12:00:00Z`) - days * DAY).toISOString().slice(0, 10);
    const { data } = await db
      .from('invoices')
      .select('id, number, kind, buyer, customer_id, to_pay, due_date, ocr, token, reminder_count, last_reminder_at, issue_date')
      .eq('kind', 'faktura')
      .eq('status', 'skickad')
      .gte('issue_date', String(since).slice(0, 10))
      .lte('due_date', lastDue)
      .lt('reminder_count', 2)
      .limit(200);
    for (const inv of data ?? []) {
      if (inv.last_reminder_at && Date.parse(inv.last_reminder_at) > now.getTime() - days * DAY) continue;
      const to = (inv.buyer as { email?: string } | null)?.email;
      const mail = invoiceMail({ doc: inv, url: urls.doc(inv.token), reminder: true, company });
      const base = { kind: `Payment reminder ${inv.reminder_count + 1}`, who: (inv.buyer as { name?: string } | null)?.name ?? '', subject: mail.subject };
      if (!isEmail(to)) items.push({ ...base, to: null, skip: 'No email on the invoice' });
      else if (z.hour < 9 || z.hour >= 18) items.push({ ...base, to, skip: 'Is sent between 9 and 18' });
      else
        items.push({
          ...base,
          to,
          go: async () => {
            const error = await send(s, { kind: 'paminnelse', ref_id: inv.id, customer_id: inv.customer_id, to, ...mail });
            if (!error) await db.from('invoices').update({ reminder_count: inv.reminder_count + 1, last_reminder_at: new Date().toISOString() }).eq('id', inv.id);
            return error;
          },
        });
    }
  }
  return items;
}

/** Enkel spärr mot missbruk av de öppna åtgärderna: högst 5 per timme och anslutning. */
async function limited(req: Request, label: string) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'okänd';
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`tostadflytt-${label}:${ip}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const { count } = await db.from('form_rate').select('id', { count: 'exact', head: true }).eq('ip_hash', hash).gte('created_at', new Date(Date.now() - 3600e3).toISOString());
  if ((count ?? 0) >= 5) return true;
  await db.from('form_rate').insert({ ip_hash: hash });
  return false;
}
const likeExact = (v: string) => v.trim().toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return reply(req, 405, { error: 'Wrong method' });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(req, 400, { error: 'Invalid request' });
  }
  const s = await loadSettings();
  if (!s) return reply(req, 500, { error: 'The settings are missing' });
  const ready = s.email_enabled && !!apiKey();
  const now = new Date();

  // Schemat varje timme.
  const cronToken = req.headers.get('x-cron-token');
  if (cronToken) {
    const { data: ok } = await db.rpc('check_cron_token', { p_token: cronToken });
    if (!ok) return reply(req, 403, { error: 'Denied' });
    if (!ready) return reply(req, 200, { skipped: s.email_enabled ? 'Resend is not connected' : 'Email is turned off' });
    let sent = 0;
    let failed = 0;
    for (const item of await due(s, now)) {
      if (item.skip || !item.go) continue;
      if (await item.go()) failed++;
      else sent++;
    }
    return reply(req, 200, { sent, failed });
  }

  // Öppna åtgärder: svaret är alltid detsamma, så att ingen kan ta reda på vilka adresser som finns.
  if (body.action === 'portal_link' || body.action === 'password') {
    if (!ready) return reply(req, 200, { ok: false, unavailable: true });
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    if (!isEmail(email)) return reply(req, 400, { error: body.action === 'password' ? 'Write your email address.' : 'Skriv din e-postadress.' });
    if (await limited(req, String(body.action))) return reply(req, 429, { error: body.action === 'password' ? 'Too many tries. Wait an hour.' : 'För många försök. Vänta en timme.' });
    const company = companyOf(s);
    if (body.action === 'portal_link') {
      const { data } = await db.from('customers').select('id, name, email, portal_token, portal_off').ilike('email', likeExact(email)).limit(3);
      for (const c of data ?? []) {
        const url = await portalUrl(c);
        if (url) await send(s, { kind: 'portallank', ref_id: c.id, customer_id: c.id, to: c.email!, ...portalLinkMail({ name: c.name, url, company }) });
      }
    } else {
      const { data: p } = await db.from('profiles').select('id, full_name, email, active').ilike('email', likeExact(email)).maybeSingle();
      if (p?.active && !placeholder(p.email)) {
        const { data: link } = await db.auth.admin.generateLink({ type: 'recovery', email: p.email });
        const hash = link?.properties?.hashed_token;
        if (hash) await send(s, { kind: 'losenord', ref_id: p.id, to: p.email, ...passwordMail({ name: p.full_name, url: urls.activate(hash, 'recovery'), company }) });
      }
    }
    return reply(req, 200, { ok: true });
  }

  // Allt annat kräver en inloggad administratör.
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = token ? await db.auth.getUser(token) : { data: null };
  if (!auth?.user) return reply(req, 401, { error: 'Please log in' });
  const { data: me } = await db.from('profiles').select('id, role, active, email').eq('id', auth.user.id).maybeSingle();
  if (!me?.active || !['owner', 'admin'].includes(me.role)) return reply(req, 403, { error: 'Admins only' });

  try {
    if (body.action === 'status') {
      const items = s.email_enabled ? await due(s, now) : [];
      return reply(req, 200, {
        connected: !!apiKey(),
        enabled: s.email_enabled,
        enabled_at: s.email_enabled_at,
        waiting: items.map(({ go: _go, ...rest }) => rest),
      });
    }
    if (body.action === 'test') {
      if (!apiKey()) return reply(req, 400, { error: 'Resend is not connected yet.' });
      const to = typeof body.to === 'string' && body.to.trim() ? body.to.trim() : me.email;
      if (!isEmail(to)) return reply(req, 400, { error: 'Write an email address.' });
      const mail = reviewMail({ name: 'Test', reviewUrl: String(s.google_review_url ?? 'https://tostadflytt.se'), company: companyOf(s) });
      const error = await send(s, { kind: 'test', to, created_by: me.id, ...mail, subject: `Test: ${mail.subject}` });
      return error ? reply(req, 502, { error }) : reply(req, 200, { ok: true });
    }
    if (body.action === 'document') {
      if (!ready) return reply(req, 400, { error: 'Email is not turned on. Send the link yourself instead.' });
      const id = typeof body.id === 'string' ? body.id : '';
      const company = companyOf(s);
      if (body.type === 'offert') {
        const { data: doc } = await db.from('quotes').select('id, number, status, buyer, customer_id, to_pay, rut, valid_until, token').eq('id', id).maybeSingle();
        if (!doc || doc.status === 'utkast') return reply(req, 404, { error: 'The quote is not sent yet.' });
        const to = (doc.buyer as { email?: string } | null)?.email;
        if (!isEmail(to)) return reply(req, 400, { error: 'The quote has no email address. Add it to the customer.' });
        const error = await send(s, { kind: 'offert', ref_id: doc.id, customer_id: doc.customer_id, to, created_by: me.id, ...quoteMail({ doc, url: urls.doc(doc.token), company }) });
        return error ? reply(req, 502, { error }) : reply(req, 200, { ok: true, to });
      }
      if (body.type === 'faktura') {
        const { data: doc } = await db.from('invoices').select('id, number, kind, status, buyer, customer_id, to_pay, rut, due_date, ocr, token').eq('id', id).maybeSingle();
        if (!doc || doc.status === 'utkast') return reply(req, 404, { error: 'The invoice is not sent yet.' });
        const to = (doc.buyer as { email?: string } | null)?.email;
        if (!isEmail(to)) return reply(req, 400, { error: 'The invoice has no email address. Add it to the customer.' });
        const reminder = body.reminder === true;
        const error = await send(s, { kind: reminder ? 'paminnelse' : 'faktura', ref_id: doc.id, customer_id: doc.customer_id, to, created_by: me.id, ...invoiceMail({ doc, url: urls.doc(doc.token), reminder, company }) });
        return error ? reply(req, 502, { error }) : reply(req, 200, { ok: true, to });
      }
      return reply(req, 400, { error: 'Unknown document' });
    }
  } catch (e) {
    console.error(e);
    return reply(req, 500, { error: e instanceof Error ? e.message : 'Something went wrong' });
  }
  return reply(req, 400, { error: 'Unknown action' });
});
