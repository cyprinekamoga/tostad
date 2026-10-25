// Tar emot jobbansökningar från /jobb. Öppen för alla, så allt valideras här: längd, mejl,
// CV-filens typ och storlek, honungsfälla mot robotar och högst 5 ansökningar per IP på en timme.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ORIGINS = ['https://tostadflytt.se', 'https://www.tostadflytt.se', 'https://tostadflytt-preview.netlify.app', 'http://localhost:4321', 'http://127.0.0.1:4321'];
const PREVIEW = /^https:\/\/[a-z0-9-]+--tostadflytt-preview\.netlify\.app$/;
const CV_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'text/plain': 'txt',
};
const MAX_FILE = 10 * 1024 * 1024;
const RATE_LIMIT = 5;

const secretKey = (() => {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  return keys ? JSON.parse(keys).default : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
})();
const db = createClient(Deno.env.get('SUPABASE_URL')!, secretKey, { auth: { persistSession: false } });

// Nyckel för anropet till mejlfunktionen, räknad ur projektets hemliga nyckel (samma som i email).
async function derived(label: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${secretKey}:${label}`));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

function cors(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) || PREVIEW.test(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
    Vary: 'Origin',
  };
}
const reply = (req: Request, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

async function sha256(text: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Filtypen avgörs av innehållet, inte bara av vad webbläsaren säger.
async function sniff(file: File) {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const hex = [...head].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.startsWith('25504446')) return 'application/pdf';
  if (hex.startsWith('d0cf11e0')) return 'application/msword';
  if (hex.startsWith('504b0304')) return file.type === 'application/vnd.oasis.opendocument.text' ? file.type : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (file.type === 'text/plain') return 'text/plain';
  return null;
}

const text = (form: FormData, key: string, max: number) => {
  const v = form.get(key);
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return reply(req, 405, { error: 'Fel metod' });
  if (Number(req.headers.get('content-length') ?? 0) > 12 * 1024 * 1024) return reply(req, 413, { error: 'Filen är för stor. Högst 10 MB.' });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return reply(req, 400, { error: 'Ogiltigt formulär' });
  }
  if (text(form, 'bot-field', 100)) return reply(req, 200, { ok: true });

  const name = text(form, 'namn', 200);
  const email = text(form, 'epost', 254).toLowerCase();
  const phone = text(form, 'telefon', 40);
  const letter = text(form, 'brev', 6000);
  const experience = text(form, 'erfarenhet', 2000);
  const licence = text(form, 'korkort', 10);
  const startDate = text(form, 'start', 100);
  const slug = text(form, 'annons', 80);
  if (!name || !email || !letter) return reply(req, 400, { error: 'Fyll i namn, mejl och ditt personliga brev.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(req, 400, { error: 'Kontrollera mejladressen.' });
  if (letter.length < 30) return reply(req, 400, { error: 'Skriv några meningar om dig själv i brevet.' });
  if (text(form, 'samtycke', 10) !== 'ja') return reply(req, 400, { error: 'Du behöver godkänna att vi sparar din ansökan.' });

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'okänd';
  const ipHash = await sha256(`tostadflytt-jobb:${ip}`);
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count } = await db.from('form_rate').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', since);
  if ((count ?? 0) >= RATE_LIMIT) return reply(req, 429, { error: 'För många ansökningar. Vänta en stund och försök igen.' });
  await db.from('form_rate').insert({ ip_hash: ipHash });

  let vacancyId: string | null = null;
  if (slug) {
    const { data: v } = await db.from('vacancies').select('id').eq('slug', slug).eq('status', 'publicerad').maybeSingle();
    vacancyId = v?.id ?? null;
  }

  const id = crypto.randomUUID();
  let cvPath: string | null = null;
  let cvName: string | null = null;
  const file = form.get('cv');
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE) return reply(req, 400, { error: 'CV-filen är för stor. Högst 10 MB.' });
    const type = await sniff(file);
    if (!type || !CV_TYPES[type]) return reply(req, 400, { error: 'CV:t ska vara en PDF- eller Word-fil.' });
    cvPath = `${id}/cv.${CV_TYPES[type]}`;
    cvName = file.name.normalize('NFC').replace(/[^\p{L}\p{N} ._-]+/gu, '_').slice(-120) || `cv.${CV_TYPES[type]}`;
    const { error } = await db.storage.from('cv').upload(cvPath, file, { contentType: type });
    if (error) return reply(req, 500, { error: 'Kunde inte spara CV:t. Försök igen.' });
  }

  const { error } = await db.from('applications').insert({
    id,
    vacancy_id: vacancyId,
    name,
    email,
    phone: phone || null,
    letter,
    experience: experience || null,
    licence: licence === 'ja' ? true : licence === 'nej' ? false : null,
    start_date: startDate || null,
    cv_path: cvPath,
    cv_name: cvName,
  });
  if (error) {
    console.error('insert failed', error.message);
    if (cvPath) await db.storage.from('cv').remove([cvPath]);
    return reply(req, 500, { error: 'Kunde inte skicka ansökan. Försök igen eller mejla oss.' });
  }
  // Bekräftelse till den sökande direkt (skickas bara när mejl är påslaget).
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': await derived('email-internal') },
      body: JSON.stringify({ action: 'application', id }),
    });
  } catch (e) {
    console.error('confirmation email', e);
  }
  return reply(req, 200, { ok: true });
});
