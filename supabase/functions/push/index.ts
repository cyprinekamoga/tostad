// Pushnotiser (Web Push) till personalens telefoner. Schemat anropar funktionen när det finns ändringar i
// kön (nytt jobb, bortplockad, ändrad tid eller adress, avbokat). Inloggad personal hämtar nyckeln,
// registrerar sin telefon, stänger av och skickar ett test. VAPID-nycklarna skapas här första gången
// och sparas i Vault, så att ingen annan behöver se dem.
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import { outcome, notification } from './messages.js';

const ORIGINS = ['https://tostadflytt.se', 'https://www.tostadflytt.se', 'https://tostadflytt-preview.netlify.app', 'http://localhost:4321', 'http://127.0.0.1:4321'];
const PREVIEW = /^https:\/\/[a-z0-9-]+--tostadflytt-preview\.netlify\.app$/;
const CONTACT = 'mailto:info@tostadflytt.se';

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

let server: webpush.ApplicationServer | null = null;
let publicKey = '';
/** Applikationsservern med VAPID-nycklarna. Skapar och sparar nycklarna första gången. */
async function appServer() {
  if (server) return server;
  const { data: stored } = await db.rpc('push_keys_get');
  let keys: CryptoKeyPair;
  if (stored) keys = await webpush.importVapidKeys(JSON.parse(stored), { extractable: false });
  else {
    const fresh = await webpush.generateVapidKeys({ extractable: true });
    const { error } = await db.rpc('push_keys_set', { p_keys: JSON.stringify(await webpush.exportVapidKeys(fresh)) });
    if (error) {
      // En annan körning hann före: använd de sparade nycklarna.
      const { data: again } = await db.rpc('push_keys_get');
      keys = await webpush.importVapidKeys(JSON.parse(again), { extractable: false });
    } else keys = fresh;
  }
  publicKey = await webpush.exportApplicationServerKey(keys);
  server = await webpush.ApplicationServer.new({ contactInformation: CONTACT, vapidKeys: keys });
  return server;
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };
/** Skickar till alla en persons telefoner. Telefoner som inte längre finns tas bort. */
async function sendTo(subs: Sub[], message: Record<string, unknown>) {
  const app = await appServer();
  let sent = 0;
  for (const s of subs) {
    try {
      await app.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }).pushTextMessage(JSON.stringify(message), { ttl: 24 * 3600, urgency: webpush.Urgency.High } as webpush.PushMessageOptions);
      sent++;
      await db.from('push_subscriptions').update({ last_ok_at: new Date().toISOString() }).eq('id', s.id);
    } catch (e) {
      if (e instanceof webpush.PushMessageError && e.isGone()) await db.from('push_subscriptions').delete().eq('id', s.id);
      else console.error('push', s.endpoint.slice(0, 40), e instanceof webpush.PushMessageError ? e.toString() : e);
    }
  }
  return sent;
}

