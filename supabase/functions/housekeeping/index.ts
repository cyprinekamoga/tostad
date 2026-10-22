// Gallring enligt integritetspolicyn. Körs när en administratör öppnar administrationen
// (högst en gång per dygn räcker, men det gör inget att den körs oftare):
// - nekade jobbansökningar och deras CV raderas 24 månader efter beslutet
// - förfrågningar i inkorgen som inte blev uppdrag raderas efter 12 månader (skadeanmälningar sparas)
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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
    Vary: 'Origin',
  };
}
const reply = (req: Request, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

const monthsAgo = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString();
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return reply(req, 405, { error: 'Fel metod' });
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await db.auth.getUser(token);
  if (!auth?.user) return reply(req, 401, { error: 'Logga in' });
  const { data: me } = await db.from('profiles').select('role, active').eq('id', auth.user.id).maybeSingle();
  if (!me?.active || !['owner', 'admin'].includes(me.role)) return reply(req, 403, { error: 'Bara administratörer' });

  // Nekade ansökningar äldre än 24 månader
  const { data: oldApps } = await db.from('applications').select('id, cv_path').eq('status', 'nej').lt('decided_at', monthsAgo(24)).limit(500);
  const cvs = (oldApps ?? []).map((a) => a.cv_path).filter(Boolean) as string[];
  if (cvs.length) await db.storage.from('cv').remove(cvs);
  if (oldApps?.length) await db.from('applications').delete().in('id', oldApps.map((a) => a.id));

  // Förfrågningar som inte blev uppdrag, äldre än 12 månader
  const { data: oldSubs } = await db
    .from('submissions')
    .select('id, files, jobs!jobs_submission_id_fkey(id)')
    .in('kind', ['bokning', 'kontakt'])
    .lt('created_at', monthsAgo(12))
    .limit(500);
  const unused = (oldSubs ?? []).filter((s) => !(s.jobs as unknown[] | null)?.length);
  let removedSubs = 0;
  if (unused.length) {
    const ids = unused.map((s) => s.id);
    // Accepterade offerter räknas som uppdrag även om jobbet inte är skapat.
    const { data: accepted } = await db.from('quotes').select('submission_id').in('submission_id', ids).eq('status', 'accepterad');
    const keep = new Set((accepted ?? []).map((q) => q.submission_id));
    const remove = unused.filter((s) => !keep.has(s.id));
    const files = remove.flatMap((s) => s.files ?? []);
    if (files.length) await db.storage.from('inbox').remove(files);
    if (remove.length) {
      await db.from('submissions').delete().in('id', remove.map((s) => s.id));
      removedSubs = remove.length;
    }
  }
  return reply(req, 200, { ok: true, applications: oldApps?.length ?? 0, submissions: removedSubs });
});
