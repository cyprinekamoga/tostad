// Jobbassistenten: läser en text (från en kund, en hyresvärd eller personalen) och föreslår
// jobb, ändringar, timmar och uppföljningar. Förslagen sparas som ett utkast; inget ändras i
// planeringen förrän en administratör har godkänt dem på /admin/assistent.
// Används av administrationen (inloggad administratör) och av WhatsApp-funktionen (internt).
import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

const ORIGINS = ['https://tostadflytt.se', 'https://www.tostadflytt.se', 'https://tostadflytt-preview.netlify.app', 'http://localhost:4321', 'http://127.0.0.1:4321'];
const PREVIEW = /^https:\/\/[a-z0-9-]+--tostadflytt-preview\.netlify\.app$/;
const MODEL = 'claude-opus-5-5';
const TZ = 'Europe/Stockholm';

const secretKey = (() => {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  return keys ? JSON.parse(keys).default : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
})();
const db = createClient(Deno.env.get('SUPABASE_URL')!, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

// Nycklar som räknas fram ur projektets hemliga nyckel, så att inga fler hemligheter behöver läggas in.
async function derived(label: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${secretKey}:${label}`));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

function cors(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) || PREVIEW.test(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info, x-internal-key',
    Vary: 'Origin',
  };
}
const reply = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

// Svensk tid
const partsFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function zoned(when: string | number | Date) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(when)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
}
const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const weekdayIdx = (date: string) => (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
function isoWeek(date: string) {
  const thursday = addDays(date, 3 - weekdayIdx(date));
  const first = `${thursday.slice(0, 4)}-01-04`;
  const firstMonday = addDays(first, -weekdayIdx(first));
  return 1 + Math.floor((Date.parse(thursday) - Date.parse(firstMonday)) / (7 * 864e5));
}

// Personnummer skickas aldrig till AI-tjänsten.
const PNR = /\b(?:19|20)?\d{6}[-+ ]?(?:\d{4}|[xX]{4})\b/g;
const stripPnr = (text: string) => {
  let removed = false;
  const out = text.replace(PNR, (m) => {
    // Telefonnummer (07x...) räknas inte som personnummer.
    if (/^0\d/.test(m.replace(/\D/g, ''))) return m;
    removed = true;
    return '[personal identity number removed]';
  });
  return { text: out, removed };
};

const SERVICES = ['hemstadning', 'storstadning', 'flyttstadning', 'fonsterputs', 'kontor', 'flytt', 'paket', 'pianoflytt', 'annat'];
// Strukturerade svar tillåter bara ett fåtal fält som kan vara null, så tomma värden skrivs som
// "" eller 0 och görs om till null efteråt (se blankToNull).
const str = { type: 'string' };
const num = { type: 'number' };
const int = { type: 'integer' };
const bool = { type: 'boolean' };

const ACTION = {
  type: 'object',
  additionalProperties: false,
  required: [
    'kind', 'title', 'confidence', 'questions', 'source_quote',
    'job_id', 'job_ids', 'customer_id', 'new_customer',
    'service', 'date', 'date_text', 'start', 'hours',
    'street', 'apartment', 'postal_code', 'city', 'to_street', 'to_postal_code', 'to_city',
    'staff_ids', 'remove_staff_ids', 'staff_note', 'internal_note', 'repeat_weeks', 'repeat_until',
    'price_explicit', 'price_basis', 'hours_entries', 'absence',
  ],
  properties: {
    kind: { type: 'string', enum: ['create_job', 'update_job', 'cancel_jobs', 'mark_done', 'report_hours', 'add_absence', 'follow_up'] },
    title: { type: 'string', description: 'Short English description shown to the owner, e.g. "Move-out cleaning Hammargatan 12B lgh 1102".' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    questions: { type: 'array', items: { type: 'string' }, description: 'Things the owner must check or decide, in English. Empty if nothing is unclear.' },
    source_quote: { type: 'string', description: 'The exact part of the text this action comes from.' },
    job_id: { ...str, description: 'Existing job id from the job list, for update_job, mark_done and report_hours.' },
    job_ids: { type: 'array', items: { type: 'string' }, description: 'Existing job ids to cancel, for cancel_jobs.' },
    customer_id: { ...str, description: 'Existing customer id from the customer list, when one clearly matches.' },
    new_customer: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'kind', 'phone', 'email', 'contact_person', 'notes'],
      properties: {
        name: { type: 'string' },
        kind: { type: 'string', enum: ['private', 'company', ''] },
        phone: str,
        email: str,
        contact_person: str,
        notes: str,
      },
    },
    service: { type: 'string', enum: [...SERVICES, ''] },
    date: { ...str, description: 'YYYY-MM-DD. For update_job, the new date (empty if unchanged).' },
    date_text: { ...str, description: 'How the date was written in the text, e.g. "v.45", "fredag", "innan 15 december".' },
    start: { ...str, description: 'HH:MM. For update_job, the new start time (empty if unchanged).' },
    hours: { ...num, description: 'Expected length of the job in hours (create_job/update_job).' },
    street: str,
    apartment: { ...str, description: 'Apartment number, e.g. "1102".' },
    postal_code: str,
    city: str,
    to_street: str,
    to_postal_code: str,
    to_city: str,
    staff_ids: { type: 'array', items: { type: 'string' }, description: 'Staff profile ids to book (create_job) or add (update_job).' },
    remove_staff_ids: { type: 'array', items: { type: 'string' }, description: 'Staff profile ids to take off the job (update_job).' },
    staff_note: { ...str, description: 'Swedish note for the staff: door code, key, what to do, warnings. Keep the original wording.' },
    internal_note: { ...str, description: 'Note only for admins: invoicing, reference person, inspection time, follow-ups.' },
    repeat_weeks: { ...int, description: 'For recurring jobs: 1 = every week, 2 = every other week. 0 for one-off jobs.' },
    repeat_until: { ...str, description: 'YYYY-MM-DD, last date of the series. Empty means about three months ahead.' },
    price_explicit: { ...num, description: 'A price written in the text (what the customer pays incl. VAT, after RUT for private customers). 0 otherwise.' },
    price_basis: {
      type: 'object',
      additionalProperties: false,
      required: ['sqm', 'rooms', 'windows2', 'windows4', 'clean_hours', 'recurring', 'company', 'same_as_last_time'],
      properties: {
        sqm: num,
        rooms: { type: 'string', enum: ['1', '2', '3', '4', 'villa', ''] },
        windows2: int,
        windows4: { ...int, description: 'Windows with spröjs (muntins) or four sides to clean.' },
        clean_hours: { ...num, description: 'Hours for home or deep cleaning, if known or reasonably estimated.' },
        recurring: bool,
        company: { ...bool, description: 'True when a company or landlord pays (no RUT).' },
        same_as_last_time: { ...bool, description: 'True when the text says "same price as last time".' },
      },
    },
    hours_entries: {
      type: 'array',
      description: 'For report_hours, and for create_job when the text reports hours for a job that is not in the job list: one entry per person.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['profile_id', 'hours', 'note'],
        properties: { profile_id: { type: 'string' }, hours: { type: 'number' }, note: str },
      },
    },
    absence: {
      type: 'object',
      additionalProperties: false,
      required: ['profile_id', 'kind', 'from', 'to', 'note'],
      properties: {
        profile_id: { type: 'string' },
        kind: { type: 'string', enum: ['sjuk', 'ledighet', 'kan_inte', ''] },
        from: { type: 'string' },
        to: { type: 'string' },
        note: str,
      },
    },
  },
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'sender', 'actions'],
  properties: {
    summary: { type: 'string', description: 'One or two English sentences: who wrote and what they want.' },
    sender: { type: 'string', enum: ['company', 'private', 'recurring_customer', 'staff', 'unknown'] },
    actions: { type: 'array', items: ACTION },
  },
};

const INSTRUCTIONS = `You are the job assistant for TO Städ & Flytt AB, a cleaning and moving company in Sweden (Stockholm and Eskilstuna area). The owner pastes or forwards messages, usually in Swedish and often written quickly on a phone. Turn each message into concrete suggested actions for the job planner. The owner checks every suggestion before anything is saved, so be complete but honest about uncertainty.

Action kinds:
- create_job: a new job or booking. For a list of apartments, one action per apartment. For recurring work (e.g. "varannan vecka", "tisd + fred"), one action per weekday with repeat_weeks set; the date is the first occurrence.
- update_job: change an existing job (new date or time, staff changes, extra work, door code or key info, longer time). Use job_id from the job list. Only fill the fields that change; put new info for the staff in staff_note (it is appended).
- cancel_jobs: cancel existing jobs (customer away, cancelled cleaning). List every affected job_id from the job list. When a customer ends a recurring cleaning after a date, cancel the jobs after that date.
- mark_done: staff say a job is finished. Use job_id; put remarks (e.g. "balkongen låst", "nycklar tillbaka i skåpet") in internal_note.
- report_hours: staff report hours. One action per job with job_id and date, and one hours_entries item per person. "jag" means the sender. Use decimal hours ("5,5h" = 5.5).
- add_absence: a staff member is sick or away (e.g. "Anna sjuk").
- follow_up: anything that needs the owner and does not fit above: a price question, a lead from a customer that will call, a change of a recurring schedule's rhythm, problems on site, a customer asking what something costs. Write the title as a clear to-do.

Matching:
- Match existing customers by name, phone, email or address from the customer list. If none matches, fill new_customer (customer_id empty). A landlord or property company that orders work and is invoiced is the customer (kind company); put the reference person and invoicing info in new_customer.notes and internal_note.
- Match existing jobs by address, customer, date and staff from the job list. Staff write short names ("holm", "kvicksund", "fröslunda trapphus", "storgatan"): match them to today's or the most recent jobs. If several jobs could match, pick the most likely and add a question.
- Match staff by first name or nickname from the staff list. Never invent ids: every id you return must come from the lists. If you cannot match, leave the id out and ask in questions.

How the company's WhatsApp group writes (learn these formats):
- Staff hours reports, one block per job: a date line "26/9/26" (day/month/year), then the address, often with the size in brackets ("Baranstigen 8[160kvm]", "Atlasgatan 9(60kvm"), then one line per person "Name_hours" or "Name _3hrs" ("Mukwaya_9", "Hajara _3.5", "John__6"). "Address_5" on one line means that address, 5 hours, for the person the list belongs to.
- A personal list: many "date / Address_hours" lines and "Total=44.5hrs". The person is named on the first line ("Edgar"), in the total ("Total hours for Massy=25hrs"), or in a separate message right after the list ("☝ mukwaya", "☝ john"). Lists like "26 sept, Franzéngatan 28, 5h" are the same thing. A sender writing "Sophia_3" or a list with no name is reporting their own hours unless another name is given. Check that the lines add up to the stated total; if not, add a question.
- Tags: "[moving]" or a list headed "FLYTT" means a move (service flytt). "[spic and span]" means the job came from the partner company Spic and Span: use that customer (kind company) and service hemstadning; put the end customer in internal_note. A size in kvm without a tag usually means move-out cleaning (flyttstadning). "#paid per hour(21hrs)#" means invoiced by the hour; put it in internal_note. Repeated addresses with the same person (e.g. weekly) are home cleaning (hemstadning).
- Bookings lists: "date / customer first name / address[size]" blocks, or numbered lists like "9.Olga - +46762667141 / Datum - 19/10 kl 09.00 / Skogängsvägen 13B Spånga (72 kvm)". One create_job per booking with the time, phone (write Swedish numbers as 07..., "+4607..." is a typo for "+467...") and size. A list numbered from 9 means earlier items are missing; say so in summary.
- Forwarded booking platform texts ("Regular Basic Cleaning 2026-10-16 09:00:00 3h x 1 person ... Name on the doorbell ... 80 sq.m."): service hemstadning, the date and time as given, hours from "3h x 1 person".
- Forwarded moving orders ("FLYTT / Datum / Från / Till / Bostad: 2 rok, 46 kvm / Att flytta: ..."; "Flytt IMORGON kl 09:00 ... Swish 7117kr ... 8 hours + transport"): service flytt with from and to addresses; the furniture list goes in staff_note; a stated amount goes in price_explicit.
- Hours for work that is in the job list: report_hours with job_id. Hours for work that is not in the job list (usually a past job that was never planned): create_job for that date and address with staff_ids and hours_entries, hours = the longest time anyone worked, and the size in internal_note. Never create the same job twice when several messages report the same address and date: merge the people into one job. The same address on two dates is two jobs.
- Typos are common: a date like "2/9/26" inside a list of October dates, "21/19/26" or "5/10=26" is probably the date the lists around it suggest; use it and add a question. Street names may be misspelled ("Fungfrudansen", "Junfrudansens" = Jungfrudansen 5): match them to the job list.

Dates and times:
- Today is given below with a calendar. "v.45" or "vecka 46" means that ISO week; for move-out cleaning in a week, use the Monday unless the text says otherwise and add a question. "avflytt 31/10" means the tenant moves out then, so the cleaning is after that date and before the inspection ("besiktning"); suggest the first working day after move-out and put the inspection in internal_note.
- "fredag", "nästa vecka", "innan visning på fredag" etc. are relative to today. If the work must be done before a deadline, pick a date before it and say so in questions.
- A new booking with a date in the past or an odd year (for example 2025 when it is now 2026) is probably a typo: suggest the next sensible date and add a question. Hours reports are about work already done, so past dates there are normal.
- Keep date_text exactly as written.
- If no time is given, use 08:00 for move-out cleaning and moving, 09:00 otherwise, and add nothing to questions just for that.

Services: hemstadning (home cleaning, also recurring), storstadning (deep or one-off big cleaning, including cleaning after renovation, "snabbstäd" before a viewing), flyttstadning (move-out cleaning), fonsterputs (window cleaning), kontor (office and stairwell cleaning, "trapphusstädning"), flytt (moving), paket (moving + move-out cleaning), pianoflytt (piano and heavy lifting), annat.

Prices: do not calculate prices yourself; the system uses the company's price calculator. Fill price_basis with what the text says: sqm, rooms ("2 rok" = 2, "3a" = 3, villa/radhus = villa), windows (spröjs = windows4), hours for home cleaning (estimate from home size if missing: about 1 hour per 25 m², at least 2), recurring, company. If the text states a price, put it in price_explicit. "Samma pris som förra" means same_as_last_time.

Hours for create_job: a sensible job length, e.g. move-out cleaning about 1 hour per 15 m² for a team of two, window cleaning about 15 minutes per window.

Notes: staff_note is Swedish and shown to the staff (door code, key box code, "ugnen mkt smutsig", pets, balcony included). internal_note is for the owner (invoicing, reference, inspection time, "återkommer om pris").

Every field must be present. Use an empty string, 0, false or an empty list when something is unknown or does not apply; fill new_customer (name empty when not needed), price_basis and absence (profile_id empty when not used) with empty values in the same way.

Write titles, summary and questions in English. Keep names, addresses and staff notes as written. If the text contains nothing to do, return an empty actions list and explain in summary. A personal identity number may have been removed from the text; if so, add a question asking the owner to add it on the invoice.`;

function compactCalendar(today: string) {
  const lines = [];
  const monday = addDays(today, -weekdayIdx(today));
  for (let w = -1; w < 10; w++) {
    const start = addDays(monday, 7 * w);
    lines.push(`Week ${isoWeek(start)}: Mon ${start} to Sun ${addDays(start, 6)}`);
  }
  return lines.join('\n');
}

async function context(today: string) {
  const from = `${addDays(today, -60)}T00:00:00Z`;
  const to = `${addDays(today, 150)}T00:00:00Z`;
  const [customers, staff, jobs] = await Promise.all([
    db.from('customers').select('id, kind, name, phone, email, street, postal_code, city').order('name').limit(1500),
    db.from('profiles').select('id, full_name, phone, role').eq('active', true).order('full_name'),
    db
      .from('jobs')
      .select('id, service, title, status, starts_at, ends_at, street, city, series_id, customer_id, customers(name), job_staff(profile_id)')
      .gte('starts_at', from)
      .lt('starts_at', to)
      .neq('status', 'avbokad')
      .order('starts_at')
      .limit(1500),
  ]);
  const names = Object.fromEntries((staff.data ?? []).map((p) => [p.id, p.full_name]));
  const customerLines = (customers.data ?? []).map((c) =>
    [c.id, c.kind === 'company' ? 'company' : 'private', c.name, c.phone, c.email, [c.street, c.postal_code, c.city].filter(Boolean).join(' ')].filter(Boolean).join(' | '),
  );
  const staffLines = (staff.data ?? []).map((p) => [p.id, p.full_name, p.phone, p.role].filter(Boolean).join(' | '));
  const jobLines = (jobs.data ?? []).map((j) => {
    const s = zoned(j.starts_at);
    const e = zoned(j.ends_at);
    // deno-lint-ignore no-explicit-any
    const cust = (j as any).customers?.name ?? '';
    // deno-lint-ignore no-explicit-any
    const team = ((j as any).job_staff ?? []).map((x: { profile_id: string }) => names[x.profile_id] ?? '').filter(Boolean).join(', ');
    return [j.id, `${s.date} ${s.time}-${e.time}`, j.service, j.status, cust, j.title, [j.street, j.city].filter(Boolean).join(', '), team && `staff: ${team}`, j.series_id && 'recurring']
      .filter(Boolean)
      .join(' | ');
  });
  return {
    text: `CUSTOMERS (id | type | name | phone | email | address)\n${customerLines.join('\n') || '(none)'}\n\nSTAFF (id | name | phone | role)\n${staffLines.join('\n') || '(none)'}\n\nJOBS from 2 months ago to 5 months ahead (id | date time | service | status | customer | title | address | staff)\n${jobLines.join('\n') || '(none)'}`,
    ids: {
      customers: new Set((customers.data ?? []).map((c) => c.id)),
      staff: new Set((staff.data ?? []).map((p) => p.id)),
      jobs: new Set((jobs.data ?? []).map((j) => j.id)),
    },
  };
}

// "" och 0 betyder "saknas" i svaret. Gör om dem till null så att resten av koden blir enkel.
// deno-lint-ignore no-explicit-any
function blankToNull(result: any) {
  const blank = (v: unknown) => (v === '' || v === 0 ? null : v);
  for (const a of result.actions ?? []) {
    for (const k of ['job_id', 'customer_id', 'service', 'date', 'date_text', 'start', 'hours', 'street', 'apartment', 'postal_code', 'city', 'to_street', 'to_postal_code', 'to_city', 'staff_note', 'internal_note', 'repeat_weeks', 'repeat_until', 'price_explicit']) a[k] = blank(a[k]);
    if (!a.new_customer?.name) a.new_customer = null;
    else for (const k of ['phone', 'email', 'contact_person', 'notes']) a.new_customer[k] = blank(a.new_customer[k]);
    if (!a.absence?.profile_id) a.absence = null;
    const b = a.price_basis;
    if (b) {
      for (const k of ['sqm', 'rooms', 'windows2', 'windows4', 'clean_hours']) b[k] = blank(b[k]);
      if (!b.sqm && !b.rooms && !b.windows2 && !b.windows4 && !b.clean_hours && !b.recurring && !b.company && !b.same_as_last_time) a.price_basis = null;
    }
    for (const h of a.hours_entries ?? []) h.note = blank(h.note);
  }
  return result;
}

// Tar bort id:n som inte finns, så att ett påhittat id aldrig når planeringen.
// deno-lint-ignore no-explicit-any
function clean(result: any, ids: { customers: Set<string>; staff: Set<string>; jobs: Set<string> }) {
  for (const a of result.actions ?? []) {
    const flag = (what: string) => a.questions.push(`The assistant referred to a ${what} that does not exist. Choose it yourself.`);
    if (a.customer_id && !ids.customers.has(a.customer_id)) {
      a.customer_id = null;
      flag('customer');
    }
    if (a.job_id && !ids.jobs.has(a.job_id)) {
      a.job_id = null;
      flag('job');
    }
    const keepJobs = (a.job_ids ?? []).filter((id: string) => ids.jobs.has(id));
    if (keepJobs.length !== (a.job_ids ?? []).length) flag('job');
    a.job_ids = keepJobs;
    for (const key of ['staff_ids', 'remove_staff_ids']) {
      const keep = (a[key] ?? []).filter((id: string) => ids.staff.has(id));
      if (keep.length !== (a[key] ?? []).length) flag('staff member');
      a[key] = keep;
    }
    const entries = (a.hours_entries ?? []).filter((h: { profile_id: string }) => ids.staff.has(h.profile_id));
    if (entries.length !== (a.hours_entries ?? []).length) flag('staff member');
    a.hours_entries = entries;
    if (a.absence && !ids.staff.has(a.absence.profile_id)) {
      a.absence = null;
      flag('staff member');
    }
  }
  return result;
}

/** Läser texten med Claude och sparar ett utkast. Returnerar utkastet. */
async function analyse(input: string, opts: { source: 'paste' | 'whatsapp'; fromProfile?: string | null; senderPhone?: string | null; createdBy?: string | null }) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('The AI key is missing. Add ANTHROPIC_API_KEY under Edge Functions, Secrets in Supabase.');
  const now = new Date();
  const today = zoned(now).date;
  const { text, removed } = stripPnr(input);
  const ctx = await context(today);
  let sender = '';
  if (opts.fromProfile) {
    const { data: p } = await db.from('profiles').select('full_name').eq('id', opts.fromProfile).maybeSingle();
    if (p) sender = `The message was written by staff member ${p.full_name} (id ${opts.fromProfile}). "jag" means this person.`;
  }
  if (!sender && opts.senderPhone) sender = `The message came from phone number ${opts.senderPhone}.`;

  const client = new Anthropic({ apiKey });
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: [
      { type: 'text', text: INSTRUCTIONS, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: ctx.text, cache_control: { type: 'ephemeral' } },
    ],
    messages: [
      {
        role: 'user',
        content: `Today is ${DAYS[weekdayIdx(today)]} ${today} (ISO week ${isoWeek(today)}), time ${zoned(now).time} in Sweden.\nCalendar:\n${compactCalendar(today)}\n\n${sender}${removed ? '\nA personal identity number was removed from the text before you saw it.' : ''}\n\nMESSAGE:\n${text}`,
      },
    ],
  // deno-lint-ignore no-explicit-any
  } as any);

  if (response.stop_reason === 'refusal') throw new Error('The AI could not read this text. Try again or add the jobs by hand.');
  if (response.stop_reason === 'max_tokens') throw new Error('The text was too long to read in one go. Split it into smaller parts.');
  // deno-lint-ignore no-explicit-any
  const block = (response.content as any[]).find((b) => b.type === 'text');
  if (!block) throw new Error('The AI returned no answer. Try again.');
  const result = clean(blankToNull(JSON.parse(block.text)), ctx.ids);
  result.model = response.model;
  result.usage = { input: response.usage.input_tokens, cached: response.usage.cache_read_input_tokens ?? 0, output: response.usage.output_tokens };
  result.pnr_removed = removed;

  const { data: draft, error } = await db
    .from('assistant_drafts')
    .insert({ source: opts.source, input, result, from_profile: opts.fromProfile ?? null, sender_phone: opts.senderPhone ?? null, created_by: opts.createdBy ?? null })
    .select('*')
    .single();
  if (error) throw new Error('Could not save the draft.');
  return draft;
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

  // Anrop från WhatsApp-funktionen använder en intern nyckel i stället för inloggning.
  const isInternal = req.headers.get('x-internal-key') === (await derived('assistant-internal'));
  let me: { id: string } | null = null;
  if (!isInternal) {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth } = token ? await db.auth.getUser(token) : { data: null };
    if (!auth?.user) return reply(req, 401, { error: 'Please log in' });
    const { data: profile } = await db.from('profiles').select('id, role, active').eq('id', auth.user.id).maybeSingle();
    if (!profile?.active || !['owner', 'admin'].includes(profile.role)) return reply(req, 403, { error: 'Admins only' });
    me = profile;
  }

  // Uppgifter till WhatsApp-inställningen i administrationen.
  if (!isInternal && body.action === 'whatsapp_setup') {
    const has = (k: string) => !!Deno.env.get(k);
    const { count } = await db.from('whatsapp_messages').select('id', { count: 'exact', head: true });
    return reply(req, 200, {
      webhook_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp`,
      webhook_url_with_key: `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp?key=${Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? (await derived('whatsapp-verify'))}`,
      verify_token: Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? (await derived('whatsapp-verify')),
      ai_key: has('ANTHROPIC_API_KEY'),
      meta: { token: has('WHATSAPP_TOKEN'), phone_number_id: has('WHATSAPP_PHONE_NUMBER_ID'), app_secret: has('WHATSAPP_APP_SECRET') },
      provider_360dialog: has('WHATSAPP_D360_KEY'),
      messages_received: count ?? 0,
    });
  }

  const input = typeof body.text === 'string' ? body.text.trim() : '';
  if (input.length < 3) return reply(req, 400, { error: 'Paste a text first.' });
  if (input.length > 20000) return reply(req, 400, { error: 'The text is too long. Split it into smaller parts.' });
  const fromProfile = typeof body.from_profile === 'string' && /^[0-9a-f-]{36}$/i.test(body.from_profile) ? body.from_profile : null;

  try {
    const draft = await analyse(input, {
      source: isInternal ? 'whatsapp' : 'paste',
      fromProfile,
      senderPhone: isInternal && typeof body.sender_phone === 'string' ? body.sender_phone.slice(0, 30) : null,
      createdBy: me?.id ?? null,
    });
    return reply(req, 200, { ok: true, draft });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return reply(req, 500, { error: 'The AI key is not valid. Check ANTHROPIC_API_KEY in Supabase.' });
    if (e instanceof Anthropic.RateLimitError) return reply(req, 429, { error: 'The AI service is busy. Try again in a minute.' });
    if (e instanceof Anthropic.APIError) {
      console.error('anthropic', e.status, e.message);
      return reply(req, 502, { error: e.status === 402 || /credit|billing/i.test(e.message) ? 'The AI account has no credit. Add a payment card or credit at console.anthropic.com.' : 'The AI service did not answer. Try again.', detail: e.message.slice(0, 300) });
    }
    console.error(e);
    return reply(req, 500, { error: e instanceof Error ? e.message : 'Something went wrong.' });
  }
});
