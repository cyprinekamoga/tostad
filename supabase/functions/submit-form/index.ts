// Tar emot bokningar, kontaktmeddelanden och skadeanmälningar från webbplatsen och
// lägger dem i inkorgen. Öppen för alla, så allt valideras här: tillåtna fält, längd,
// filtyper, honungsfälla mot robotar och högst 8 inskick per IP-adress på 10 minuter.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ORIGINS = ['https://tostadflytt.se', 'https://www.tostadflytt.se', 'https://tostadflytt-preview.netlify.app', 'http://localhost:4321', 'http://127.0.0.1:4321'];
const PREVIEW = /^https:\/\/[a-z0-9-]+--tostadflytt-preview\.netlify\.app$/;

const FORMS: Record<string, { fields: string[]; required: string[]; files?: string[] }> = {
  bokning: {
    fields: ['tjanst', 'adress', 'postnummer', 'nyAdress', 'storlek', 'kvm', 'vaningOchHiss', 'ovrigt', 'datum', 'tid', 'flexibel', 'namn', 'telefon', 'epost', 'kontaktsatt', 'samtycke', 'pris', 'kalkyl'],
    required: ['tjanst', 'adress', 'postnummer', 'datum', 'namn', 'telefon', 'epost', 'samtycke'],
  },
  kontakt: {
    fields: ['namn', 'kontakt', 'meddelande', 'samtycke', 'sprak'],
    required: ['namn', 'kontakt', 'meddelande', 'samtycke'],
  },
  skadeanmalan: {
    fields: ['namn', 'telefon', 'epost', 'datum', 'typ', 'adress', 'beskrivning', 'samtycke'],
    required: ['namn', 'telefon', 'epost', 'datum', 'beskrivning', 'samtycke'],
    files: ['bild1', 'bild2', 'bild3'],
  },
};
const LONG = new Set(['ovrigt', 'meddelande', 'beskrivning', 'kalkyl']);
const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
const MAX_FILE = 10 * 1024 * 1024;

// Filtypen avgörs av innehållet, inte bara av vad webbläsaren säger.
async function sniff(file: File) {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const hex = [...head].map((b) => b.toString(16).padStart(2, '0')).join('');
  const ascii = String.fromCharCode(...head);
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (hex.startsWith('89504e47')) return 'image/png';
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'image/webp';
  if (ascii.slice(4, 8) === 'ftyp' && /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(ascii.slice(8, 12))) return file.type === 'image/heif' ? 'image/heif' : 'image/heic';
  if (hex.startsWith('25504446')) return 'application/pdf';
  return null;
}
const RATE_LIMIT = 8;
const RATE_WINDOW_MIN = 10;

const secretKey = (() => {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  return keys ? JSON.parse(keys).default : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
})();
const db = createClient(Deno.env.get('SUPABASE_URL')!, secretKey, { auth: { persistSession: false } });

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const allowed = ORIGINS.includes(origin) || PREVIEW.test(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
    Vary: 'Origin',
  };
}

function reply(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } });
}

async function sha256(text: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Nycklar för anrop till andra funktioner, räknade ur projektets hemliga nyckel.
async function derived(label: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${secretKey}:${label}`));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

/** Mejl och pushnotis till företaget om det som kom in. Fel här ska aldrig stoppa själva inskicket. */
async function notify(id: string) {
  const call = async (fn: string) => {
    try {
      const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/${fn}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-key': await derived(`${fn}-internal`) },
        body: JSON.stringify({ action: 'submission', id }),
      });
      if (!res.ok) console.error('notify', fn, res.status, (await res.text()).slice(0, 200));
    } catch (e) {
      console.error('notify', fn, e);
    }
  };
  await Promise.all([call('email'), call('push')]);
}

function safeName(name: string) {
  return name.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-80) || 'fil';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return reply(req, 405, { error: 'Fel metod' });
  if (Number(req.headers.get('content-length') ?? 0) > 40 * 1024 * 1024) return reply(req, 413, { error: 'För stort' });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return reply(req, 400, { error: 'Ogiltigt formulär' });
  }

  const kind = String(form.get('form-name') ?? '');
  const spec = FORMS[kind];
  if (!spec) return reply(req, 400, { error: 'Okänt formulär' });
  // Robotar fyller i det dolda fältet. Svara som vanligt men spara inget.
  if (String(form.get('bot-field') ?? '').trim()) return reply(req, 200, { ok: true });

  const data: Record<string, string> = {};
  for (const key of spec.fields) {
    const value = form.get(key);
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (trimmed.length > (LONG.has(key) ? 4000 : 300)) return reply(req, 400, { error: `Fältet ${key} är för långt` });
    data[key] = trimmed;
  }
  const missing = spec.required.filter((k) => !data[k]);
  if (missing.length) return reply(req, 400, { error: 'Fyll i alla obligatoriska fält', missing });

  const contact = data.kontakt ?? '';
  const email = data.epost ?? (contact.includes('@') ? contact : null);
  const phone = data.telefon ?? (contact && !contact.includes('@') ? contact : null);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(req, 400, { error: 'Kontrollera e-postadressen' });

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'okänd';
  const ipHash = await sha256(`tostadflytt:${ip}`);
  const since = new Date(Date.now() - RATE_WINDOW_MIN * 60 * 1000).toISOString();
  const { count } = await db.from('form_rate').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', since);
  if ((count ?? 0) >= RATE_LIMIT) return reply(req, 429, { error: 'För många försök. Vänta en stund och försök igen.' });
  await db.from('form_rate').insert({ ip_hash: ipHash });
  if (Math.random() < 0.05) await db.from('form_rate').delete().lt('created_at', new Date(Date.now() - 86400000).toISOString());

  const id = crypto.randomUUID();
  const files: string[] = [];
  for (const [i, key] of (spec.files ?? []).entries()) {
    const file = form.get(key);
    if (!(file instanceof File) || file.size === 0) continue;
    if (file.size > MAX_FILE) continue;
    const type = await sniff(file);
    if (!type || !FILE_TYPES.includes(type)) continue;
    const path = `${id}/${i + 1}-${safeName(file.name)}`;
    const { error } = await db.storage.from('inbox').upload(path, file, { contentType: type });
    if (!error) files.push(path);
  }

  const { error } = await db.from('submissions').insert({
    id,
    kind,
    name: data.namn ?? null,
    email,
    phone,
    data,
    files,
  });
  if (error) {
    console.error('insert failed', error.message);
    return reply(req, 500, { error: 'Kunde inte spara. Försök igen eller ring oss.' });
  }
  // Beskeden skickas efter svaret, så att kunden inte behöver vänta på dem.
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(notify(id));
  else await notify(id);
  return reply(req, 200, { ok: true });
});
