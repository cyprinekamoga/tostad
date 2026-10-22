// Offert eller faktura via kundens länk (/dokument?t=...). Länken innehåller en hemlig nyckel per
// dokument. Kunden kan läsa dokumentet, skriva ut det som PDF och acceptera eller tacka nej till
// en offert. En accepterad offert hamnar som en bokning i inkorgen.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ORIGINS = ['https://tostadflytt.se', 'https://www.tostadflytt.se', 'https://tostadflytt-preview.netlify.app', 'http://localhost:4321', 'http://127.0.0.1:4321'];
const PREVIEW = /^https:\/\/[a-z0-9-]+--tostadflytt-preview\.netlify\.app$/;
const COMPANY = {
  name: 'TO Städ & Flytt',
  legalName: 'TO Städ och Flytt AB',
  orgNr: '559470-3398',
  street: 'Hasselgatan 58',
  postalCode: '194 37',
  city: 'Upplands Väsby',
  web: 'tostadflytt.se',
};

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

const isToken = (t: unknown): t is string => typeof t === 'string' && /^[0-9a-f-]{36}$/i.test(t);
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });

const QUOTE_COLS = 'id, number, status, service, buyer, street, postal_code, city, wanted_date, lines, rut_persons, net, vat, total, rut, rounding, to_pay, message, valid_until, sent_at, decided_at, decided_name, customer_id';
const INVOICE_COLS = 'id, number, kind, credit_of, status, issue_date, due_date, delivery_date, ocr, buyer, your_ref, lines, rut_persons, net, vat, total, rut, rounding, to_pay, message, paid_at';

async function company() {
  const { data: s } = await db.from('company_settings').select('bankgiro, vat_nr, payment_days, late_interest, invoice_note, email, phone').eq('id', 1).maybeSingle();
  return { ...COMPANY, vatNr: s?.vat_nr ?? 'SE559470339801', bankgiro: s?.bankgiro ?? null, email: s?.email ?? 'info@tostadflytt.se', phone: s?.phone ?? '072 222 88 00', lateInterest: s?.late_interest ?? '', invoiceNote: s?.invoice_note ?? '' };
}

// Bara de fält kunden ska se på raderna.
const publicLines = (lines: unknown) =>
  (Array.isArray(lines) ? lines : []).map((l: Record<string, unknown>) => ({ text: l.text ?? '', qty: l.qty, unit: l.unit ?? '', price: l.price, vat: l.vat ?? 25, rut: !!l.rut }));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });

  if (req.method === 'GET') {
    const t = new URL(req.url).searchParams.get('t');
    if (!isToken(t)) return reply(req, 404, { error: 'Länken fungerar inte' });

    const { data: quote } = await db.from('quotes').select(QUOTE_COLS).eq('token', t).neq('status', 'utkast').maybeSingle();
    if (quote) {
      if (quote.status === 'skickad') {
        await db.from('quotes').update({ status: 'oppnad', opened_at: new Date().toISOString() }).eq('id', quote.id).eq('status', 'skickad');
        quote.status = 'oppnad';
      }
      const expired = !!quote.valid_until && quote.valid_until < today();
      const { id: _id, customer_id: _c, ...doc } = quote;
      return reply(req, 200, { type: 'offert', company: await company(), doc: { ...doc, lines: publicLines(quote.lines), expired } });
    }

    const { data: inv } = await db.from('invoices').select(INVOICE_COLS).eq('token', t).neq('status', 'utkast').maybeSingle();
    if (inv) {
      const [{ data: people }, credited] = await Promise.all([
        db.from('rut_people').select('name').eq('invoice_id', inv.id).not('pnr_enc', 'is', null).lte('slot', inv.rut_persons).order('slot'),
        inv.credit_of ? db.from('invoices').select('number').eq('id', inv.credit_of).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const { id: _id, credit_of: _co, ...doc } = inv;
      return reply(req, 200, {
        type: inv.kind === 'kredit' ? 'kredit' : 'faktura',
        company: await company(),
        doc: { ...doc, lines: publicLines(inv.lines), rut_names: inv.rut ? (people ?? []).map((p) => p.name) : [], credit_of_number: credited.data?.number ?? null },
      });
    }
    return reply(req, 404, { error: 'Länken fungerar inte' });
  }

  if (req.method !== 'POST') return reply(req, 405, { error: 'Fel metod' });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(req, 400, { error: 'Ogiltig begäran' });
  }
  if (!isToken(body.t)) return reply(req, 404, { error: 'Länken fungerar inte' });
  const action = body.action;
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : '';
  const { data: quote } = await db.from('quotes').select(QUOTE_COLS).eq('token', body.t).maybeSingle();
  if (!quote || !['skickad', 'oppnad'].includes(quote.status)) return reply(req, 409, { error: 'Offerten kan inte besvaras längre' });
  if (quote.valid_until && quote.valid_until < today()) return reply(req, 409, { error: 'Offerten har gått ut. Kontakta oss så skickar vi en ny.' });

  if (action === 'decline') {
    await db.from('quotes').update({ status: 'avbojd', decided_at: new Date().toISOString(), decided_name: name || null }).eq('id', quote.id);
    return reply(req, 200, { ok: true, status: 'avbojd' });
  }
  if (action !== 'accept') return reply(req, 400, { error: 'Okänd åtgärd' });
  if (name.length < 2) return reply(req, 400, { error: 'Skriv ditt namn för att acceptera' });

  const { data: updated, error } = await db
    .from('quotes')
    .update({ status: 'accepterad', decided_at: new Date().toISOString(), decided_name: name })
    .eq('id', quote.id)
    .in('status', ['skickad', 'oppnad'])
    .select('id');
  if (error || !updated?.length) return reply(req, 409, { error: 'Offerten kan inte besvaras längre' });

  // Bokningen i inkorgen, så att den kan bli ett jobb med ett klick.
  const buyer = (quote.buyer ?? {}) as Record<string, string>;
  const digits = (quote.postal_code ?? '').replace(/\D/g, '');
  await db.from('submissions').insert({
    kind: 'bokning',
    status: 'ny',
    name: buyer.name || name,
    email: buyer.email || null,
    phone: buyer.phone || null,
    customer_id: quote.customer_id,
    data: {
      tjanst: quote.service,
      pris: String(Math.round(Number(quote.to_pay))),
      datum: quote.wanted_date ?? '',
      adress: quote.street ?? '',
      postnummer: digits,
      ovrigt: `Offert ${quote.number} accepterad av ${name}.`,
      namn: buyer.name || name,
      epost: buyer.email || '',
      telefon: buyer.phone || '',
    },
  });
  return reply(req, 200, { ok: true, status: 'accepterad' });
});
