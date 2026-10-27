// SMS via 46elks, bara när en administratör skickar för hand: numret skrivs in och texten väljs från en mall.
// Inga automatiska utskick. Utan 46elks-nycklar (ELKS_API_USERNAME, ELKS_API_PASSWORD) skickas inget.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { zoned, smsPhone, unfilled } from './messages.js';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return reply(req, 405, { error: 'Wrong method' });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(req, 400, { error: 'Invalid request' });
  }
  // Det gamla schemat för påminnelser är borttaget. Ett anrop därifrån gör ingenting.
  if (req.headers.get('x-cron-token')) return reply(req, 200, { skipped: 'Automatic SMS is removed' });

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = token ? await db.auth.getUser(token) : { data: null };
  if (!auth?.user) return reply(req, 401, { error: 'Please log in' });
  const { data: me } = await db.from('profiles').select('id, role, active').eq('id', auth.user.id).maybeSingle();
  if (!me?.active || !['owner', 'admin'].includes(me.role)) return reply(req, 403, { error: 'Admins only' });

  try {
    if (body.action === 'status') return reply(req, 200, { connected: !!credentials() });
    if (body.action === 'send') {
      if (!credentials()) return reply(req, 400, { error: '46elks is not connected yet.' });
      const to = smsPhone(typeof body.phone === 'string' ? body.phone : '');
      if (!to) return reply(req, 400, { error: 'Write a mobile number, for example 070 123 45 67.' });
      const text = typeof body.body === 'string' ? body.body.trim() : '';
      if (text.length < 2 || text.length > 600) return reply(req, 400, { error: 'Write the message, at most 600 characters.' });
      const left = unfilled(text);
      if (left.length) return reply(req, 400, { error: `Fill in ${left.join(', ')} before you send.` });
      const { data: settings } = await db.from('company_settings').select('sms_sender').eq('id', 1).maybeSingle();
      const r = await sendSms(String(settings?.sms_sender ?? 'TOStadFlytt'), to, text);
      await db.from('sms_log').insert({ kind: 'manuell', ref_date: zoned(new Date()).date, profile_id: me.id, phone: to, body: text, status: r.error ? 'fel' : 'skickat', provider_id: r.id ?? null, parts: r.parts ?? null, error: r.error?.slice(0, 500) ?? null });
      if (r.error) return reply(req, 502, { error: 'The SMS could not be sent. Check the number and try again.' });
      return reply(req, 200, { ok: true, phone: to, parts: r.parts });
    }
  } catch (e) {
    console.error(e);
    return reply(req, 500, { error: 'Something went wrong' });
  }
  return reply(req, 400, { error: 'Unknown action' });
});
