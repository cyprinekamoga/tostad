// Kundportalen (/kund). Kunden öppnar en personlig länk med en hemlig nyckel och ser sina
// bokningar, fotorapporter, offerter och fakturor. Kunden kan också skicka ett meddelande,
// som hamnar i inkorgen. Inga priser för personal eller interna anteckningar visas.
import { createClient } from 'npm:@supabase/supabase-js@2';

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
    Vary: 'Origin',
  };
}
const reply = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

const isToken = (t: unknown): t is string => typeof t === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);

async function sha256(text: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function customerFor(token: unknown) {
  if (!isToken(token)) return null;
  const { data } = await db.from('customers').select('id, kind, name, email, phone, street, postal_code, city').eq('portal_token', token).maybeSingle();
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });

  if (req.method === 'GET') {
    const c = await customerFor(new URL(req.url).searchParams.get('k'));
    if (!c) return reply(req, 404, { error: 'Länken fungerar inte' });
    await db.from('customers').update({ portal_seen_at: new Date().toISOString() }).eq('id', c.id);

    const [jobs, quotes, invoices, settings] = await Promise.all([
      db
        .from('jobs')
        .select('id, service, title, status, starts_at, ends_at, street, postal_code, city, to_street, to_postal_code, to_city, on_way_at, done_at, job_staff(profiles(full_name))')
        .eq('customer_id', c.id)
        .order('starts_at', { ascending: false })
        .limit(100),
      db.from('quotes').select('number, status, service, to_pay, rut, valid_until, sent_at, decided_at, token').eq('customer_id', c.id).neq('status', 'utkast').order('created_at', { ascending: false }).limit(50),
      db
        .from('invoices')
        .select('number, kind, status, issue_date, due_date, to_pay, ocr, paid_at, token')
        .eq('customer_id', c.id)
        .neq('status', 'utkast')
        .order('issue_date', { ascending: false })
        .limit(100),
      db.from('company_settings').select('bankgiro').eq('id', 1).maybeSingle(),
    ]);

    // Fotorapporter för jobb som är klara.
    const doneIds = (jobs.data ?? []).filter((j) => j.status === 'klar').map((j) => j.id);
    const photos: Record<string, { kind: string; url: string }[]> = {};
    if (doneIds.length) {
      const { data: rows } = await db.from('job_photos').select('job_id, path, kind').in('job_id', doneIds).order('created_at').limit(300);
      if (rows?.length) {
        const { data: signed } = await db.storage.from('job-photos').createSignedUrls(rows.map((r) => r.path), 3600);
        const urls = Object.fromEntries((signed ?? []).map((s) => [s.path, s.signedUrl]));
        for (const r of rows) if (urls[r.path]) (photos[r.job_id] ??= []).push({ kind: r.kind, url: urls[r.path] });
      }
    }

    return reply(req, 200, {
      customer: { name: c.name, email: c.email, phone: c.phone, street: c.street, postal_code: c.postal_code, city: c.city, company: c.kind === 'company' },
      bankgiro: settings.data?.bankgiro ?? null,
      jobs: (jobs.data ?? []).map(({ id, job_staff, ...j }) => ({
        ...j,
        key: id.slice(0, 8),
        team: (job_staff ?? []).map((s: { profiles: { full_name: string } | null }) => s.profiles?.full_name?.split(' ')[0]).filter(Boolean),
        photos: photos[id] ?? [],
      })),
      quotes: quotes.data ?? [],
      invoices: invoices.data ?? [],
    });
  }

  if (req.method !== 'POST') return reply(req, 405, { error: 'Fel metod' });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(req, 400, { error: 'Ogiltig begäran' });
  }
  const c = await customerFor(body.k);
  if (!c) return reply(req, 404, { error: 'Länken fungerar inte' });
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 4000) : '';
  const topic = typeof body.topic === 'string' ? body.topic.trim().slice(0, 100) : '';
  if (message.length < 3) return reply(req, 400, { error: 'Skriv ett meddelande.' });

  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const key = await sha256(`tostadflytt-portal:${c.id}`);
  const { count } = await db.from('form_rate').select('id', { count: 'exact', head: true }).eq('ip_hash', key).gte('created_at', since);
  if ((count ?? 0) >= 10) return reply(req, 429, { error: 'För många meddelanden. Ring oss om det är bråttom.' });
  await db.from('form_rate').insert({ ip_hash: key });

  const { error } = await db.from('submissions').insert({
    kind: 'kontakt',
    status: 'ny',
    name: c.name,
    email: c.email,
    phone: c.phone,
    customer_id: c.id,
    data: { namn: c.name, kontakt: c.email || c.phone || '', meddelande: topic ? `${topic}: ${message}` : message, samtycke: 'ja', kalla: 'Kundportalen' },
  });
  if (error) return reply(req, 500, { error: 'Kunde inte skicka. Försök igen eller ring oss.' });
  return reply(req, 200, { ok: true });
});