/** Tar allt i kön, räknar ut vad som hänt per person och jobb och skickar en notis per person. */
async function run() {
  const { data: rows, error } = await db.from('push_queue').update({ sent_at: new Date().toISOString() }).is('sent_at', null).select('*').order('id');
  if (error) throw new Error(error.message);
  // Gamla rader behövs inte längre.
  await db.from('push_queue').delete().lt('created_at', new Date(Date.now() - 30 * 864e5).toISOString());
  if (!rows?.length) return { people: 0, sent: 0 };

  const jobIds = [...new Set(rows.map((r) => r.job_id).filter(Boolean))];
  const { data: now } = await db.from('job_staff').select('job_id, profile_id, jobs!inner(status, starts_at, service, city)').in('job_id', jobIds);
  // deno-lint-ignore no-explicit-any
  const current = new Map((now ?? []).map((r: any) => [`${r.profile_id}|${r.job_id}`, r.jobs]));

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.profile_id}|${r.job_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const perPerson = new Map<string, Record<string, unknown>[]>();
  for (const [key, events] of groups) {
    const [profileId] = key.split('|');
    // Den som gjorde ändringen själv behöver ingen notis om den.
    if (events.every((e) => e.actor === profileId)) continue;
    const job = current.get(key);
    const kind = outcome(events, !!job && job.status === 'planerad');
    if (!kind) continue;
    const last = events[events.length - 1];
    const item = { kind, job_id: last.job_id, service: job?.service ?? last.service, starts_at: job?.starts_at ?? last.starts_at, city: job?.city ?? last.city };
    if (new Date(item.starts_at).getTime() < Date.now()) continue;
    if (!perPerson.has(profileId)) perPerson.set(profileId, []);
    perPerson.get(profileId)!.push(item);
  }
  if (!perPerson.size) return { people: 0, sent: 0 };

  const { data: subs } = await db.from('push_subscriptions').select('id, profile_id, endpoint, p256dh, auth, profiles!inner(active)').in('profile_id', [...perPerson.keys()]);
  let sent = 0;
  for (const [profileId, items] of perPerson) {
    // deno-lint-ignore no-explicit-any
    const mine = (subs ?? []).filter((s: any) => s.profile_id === profileId && s.profiles?.active);
    if (mine.length) sent += await sendTo(mine, notification(items as never));
  }
  return { people: perPerson.size, sent };
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

  try {
    const cronToken = req.headers.get('x-cron-token');
    if (cronToken) {
      const { data: ok } = await db.rpc('check_cron_token', { p_token: cronToken });
      if (!ok) return reply(req, 403, { error: 'Denied' });
      return reply(req, 200, await run());
    }

    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth } = token ? await db.auth.getUser(token) : { data: null };
    if (!auth?.user) return reply(req, 401, { error: 'Please log in' });
    const { data: me } = await db.from('profiles').select('id, active').eq('id', auth.user.id).maybeSingle();
    if (!me?.active) return reply(req, 403, { error: 'Denied' });

    if (body.action === 'key') {
      await appServer();
      return reply(req, 200, { key: publicKey });
    }
    if (body.action === 'subscribe') {
      const s = body.subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | undefined;
      const endpoint = typeof s?.endpoint === 'string' ? s.endpoint : '';
      const p256dh = typeof s?.keys?.p256dh === 'string' ? s.keys.p256dh : '';
      const authKey = typeof s?.keys?.auth === 'string' ? s.keys.auth : '';
      if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || p256dh.length > 200 || !authKey || authKey.length > 100) return reply(req, 400, { error: 'Invalid subscription' });
      const device = typeof body.device === 'string' ? body.device.slice(0, 200) : null;
      const { error } = await db.from('push_subscriptions').upsert({ profile_id: me.id, endpoint, p256dh, auth: authKey, device }, { onConflict: 'endpoint' });
      if (error) return reply(req, 500, { error: 'Could not save. Try again.' });
      return reply(req, 200, { ok: true });
    }
    if (body.action === 'unsubscribe') {
      if (typeof body.endpoint === 'string') await db.from('push_subscriptions').delete().eq('profile_id', me.id).eq('endpoint', body.endpoint);
      return reply(req, 200, { ok: true });
    }
    if (body.action === 'test') {
      const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('profile_id', me.id);
      if (!subs?.length) return reply(req, 400, { error: 'Turn on notifications on this phone first.' });
      const sent = await sendTo(subs, { title: 'Notifications work', body: 'You will get a notification when your schedule changes.', url: '/app', tag: 'test' });
      return sent ? reply(req, 200, { ok: true, sent }) : reply(req, 502, { error: 'The notification could not be sent. Turn notifications off and on again.' });
    }
    return reply(req, 400, { error: 'Unknown action' });
  } catch (e) {
    console.error(e);
    return reply(req, 500, { error: 'Something went wrong' });
  }
});
