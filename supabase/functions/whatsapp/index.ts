// WhatsApp-webhook för företagsnumret (WhatsApp Cloud API, direkt hos Meta eller via en leverantör).
// - Personal och administratörer (känns igen på mobilnumret) läses direkt av jobbassistenten och får
//   ett kort svar. Förslagen väntar på godkännande under Job assistant.
// - Kunders meddelanden sparas bara. En administratör väljer själv att låta assistenten läsa dem.
//   Kunder får aldrig svar från AI:n.
import { createClient } from 'npm:@supabase/supabase-js@2';

const secretKey = (() => {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  return keys ? JSON.parse(keys).default : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
})();
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const db = createClient(SUPABASE_URL, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const SITE = 'https://tostadflytt.se';

// Nycklar som räknas fram ur projektets hemliga nyckel, så att inga fler hemligheter behöver läggas in.
async function derived(label: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${secretKey}:${label}`));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}
const verifyToken = async () => Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? (await derived('whatsapp-verify'));

/** Svenska nummer i samma form som WhatsApp skickar dem: 46701234567. */
export function waPhone(value: string | null | undefined) {
  let d = String(value ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = `46${d.slice(1)}`;
  if (d.startsWith('460')) d = `46${d.slice(3)}`;
  return d;
}

async function validSignature(req: Request, raw: string) {
  const secret = Deno.env.get('WHATSAPP_APP_SECRET');
  const url = new URL(req.url);
  // Utan appens hemlighet (t.ex. via en leverantör) måste webhook-adressen innehålla den hemliga nyckeln.
  if (!secret) {
    return url.searchParams.get('key') === (await verifyToken());
  }
  const header = req.headers.get('x-hub-signature-256') ?? '';
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(raw));
  const expected = `sha256=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  if (header.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < header.length; i++) diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** Skickar ett textmeddelande. Fungerar bara inom 24 timmar efter personens senaste meddelande. */
async function send(to: string, body: string) {
  const d360 = Deno.env.get('WHATSAPP_D360_KEY');
  const token = Deno.env.get('WHATSAPP_TOKEN');
  const phoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  const version = Deno.env.get('WHATSAPP_GRAPH_VERSION') ?? 'v23.0';
  const payload = { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body } };
  let res: Response;
  if (d360) {
    res = await fetch('https://waba-v2.360dialog.io/messages', { method: 'POST', headers: { 'D360-API-KEY': d360, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } else if (token && phoneId) {
    res = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } else {
    console.error('whatsapp: no sending credentials');
    return;
  }
  if (!res.ok) console.error('whatsapp send', res.status, (await res.text()).slice(0, 300));
  else {
    const json = await res.json().catch(() => ({}));
    const id = json?.messages?.[0]?.id ?? `out-${crypto.randomUUID()}`;
    await db.from('whatsapp_messages').insert({ wa_id: id, phone: to, direction: 'out', body, handled: true });
  }
}

type Incoming = { id: string; from: string; name: string | null; type: string; text: string | null; timestamp: number; echoTo?: string };

// deno-lint-ignore no-explicit-any
function collect(payload: any): Incoming[] {
  const out: Incoming[] = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const v = change?.value ?? {};
      const names = Object.fromEntries((v.contacts ?? []).map((c: { wa_id: string; profile?: { name?: string } }) => [c.wa_id, c.profile?.name ?? null]));
      for (const m of v.messages ?? []) {
        out.push({ id: m.id, from: m.from, name: names[m.from] ?? null, type: m.type, text: m.text?.body ?? m.caption ?? m.image?.caption ?? null, timestamp: Number(m.timestamp) || 0 });
      }
      // Meddelanden som ägaren skickar från WhatsApp Business-appen (när appen och API:t delar nummer).
      for (const m of v.message_echoes ?? []) {
        out.push({ id: m.id, from: m.from, name: null, type: m.type, text: m.text?.body ?? null, timestamp: Number(m.timestamp) || 0, echoTo: m.to });
      }
    }
  }
  return out;
}

async function staffByPhone() {
  const { data } = await db.from('profiles').select('id, full_name, phone, role').eq('active', true);
  const map = new Map<string, { id: string; full_name: string; role: string }>();
  for (const p of data ?? []) if (p.phone) map.set(waPhone(p.phone), p);
  return map;
}

async function analyse(text: string, opts: { fromProfile?: string | null; senderPhone: string }) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-key': await derived('assistant-internal') },
    body: JSON.stringify({ text, from_profile: opts.fromProfile ?? null, sender_phone: opts.senderPhone }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'The assistant did not answer');
  return json.draft;
}

async function handle(messages: Incoming[]) {
  const people = await staffByPhone();
  for (const m of messages) {
    const outgoing = !!m.echoTo;
    const phone = outgoing ? m.echoTo! : m.from;
    const person = outgoing ? null : people.get(phone) ?? null;
    const text = m.type === 'text' ? m.text : m.text ?? null;
    const { error } = await db.from('whatsapp_messages').insert({
      wa_id: m.id,
      phone,
      name: m.name,
      direction: outgoing ? 'out' : 'in',
      kind: m.type,
      body: text,
      profile_id: person?.id ?? null,
      handled: outgoing,
      created_at: m.timestamp ? new Date(m.timestamp * 1000).toISOString() : undefined,
    });
    // Redan mottaget (WhatsApp skickar ibland samma meddelande igen).
    if (error) continue;
    if (outgoing || !person) continue;

    if (!text?.trim()) {
      await send(phone, 'I can only read text messages. Please write the report as text.');
      continue;
    }
    try {
      const draft = await analyse(text, { fromProfile: person.role === 'employee' ? person.id : null, senderPhone: phone });
      await db.from('whatsapp_messages').update({ draft_id: draft.id, handled: true }).eq('wa_id', m.id);
      const n = draft.result?.actions?.length ?? 0;
      if (person.role === 'employee') {
        await send(phone, n ? 'Thanks! Your report is received and will be checked.' : 'Thanks! I could not find any hours, jobs or changes in the message. Your manager will see it.');
      } else {
        const list = (draft.result?.actions ?? []).slice(0, 8).map((a: { title: string }) => `• ${a.title}`).join('\n');
        await send(phone, `${draft.result?.summary ?? ''}\n\n${n ? `${n} suggestion${n === 1 ? '' : 's'}:\n${list}\n\nCheck and save: ${SITE}/admin/assistent?d=${draft.id}` : 'Nothing to do in this message.'}`);
      }
    } catch (e) {
      console.error('whatsapp analyse', e);
      await send(phone, 'Sorry, the assistant could not read the message right now. It is saved, and you can read it under Job assistant in the admin.');
    }
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  // Meta kontrollerar webhook-adressen med ett GET-anrop.
  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === (await verifyToken());
    return ok ? new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 }) : new Response('Forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  const raw = await req.text();
  if (!(await validSignature(req, raw))) return new Response('Forbidden', { status: 403 });
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const messages = collect(payload);
  // Svara WhatsApp direkt; läsningen tar upp till en halv minut och görs i bakgrunden.
  if (messages.length) {
    // deno-lint-ignore no-explicit-any
    const runtime = (globalThis as any).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(handle(messages).catch((e) => console.error('whatsapp', e)));
    else await handle(messages);
  }
  return new Response('OK', { status: 200 });
});
