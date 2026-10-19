// Personal: bjud in, skapa ny inloggningslänk, ändra roll, stäng av eller aktivera och ta bort.
// Bara inloggade administratörer får anropa funktionen.
// Länkarna skickas inte här; administratören kopierar dem och skickar via SMS eller mejl.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ORIGINS = ['https://tostadflytt.se', 'https://www.tostadflytt.se', 'https://tostadflytt-preview.netlify.app', 'http://localhost:4321', 'http://127.0.0.1:4321'];
const PREVIEW = /^https:\/\/[a-z0-9-]+--tostadflytt-preview\.netlify\.app$/;
// SHA-256 av en engångsnyckel som bara används för att skapa ägarkontot när inget finns.
const BOOTSTRAP_HASH = 'fa50a4eba5ecc335b0569d598d3c4a459da1aff2dd9797c58494932fdb67ac60';
const ROLES = ['employee', 'admin'];

const secretKey = (() => {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  return keys ? JSON.parse(keys).default : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
})();
const db = createClient(Deno.env.get('SUPABASE_URL')!, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

function allowedOrigin(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  return ORIGINS.includes(origin) || PREVIEW.test(origin) ? origin : null;
}

function corsHeaders(req: Request) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(req) ?? ORIGINS[0],
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

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// Länk till aktiveringssidan. Använder webbplatsen som anropade, annars tostadflytt.se.
function activationLink(req: Request, tokenHash: string, type: 'invite' | 'recovery') {
  const site = allowedOrigin(req) ?? ORIGINS[0];
  return `${site}/app/aktivera?th=${encodeURIComponent(tokenHash)}&typ=${type}`;
}

async function createStaff(req: Request, input: { full_name: string; email: string; phone: string; color: string; role: string }) {
  const { data, error } = await db.auth.admin.generateLink({ type: 'invite', email: input.email });
  if (error || !data.user) {
    const taken = /already|registered|exists/i.test(error?.message ?? '');
    return reply(req, taken ? 409 : 400, { error: taken ? 'E-postadressen används redan' : 'Kunde inte skapa kontot' });
  }
  const { error: profileError } = await db.from('profiles').insert({
    id: data.user.id,
    role: input.role,
    full_name: input.full_name,
    email: input.email,
    phone: input.phone || null,
    color: /^#[0-9a-fA-F]{6}$/.test(input.color) ? input.color : '#1f8a4c',
  });
  if (profileError) {
    await db.auth.admin.deleteUser(data.user.id);
    return reply(req, 400, { error: /administratörer/.test(profileError.message) ? 'Högst tre administratörer' : 'Kunde inte spara profilen' });
  }
  return reply(req, 200, { ok: true, user_id: data.user.id, link: activationLink(req, data.properties.hashed_token, 'invite') });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return reply(req, 405, { error: 'Fel metod' });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(req, 400, { error: 'Ogiltig begäran' });
  }
  const action = String(body.action ?? '');

  // Engångsflöde för ägarkontot: skapar ägaren när ingen finns, eller ger ägaren en ny länk
  // så länge ägaren aldrig har loggat in (om den första länken hann gå ut).
  // Testkonton på den reserverade domänen test.invalid tas bort när den riktiga ägaren skapas.
  if (action === 'bootstrap') {
    const token = clean(body.token, 200);
    if (!token || (await sha256(token)) !== BOOTSTRAP_HASH) return reply(req, 403, { error: 'Nekad' });
    const { data: owners } = await db.from('profiles').select('id, email').eq('role', 'owner');
    const email = clean(body.email, 254).toLowerCase();
    const full_name = clean(body.full_name, 120);
    const realOwner = (owners ?? []).find((o) => !o.email.endsWith('@test.invalid'));
    if (realOwner) {
      // Ny länk till ägaren går bara att få innan ägaren har loggat in första gången.
      const { data: user } = await db.auth.admin.getUserById(realOwner.id);
      if (realOwner.email !== email || user?.user?.last_sign_in_at) return reply(req, 403, { error: 'Ägaren finns redan' });
      let result = await db.auth.admin.generateLink({ type: 'invite', email });
      if (result.error) result = await db.auth.admin.generateLink({ type: 'recovery', email });
      if (result.error) return reply(req, 400, { error: 'Kunde inte skapa länken' });
      const used = result.data.properties.verification_type === 'invite' ? 'invite' : 'recovery';
      return reply(req, 200, { ok: true, user_id: realOwner.id, link: activationLink(req, result.data.properties.hashed_token, used) });
    }
    if (!isEmail(email) || !full_name) return reply(req, 400, { error: 'Namn och e-post krävs' });
    const { data: testAccounts } = await db.from('profiles').select('id').like('email', '%@test.invalid');
    for (const t of testAccounts ?? []) await db.auth.admin.deleteUser(t.id);
    return createStaff(req, { full_name, email, phone: '', color: '#14532d', role: 'owner' });
  }

  // Alla andra åtgärder kräver inloggad administratör.
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return reply(req, 401, { error: 'Logga in' });
  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth.user) return reply(req, 401, { error: 'Logga in igen' });
  // Tvåstegsverifiering används inte längre. Gamla registrerade koder tas bort vid inloggning.
  if (action === 'remove_mfa') {
    const { data: factors } = await db.auth.admin.mfa.listFactors({ userId: auth.user.id });
    for (const f of factors?.factors ?? []) await db.auth.admin.mfa.deleteFactor({ id: f.id, userId: auth.user.id });
    return reply(req, 200, { ok: true });
  }
  const { data: me } = await db.from('profiles').select('id, role, active').eq('id', auth.user.id).maybeSingle();
  if (!me || !me.active || !['owner', 'admin'].includes(me.role)) return reply(req, 403, { error: 'Bara administratörer' });

  if (action === 'invite') {
    const role = clean(body.role, 20) || 'employee';
    const email = clean(body.email, 254).toLowerCase();
    const full_name = clean(body.full_name, 120);
    if (!ROLES.includes(role)) return reply(req, 400, { error: 'Ogiltig roll' });
    if (role === 'admin' && me.role !== 'owner') return reply(req, 403, { error: 'Bara ägaren kan lägga till administratörer' });
    if (!isEmail(email) || !full_name) return reply(req, 400, { error: 'Namn och e-post krävs' });
    return createStaff(req, { full_name, email, phone: clean(body.phone, 40), color: clean(body.color, 7), role });
  }

  const userId = clean(body.user_id, 36);
  const { data: target } = await db.from('profiles').select('id, role, active, email').eq('id', userId).maybeSingle();
  if (!target) return reply(req, 404, { error: 'Hittar inte personen' });
  const touchesAdmin = target.role !== 'employee';
  if (touchesAdmin && me.role !== 'owner' && target.id !== me.id) return reply(req, 403, { error: 'Bara ägaren kan ändra administratörer' });

  if (action === 'link') {
    const { data: user } = await db.auth.admin.getUserById(userId);
    const type = user?.user?.last_sign_in_at ? 'recovery' : 'invite';
    let result = await db.auth.admin.generateLink({ type, email: target.email });
    if (result.error && type === 'invite') result = await db.auth.admin.generateLink({ type: 'recovery', email: target.email });
    if (result.error) return reply(req, 400, { error: 'Kunde inte skapa länken' });
    const used = result.data.properties.verification_type === 'invite' ? 'invite' : 'recovery';
    return reply(req, 200, { ok: true, link: activationLink(req, result.data.properties.hashed_token, used) });
  }

  if (action === 'set_active') {
    const active = body.active === true;
    if (target.role === 'owner') return reply(req, 403, { error: 'Ägarkontot kan inte stängas av' });
    if (target.id === me.id) return reply(req, 403, { error: 'Du kan inte stänga av dig själv' });
    const { error } = await db.from('profiles').update({ active }).eq('id', userId);
    if (error) return reply(req, 400, { error: /administratörer/.test(error.message) ? 'Högst tre administratörer' : 'Kunde inte spara' });
    await db.auth.admin.updateUserById(userId, { ban_duration: active ? 'none' : '876000h' });
    return reply(req, 200, { ok: true });
  }

  if (action === 'set_role') {
    const role = clean(body.role, 20);
    if (me.role !== 'owner') return reply(req, 403, { error: 'Bara ägaren kan ändra roller' });
    if (!ROLES.includes(role) || target.role === 'owner') return reply(req, 400, { error: 'Ogiltig roll' });
    const { error } = await db.from('profiles').update({ role }).eq('id', userId);
    if (error) return reply(req, 400, { error: /administratörer/.test(error.message) ? 'Högst tre administratörer' : 'Kunde inte spara' });
    return reply(req, 200, { ok: true });
  }

  if (action === 'delete') {
    if (me.role !== 'owner') return reply(req, 403, { error: 'Bara ägaren kan ta bort konton' });
    if (target.role === 'owner' || target.id === me.id) return reply(req, 403, { error: 'Ägarkontot kan inte tas bort' });
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) return reply(req, 400, { error: 'Kunde inte ta bort kontot' });
    return reply(req, 200, { ok: true });
  }

  return reply(req, 400, { error: 'Okänd åtgärd' });
});
