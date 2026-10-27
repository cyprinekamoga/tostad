// SMS till kunderna kvällen före via 46elks. Anropas varje timme av databasens schema (pg_cron) och skickar när
// klockan i Sverige har passerat sändtiden. Administratörer kan förhandsgranska, skicka direkt och
// skicka ett test. Personalen skickar "Vi är på väg" från appen. Utan 46elks-nycklar (ELKS_API_USERNAME, ELKS_API_PASSWORD) skickas inget.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { plan, zoned, addDays, swedishMidnight, isSendTime, smsPhone, onWayMessage, bookingMessage } from './messages.js';

const ORIGINS = ['https://tostadflytt.se', 'https://www.tostadflytt.se', 'https://tostadflytt-preview.netlify.app', 'http://localhost:4321', 'http://127.0.0.1:4321'];
const PREVIEW = /^https:\/\/[a-z0-9-]+--tostadflytt-preview\.netlify\.app$/;

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

const credentials = () => {
  const user = Deno.env.get('ELKS_API_USERNAME');
  const pass = Deno.env.get('ELKS_API_PASSWORD');
  return user && pass ? { user, pass } : null;
};

/** Skickar ett SMS. Returnerar id och antal delar, eller ett felmeddelande. */
async function sendSms(from: string, to: string, message: string) {
  const c = credentials();
  if (!c) return { error: '46elks is not connected' };
  const res = await fetch('https://api.46elks.com/a1/sms', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${c.user}:${c.pass}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ from, to, message }),
  });
  const text = await res.text();
  if (!res.ok) return { error: `46elks ${res.status}: ${text.slice(0, 300)}` };
  try {
    const json = JSON.parse(text);
    return { id: String(json.id ?? ''), parts: Number(json.parts) || null };
  } catch {
    return { error: `46elks answered: ${text.slice(0, 300)}` };
  }
}

async function loadSettings() {
  const { data } = await db.from('company_settings').select('phone, sms_enabled, sms_hour, sms_company_customers, sms_sender, sms_customer_text, sms_onway_enabled, sms_onway_text, sms_booking_text').eq('id', 1).maybeSingle();
  return data;
}

/** Plan för ett datum, med markering för det som redan är skickat. */
async function planFor(date: string, settings: Record<string, unknown>) {
  const from = swedishMidnight(date).toISOString();
  const to = swedishMidnight(addDays(date, 1)).toISOString();
  const { data: jobs, error } = await db
    .from('jobs')
    .select('id, status, service, title, starts_at, street, city, customers(id, name, phone, kind), job_staff(profiles(id, full_name, phone, active))')
    .gte('starts_at', from)
    .lt('starts_at', to);
  if (error) throw new Error('Could not load the jobs');
  const { data: sent } = await db.from('sms_log').select('kind, phone, job_id, status, created_at').eq('ref_date', date).neq('kind', 'test');
  const done = new Set((sent ?? []).filter((s) => s.status === 'skickat').map((s) => `${s.kind}|${s.phone}|${s.job_id ?? ''}`));
  // deno-lint-ignore no-explicit-any
  return plan((jobs ?? []) as any[], settings, date).map((m: Record<string, unknown>) => ({ ...m, sent: !!m.phone && done.has(`${m.kind}|${m.phone}|${m.job_id ?? ''}`) }));
}

/** Skickar det som inte redan är skickat. Ett misslyckat SMS försöks igen nästa timme. */
async function sendDue(date: string, settings: Record<string, unknown>) {
  const messages = await planFor(date, settings);
  let sent = 0;
  let failed = 0;
  for (const m of messages) {
    if (m.skip || m.sent) continue;
    const r = await sendSms(String(settings.sms_sender), String(m.phone), String(m.body));
    const { error } = await db.from('sms_log').insert({
      kind: m.kind,
      ref_date: date,
      job_id: m.job_id,
      customer_id: m.customer_id,
      profile_id: m.profile_id,
      phone: m.phone,
      body: m.body,
      status: r.error ? 'fel' : 'skickat',
      provider_id: r.id ?? null,
      parts: r.parts ?? null,
      error: r.error ?? null,
    });
    if (error) console.error('sms_log', error.message);
    if (r.error) failed++;
    else sent++;
  }
  return { date, sent, failed };
}

/** Personalen är på väg: markerar jobbet och skickar SMS till kunden om de valt det. Ett SMS per jobb. */
async function onWay(profileId: string, jobId: string, minutes: number, sendSms_: boolean, settings: Record<string, unknown>) {
  const { data: mine } = await db.from('job_staff').select('job_id').eq('job_id', jobId).eq('profile_id', profileId).maybeSingle();
  if (!mine) return { status: 403, body: { error: 'You are not booked on this job.' } };
  const { data: job } = await db
    .from('jobs')
    .select('id, status, service, street, city, on_way_at, customers(id, name, phone, kind), job_staff(profiles(id, full_name, phone, active))')
    .eq('id', jobId)
    .maybeSingle();
  if (!job || job.status !== 'planerad') return { status: 400, body: { error: 'The job is not planned.' } };
  if (!job.on_way_at) await db.from('jobs').update({ on_way_at: new Date().toISOString() }).eq('id', jobId);
  if (!sendSms_) return { status: 200, body: { ok: true, sms: 'not_sent' } };

  const { data: before } = await db.from('sms_log').select('id').eq('kind', 'pa_vag').eq('job_id', jobId).eq('status', 'skickat').limit(1);
  if (before?.length) return { status: 200, body: { ok: true, sms: 'skipped', reason: 'The customer already got an SMS for this job' } };
  if (!credentials()) return { status: 200, body: { ok: true, sms: 'skipped', reason: 'SMS is not connected' } };
  // deno-lint-ignore no-explicit-any
  const m = onWayMessage(job as any, settings, minutes);
  if (m.skip) return { status: 200, body: { ok: true, sms: 'skipped', reason: m.skip } };
  const r = await sendSms(String(settings.sms_sender), m.phone, m.body);
  // deno-lint-ignore no-explicit-any
  const customer = job.customers as any;
  await db.from('sms_log').insert({
    kind: 'pa_vag',
    ref_date: zoned(new Date()).date,
    job_id: jobId,
    customer_id: customer?.id ?? null,
    profile_id: profileId,
    phone: m.phone,
    body: m.body,
    status: r.error ? 'fel' : 'skickat',
    provider_id: r.id ?? null,
    parts: r.parts ?? null,
    error: r.error ?? null,
  });
  if (r.error) return { status: 200, body: { ok: true, sms: 'failed', reason: 'The SMS could not be sent. Call the customer instead.' } };
  return { status: 200, body: { ok: true, sms: 'sent' } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return reply(req, 405, { error: 'Wrong method' });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(req, 400, { error: 'Invalid request' });
  }

  const now = new Date();
  const tomorrow = addDays(zoned(now).date, 1);

  // Schemat: skickar morgondagens påminnelser när det är dags.
  const cronToken = req.headers.get('x-cron-token');
  if (cronToken) {
    const { data: ok } = await db.rpc('check_cron_token', { p_token: cronToken });
    if (!ok) return reply(req, 403, { error: 'Denied' });
    const settings = await loadSettings();
    if (!settings?.sms_enabled) return reply(req, 200, { skipped: 'SMS is turned off' });
    if (!credentials()) return reply(req, 200, { skipped: '46elks is not connected' });
    if (!isSendTime(now, Number(settings.sms_hour))) return reply(req, 200, { skipped: 'Not time yet' });
    return reply(req, 200, await sendDue(tomorrow, settings));
  }

  // Allt annat kräver inloggning.
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = token ? await db.auth.getUser(token) : { data: null };
  if (!auth?.user) return reply(req, 401, { error: 'Please log in' });
  const { data: me } = await db.from('profiles').select('id, role, active, phone').eq('id', auth.user.id).maybeSingle();
  if (!me?.active) return reply(req, 403, { error: 'Denied' });
  const settings = await loadSettings();
  if (!settings) return reply(req, 500, { error: 'The settings are missing' });

  // Personalen (och administratörer som är bokade på jobbet).
  if (body.action === 'on_way') {
    if (typeof body.job_id !== 'string' || !/^[0-9a-f-]{36}$/.test(body.job_id)) return reply(req, 400, { error: 'Invalid job' });
    try {
      const r = await onWay(me.id, body.job_id, Number(body.minutes), body.sms === true, settings);
      return reply(req, r.status, r.body);
    } catch (e) {
      console.error(e);
      return reply(req, 500, { error: 'Could not save. Try again.' });
    }
  }

  if (!['owner', 'admin'].includes(me.role)) return reply(req, 403, { error: 'Admins only' });

  try {
    if (body.action === 'preview') {
      const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : tomorrow;
      return reply(req, 200, { date, connected: !!credentials(), enabled: settings.sms_enabled, messages: await planFor(date, settings) });
    }
    if (body.action === 'send_now') {
      if (!credentials()) return reply(req, 400, { error: '46elks is not connected yet.' });
      return reply(req, 200, await sendDue(tomorrow, settings));
    }
    // Bokningsbekräftelse från jobbet: först förhandsvisning, sedan skickas texten (som går att ändra).
    if (body.action === 'booking_preview' || body.action === 'booking_send') {
      if (typeof body.job_id !== 'string' || !/^[0-9a-f-]{36}$/.test(body.job_id)) return reply(req, 400, { error: 'Invalid job' });
      const { data: job } = await db.from('jobs').select('id, status, service, starts_at, street, city, customer_id, customers(id, name, phone, kind)').eq('id', body.job_id).maybeSingle();
      if (!job) return reply(req, 404, { error: 'Could not find the job.' });
      // deno-lint-ignore no-explicit-any
      const m = bookingMessage(job as any, settings);
      const { data: last } = await db.from('sms_log').select('created_at, phone').eq('kind', 'bokning').eq('job_id', job.id).eq('status', 'skickat').order('created_at', { ascending: false }).limit(1);
      if (body.action === 'booking_preview') return reply(req, 200, { connected: !!credentials(), ...m, last_sent: last?.[0]?.created_at ?? null });
      if (m.skip) return reply(req, 400, { error: `${m.skip}.` });
      if (!credentials()) return reply(req, 400, { error: '46elks is not connected yet.' });
      if (job.status === 'avbokad') return reply(req, 400, { error: 'The job is cancelled.' });
      const text = typeof body.body === 'string' ? body.body.trim() : '';
      if (text.length < 5 || text.length > 600) return reply(req, 400, { error: 'Write the text, at most 600 characters.' });
      const r = await sendSms(String(settings.sms_sender), m.phone, text);
      const row = { kind: 'bokning', ref_date: zoned(now).date, job_id: job.id, customer_id: job.customer_id, profile_id: me.id, phone: m.phone, body: text, status: r.error ? 'fel' : 'skickat', provider_id: r.id ?? null, parts: r.parts ?? null, error: r.error ?? null };
      const { error: logError } = await db.from('sms_log').insert(row);
      // Loggen har en rad per jobb, nummer och dag. Skickas den igen samma dag uppdateras raden.
      if (logError?.code === '23505') {
        await db.from('sms_log').update({ ...row, created_at: new Date().toISOString() }).eq('kind', 'bokning').eq('job_id', job.id).eq('phone', m.phone).eq('ref_date', row.ref_date).eq('status', 'skickat');
      }
      if (r.error) return reply(req, 502, { error: 'The SMS could not be sent. Check the number and try again.' });
      return reply(req, 200, { ok: true, phone: m.phone, parts: r.parts });
    }
    if (body.action === 'test') {
      if (!credentials()) return reply(req, 400, { error: '46elks is not connected yet.' });
      const to = smsPhone(typeof body.phone === 'string' ? body.phone : me.phone);
      if (!to) return reply(req, 400, { error: 'Write a Swedish mobile number.' });
      const text = 'Test from TO Städ & Flytt: the SMS reminders work.';
      const r = await sendSms(String(settings.sms_sender), to, text);
      await db.from('sms_log').insert({ kind: 'test', ref_date: zoned(now).date, profile_id: me.id, phone: to, body: text, status: r.error ? 'fel' : 'skickat', provider_id: r.id ?? null, parts: r.parts ?? null, error: r.error ?? null });
      if (r.error) return reply(req, 502, { error: r.error });
      return reply(req, 200, { ok: true });
    }
  } catch (e) {
    console.error(e);
    return reply(req, 500, { error: e instanceof Error ? e.message : 'Something went wrong' });
  }
  return reply(req, 400, { error: 'Unknown action' });
});
