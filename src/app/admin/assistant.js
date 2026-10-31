// Jobbassistenten: gör om assistentens förslag till redigerbara kort och genomför de godkända.
import { supabase, callFunction } from '../../lib/supabase.js';
import { addMinutes, addDays, today, toInstant } from '../../lib/planner.js';
import { suggestPrice } from '../../lib/assistantPrice.js';
import { createJobs, updateJobs, loadJob, SERVICE_LABELS } from './jobs.js';
import { buyerFrom, saveInvoice, lineFromCustomerPrice, RUT_SERVICES } from './docs.js';
import { invoicedJobIds, periodLines, pickRate } from '../../lib/periodInvoice.js';

const sb = () => supabase();

export const KIND_LABEL = {
  create_job: 'New job',
  update_job: 'Change job',
  cancel_jobs: 'Cancel',
  mark_done: 'Mark done',
  report_hours: 'Hours',
  add_absence: 'Absence',
  follow_up: 'Follow-up',
  create_invoice: 'Invoice draft',
};

/** Läser en text. Returnerar det sparade utkastet. */
export async function readText(text, fromProfile) {
  const r = await callFunction('assistant', { text, from_profile: fromProfile || null });
  return r.draft;
}

/** Kunders WhatsApp-meddelanden de senaste två veckorna, grupperade per telefonnummer. */
export async function conversations() {
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const { data } = await sb()
    .from('whatsapp_messages')
    .select('id, phone, name, direction, kind, body, handled, profile_id, created_at')
    .is('profile_id', null)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(1000);
  const byPhone = new Map();
  for (const m of data ?? []) {
    if (!byPhone.has(m.phone)) byPhone.set(m.phone, { phone: m.phone, name: null, messages: [] });
    const c = byPhone.get(m.phone);
    if (m.name) c.name = m.name;
    c.messages.push(m);
  }
  return [...byPhone.values()]
    .map((c) => ({ ...c, unread: c.messages.filter((m) => m.direction === 'in' && !m.handled).length, last: c.messages.at(-1).created_at }))
    .sort((a, b) => (a.last < b.last ? 1 : -1));
}

/** Låter assistenten läsa kundens olästa meddelanden (eller de senaste) och markerar dem som lästa. */
export async function readConversation(c) {
  const unread = c.messages.filter((m) => m.direction === 'in' && !m.handled);
  const chosen = (unread.length ? unread : c.messages.filter((m) => m.direction === 'in').slice(-5)).filter((m) => m.body);
  if (!chosen.length) throw new Error('There is no text to read in this conversation.');
  const text = `WhatsApp from ${c.name ?? 'customer'} (+${c.phone}):\n${chosen.map((m) => m.body).join('\n')}`;
  const draft = await readText(text, null);
  await sb().from('whatsapp_messages').update({ handled: true, draft_id: draft.id }).in('id', chosen.map((m) => m.id));
  return draft;
}

export const whatsappSetup = () => callFunction('assistant', { action: 'whatsapp_setup' });

export async function openDrafts() {
  const { data } = await sb().from('assistant_drafts').select('id, source, input, result, sender_phone, from_profile, created_at').eq('status', 'ny').order('created_at', { ascending: false }).limit(50);
  return data ?? [];
}

export async function loadDraft(id) {
  const { data } = await sb().from('assistant_drafts').select('*').eq('id', id).maybeSingle();
  return data;
}

export async function closeDraft(id, status, meId) {
  await sb().from('assistant_drafts').update({ status, applied_by: meId, applied_at: new Date().toISOString() }).eq('id', id);
}

export async function referenceData() {
  const [c, p, pr] = await Promise.all([
    sb().from('customers').select('id, kind, name, phone, street, city').order('name').limit(2000),
    sb().from('profiles').select('id, full_name, color').eq('active', true).order('full_name'),
    sb().from('products').select('id, code, name, unit, price, vat, rut').eq('active', true).order('name'),
  ]);
  return { customers: c.data ?? [], staff: p.data ?? [], products: pr.data ?? [] };
}

/** Jobben som förslagen pekar på, med id som nyckel. */
export async function jobsFor(actions) {
  const ids = [...new Set(actions.flatMap((a) => [a.job_id, ...(a.job_ids ?? [])]).filter(Boolean))];
  const jobs = await Promise.all(ids.map((id) => loadJob(id)));
  return Object.fromEntries(jobs.filter(Boolean).map((j) => [j.id, j]));
}

/** En faktura för alla jobb under en period: assistenten anger kund och period (date till repeat_until) utan jobb. */
export const isPeriodInvoice = (a) => a.kind === 'create_invoice' && !a.job_id && !!a.repeat_until;

/**
 * Hämtar det fakturorna i förslagen behöver ur planeringen. För en period: kundens jobb som har varit, med rapporterade
 * timmar, utom de som redan är fakturerade. För ett enskilt jobb: om det redan finns på en faktura.
 */
export async function invoiceData(actions, customers) {
  const out = {};
  for (const [i, a] of actions.entries()) {
    if (a.kind !== 'create_invoice') continue;
    const customerId = a.customer_id;
    if (isPeriodInvoice(a) && customerId) {
      const to = a.repeat_until < today() ? a.repeat_until : today();
      const from = a.date && a.date <= to ? a.date : addDays(to, -365);
      const [{ data: list }, { data: invs }] = await Promise.all([
        sb()
          .from('jobs')
          .select('id, service, title, status, starts_at, ends_at, street, city, price, job_staff(profile_id), work_hours(hours)')
          .eq('customer_id', customerId)
          .neq('status', 'avbokad')
          .gte('starts_at', toInstant(from).toISOString())
          .lt('starts_at', toInstant(addDays(to, 1)).toISOString())
          .lte('starts_at', new Date().toISOString())
          .order('starts_at')
          .limit(1000),
        sb().from('invoices').select('job_id, job_ids, status, kind').eq('customer_id', customerId),
      ]);
      const invoiced = invoicedJobIds(invs);
      const all = (list ?? []).map((j) => ({ ...j, staff: (j.job_staff ?? []).map((x) => x.profile_id) }));
      out[i] = { from, to, jobs: all.filter((j) => !invoiced.has(j.id)), skipped: all.filter((j) => invoiced.has(j.id)).length };
    } else if (a.job_id) {
      const { data: invs } = await sb().from('invoices').select('number, job_id, job_ids, status, kind').or(`job_id.eq.${a.job_id},job_ids.cs.{${a.job_id}}`);
      if (invoicedJobIds(invs).has(a.job_id)) out[i] = { alreadyInvoiced: true };
    }
  }
  return out;
}

/** Senaste priset för kunden och tjänsten, för "samma pris som förra". */
export async function lastPrice(customerId, service) {
  if (!customerId) return null;
  let q = sb().from('jobs').select('price, starts_at').eq('customer_id', customerId).not('price', 'is', null).order('starts_at', { ascending: false }).limit(1);
  if (service) q = q.eq('service', service);
  const { data } = await q;
  return data?.[0]?.price ?? null;
}

const hoursOf = (job) => (job ? Math.round(((job.end - job.start) / 3600000) * 4) / 4 : null);

/** Redigerbart kort för ett förslag. */
/**
 * Fakturaraderna i ett förslag. Priset tas från produktlistan när raden är en produkt. En rad utan produkt
 * och utan pris får jobbets överenskomna pris. Priserna är exklusive moms, som i fakturaformuläret.
 * RUT följer produkten, eller jobbets tjänst när raden inte är en produkt, och gäller bara privatkunder.
 */
export function invoiceLines(a, { products, jobs, company }) {
  const job = a.job_id ? jobs[a.job_id] : null;
  const service = job?.service ?? a.service;
  return (a.invoice_lines ?? []).map((l) => {
    const product = products.find((p) => p.id === l.product_id);
    if (!product && !Number(l.price_ex_vat) && job?.price) {
      const line = lineFromCustomerPrice(l.text || `${SERVICE_LABELS[job.service]} ${job.date}`, job.price, !company && RUT_SERVICES.includes(job.service) ? job.service : 'kontor');
      return { ...line, price: String(line.price) };
    }
    return {
      text: l.text || product?.name || '',
      qty: String(l.qty || 1),
      unit: product?.unit || 'st',
      price: String(product ? Number(product.price) : Number(l.price_ex_vat) || 0),
      vat: product ? Number(product.vat) : 25,
      rut: !company && (product ? !!product.rut : RUT_SERVICES.includes(service)),
    };
  });
}

export function toCard(a, i, { customers, jobs, products = [], invoicing = {} }) {
  // En faktura för ett jobb går alltid till jobbets kund, även om assistenten inte hittade kunden själv.
  const linked = a.kind === 'create_invoice' && a.job_id ? jobs[a.job_id]?.customer_id : null;
  if (linked && a.customer_id !== linked) {
    a = { ...a, customer_id: linked, new_customer: null, questions: (a.questions ?? []).filter((q) => !/a customer that does not exist/.test(q)) };
  }
  const customer = customers.find((c) => c.id === a.customer_id);
  const company = customer ? customer.kind === 'company' : a.new_customer?.kind === 'company' || !!a.price_basis?.company;
  const hours = a.hours ?? null;
  const price = a.kind === 'create_job' ? suggestPrice(a, { company }) : null;
  const job = a.job_id ? jobs[a.job_id] : null;
  return {
    key: i,
    action: a,
    include: true,
    status: '',
    message: '',
    e: {
      customer_id: a.customer_id ?? '',
      new_customer: a.new_customer ? { ...a.new_customer, kind: a.new_customer.kind || (company ? 'company' : 'private') } : null,
      service: a.service ?? (job?.service || 'annat'),
      date: a.date ?? '',
      start: a.start ?? (a.kind === 'create_job' ? (['flyttstadning', 'flytt', 'paket'].includes(a.service) ? '08:00' : '09:00') : ''),
      hours: hours ?? (job ? hoursOf(job) : ''),
      street: a.street ?? '',
      apartment: a.apartment ?? '',
      postal_code: a.postal_code ?? '',
      city: a.city ?? '',
      to_street: a.to_street ?? '',
      to_postal_code: a.to_postal_code ?? '',
      to_city: a.to_city ?? '',
      staff: [...(a.staff_ids ?? [])],
      remove_staff: [...(a.remove_staff_ids ?? [])],
      price: price ? String(price.price) : '',
      price_basis: price?.basis ?? (a.price_basis?.same_as_last_time ? 'Same price as last time' : ''),
      staff_note: a.staff_note ?? '',
      internal_note: a.internal_note ?? '',
      repeat: String(a.repeat_weeks ?? 0),
      until: a.repeat_until ?? '',
      job_id: a.job_id ?? '',
      job_ids: [...(a.job_ids ?? [])],
      entries: (a.hours_entries ?? []).map((h) => ({ profile_id: h.profile_id, hours: String(h.hours), note: h.note ?? '' })),
      absence: a.absence ? { ...a.absence, kind: a.absence.kind || 'sjuk' } : { profile_id: '', kind: 'sjuk', from: a.date ?? today(), to: a.date ?? today(), note: '' },
      title: a.title,
      invoice:
        a.kind === 'create_invoice'
          ? (() => {
              const data = invoicing[i];
              if (isPeriodInvoice(a)) {
                const rate = pickRate(products, a.invoice_lines?.[0]?.product_id);
                const found = data?.jobs ?? [];
                const { lines, noHours, hours } = periodLines(found, { rate, company });
                const period = { from: data?.from ?? a.date ?? '', to: data?.to ?? a.repeat_until, count: found.length, skipped: data?.skipped ?? 0, noHours, hours, loaded: !!data };
                return { lines, rate_id: rate?.id ?? '', period, job_ids: found.map((j) => j.id), rut_persons: lines.some((l) => l.rut) ? 1 : 0, your_ref: '', message: '', delivery_date: period.to };
              }
              const lines = invoiceLines(a, { products, jobs, company });
              return { lines, rut_persons: lines.some((l) => l.rut) ? 1 : 0, your_ref: '', message: '', delivery_date: a.date ?? (job ? job.date : today()), already: !!data?.alreadyInvoiced };
            })()
          : null,
    },
  };
}

const num = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const hoursNum = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 4) / 4 : null;
};
const append = (old, extra) => [old, extra].filter((s) => s && String(s).trim()).join('\n');

// Nya kunder skapas en gång per namn, även om flera förslag nämner samma kund.
async function ensureCustomer(e, created) {
  if (e.customer_id) return e.customer_id;
  const n = e.new_customer;
  if (!n?.name?.trim()) return null;
  const key = n.name.trim().toLowerCase();
  if (created[key]) return created[key];
  const notes = [n.contact_person && `Contact: ${n.contact_person}`, n.notes].filter(Boolean).join('\n') || null;
  const { data, error } = await sb()
    .from('customers')
    .insert({ kind: n.kind === 'company' ? 'company' : 'private', name: n.name.trim(), phone: n.phone || null, email: n.email || null, notes })
    .select('id')
    .single();
  if (error) throw new Error(`Could not create the customer ${n.name}.`);
  created[key] = data.id;
  return data.id;
}

/** Sparar timmar per person, en rad per person och jobb. Returnerar antalet sparade. */
async function saveHours(jobId, date, entries, ctx) {
  let saved = 0;
  for (const entry of entries) {
    const h = hoursNum(entry.hours);
    if (!entry.profile_id || !h) continue;
    const row = { profile_id: entry.profile_id, job_id: jobId, work_date: date, hours: h, note: entry.note || null, reported_by: ctx.fromProfile || ctx.meId, updated_at: new Date().toISOString() };
    let existing = null;
    if (jobId) {
      const { data } = await sb().from('work_hours').select('id').eq('profile_id', row.profile_id).eq('job_id', jobId).maybeSingle();
      existing = data;
    }
    const { error } = existing ? await sb().from('work_hours').update(row).eq('id', existing.id) : await sb().from('work_hours').insert(row);
    if (error) throw new Error('Could not save the hours.');
    saved++;
  }
  return saved;
}

/** Genomför ett kort. Returnerar en kort text om vad som gjordes. */
export async function applyCard(card, ctx) {
  const { e, action } = card;
  const kind = action.kind;

  if (kind === 'create_job') {
    const h = hoursNum(e.hours);
    if (!e.date) throw new Error('Choose a date.');
    if (!/^\d{2}:\d{2}$/.test(e.start)) throw new Error('Choose a start time.');
    if (!h) throw new Error('Write how many hours the job takes.');
    const customerId = await ensureCustomer(e, ctx.created);
    const street = e.street.trim();
    const form = {
      customer_id: customerId,
      service: e.service,
      title: e.apartment ? `${street} lgh ${e.apartment}`.trim() : null,
      status: 'planerad',
      date: e.date,
      start: e.start,
      end: addMinutes(e.start, h * 60),
      street,
      postal_code: e.postal_code,
      city: e.city,
      to_street: e.to_street,
      to_postal_code: e.to_postal_code,
      to_city: e.to_city,
      price: e.price,
      staff_note: e.staff_note,
      internal_note: e.internal_note,
      staff: [...new Set([...e.staff, ...e.entries.filter((x) => x.profile_id && hoursNum(x.hours)).map((x) => x.profile_id)])],
      repeat: e.repeat,
      until: e.until || addDays(e.date, 7 * 13),
    };
    const ids = await createJobs(form);
    // Rapporterade timmar för ett jobb som inte fanns i planeringen: sparas på jobbet, och ett passerat jobb markeras som klart.
    const saved = await saveHours(ids[0], e.date, e.entries, ctx);
    if (saved && e.date < today() && !(Number(e.repeat) > 0)) {
      const { error } = await sb().from('jobs').update({ status: 'klar', done_at: new Date(`${e.date}T${addMinutes(e.start, h * 60)}:00`).toISOString(), done_by: ctx.fromProfile || null }).eq('id', ids[0]);
      if (error) throw new Error('The job was created, but could not be marked as done.');
    }
    const what = ids.length > 1 ? `${ids.length} jobs created` : 'Job created';
    return saved ? `${what}, hours saved for ${saved === 1 ? '1 person' : `${saved} people`}` : what;
  }

  if (kind === 'update_job') {
    const job = ctx.jobs[e.job_id];
    if (!job) throw new Error('Choose the job to change.');
    const h = hoursNum(e.hours) ?? hoursOf(job);
    const start = e.start || job.startTime;
    const staff = [...new Set([...job.staff.filter((id) => !e.remove_staff.includes(id)), ...e.staff])];
    const form = {
      customer_id: job.customer_id ?? '',
      service: e.service || job.service,
      title: job.title ?? '',
      status: job.status,
      date: e.date || job.date,
      start,
      end: addMinutes(start, h * 60),
      street: job.street ?? '',
      postal_code: job.postal_code ?? '',
      city: job.city ?? '',
      to_street: job.to_street ?? '',
      to_postal_code: job.to_postal_code ?? '',
      to_city: job.to_city ?? '',
      price: e.price || job.price || '',
      staff_note: append(job.staff_note, e.staff_note),
      internal_note: append(job.internal_note, e.internal_note),
      staff,
    };
    await updateJobs(job, form, 'one');
    return 'Job changed';
  }

  if (kind === 'cancel_jobs') {
    if (!e.job_ids.length) throw new Error('Tick the jobs to cancel.');
    const { error } = await sb().from('jobs').update({ status: 'avbokad' }).in('id', e.job_ids);
    if (error) throw new Error('Could not cancel the jobs.');
    if (e.internal_note) {
      for (const id of e.job_ids) {
        const job = ctx.jobs[id];
        await sb().from('jobs').update({ internal_note: append(job?.internal_note, e.internal_note) }).eq('id', id);
      }
    }
    return e.job_ids.length === 1 ? '1 job cancelled' : `${e.job_ids.length} jobs cancelled`;
  }

  if (kind === 'mark_done') {
    const job = ctx.jobs[e.job_id];
    if (!job) throw new Error('Choose the job.');
    const { error } = await sb()
      .from('jobs')
      .update({ status: 'klar', done_at: new Date().toISOString(), done_by: ctx.fromProfile || null, internal_note: append(job.internal_note, e.internal_note) })
      .eq('id', job.id);
    if (error) throw new Error('Could not mark the job as done.');
    return 'Marked as done';
  }

  if (kind === 'report_hours') {
    const date = e.date || (ctx.jobs[e.job_id]?.date ?? today());
    const saved = await saveHours(e.job_id || null, date, e.entries, ctx);
    if (!saved) throw new Error('Add at least one person with hours.');
    return saved === 1 ? 'Hours saved for 1 person' : `Hours saved for ${saved} people`;
  }

  if (kind === 'add_absence') {
    const a = e.absence;
    if (!a.profile_id) throw new Error('Choose the person.');
    if (!a.from || !a.to || a.to < a.from) throw new Error('Check the dates.');
    const { error } = await sb().from('absences').insert({ profile_id: a.profile_id, kind: a.kind, starts_on: a.from, ends_on: a.to, note: a.note || null, status: 'godkand' });
    if (error) throw new Error('Could not save the absence.');
    return 'Absence saved';
  }

  if (kind === 'create_invoice') {
    const inv = e.invoice;
    const lines = inv.lines
      .filter((l) => l.text.trim())
      .map((l) => ({ text: l.text.trim(), qty: num(l.qty) || 1, unit: l.unit, price: num(l.price), vat: Number(l.vat ?? 25), rut: !!l.rut }));
    if (!lines.length) throw new Error('Add at least one line.');
    const customerId = await ensureCustomer(e, ctx.created);
    if (!customerId) throw new Error('Choose the customer to invoice.');
    const { data: c } = await sb().from('customers').select('*').eq('id', customerId).maybeSingle();
    // Kopplade inte assistenten jobbet, men kunden har precis ett jobb den dagen, kopplas fakturan till det.
    let jobId = e.job_id || null;
    if (!jobId && !inv.period && inv.delivery_date) {
      const { data: same } = await sb()
        .from('jobs')
        .select('id')
        .eq('customer_id', customerId)
        .neq('status', 'avbokad')
        .gte('starts_at', toInstant(inv.delivery_date).toISOString())
        .lt('starts_at', toInstant(addDays(inv.delivery_date, 1)).toISOString());
      if (same?.length === 1) jobId = same[0].id;
    }
    const draft = await saveInvoice({
      customer_id: customerId,
      job_id: inv.period ? null : jobId,
      job_ids: inv.period ? inv.lines.map((l) => l.job_id).filter(Boolean) : [],
      buyer: buyerFrom(c),
      delivery_date: inv.delivery_date || null,
      your_ref: inv.your_ref || null,
      message: inv.message || null,
      rut_persons: c?.kind === 'company' ? 0 : Number(inv.rut_persons) || 0,
      lines,
    });
    return { text: 'Saved as a draft invoice. Check it and send it from Invoices.', link: `/admin/fakturor?utkast=${draft.id}`, linkText: 'Open the draft' };
  }

  if (kind === 'follow_up') {
    const customer = ctx.customers.find((c) => c.id === e.customer_id);
    const lines = [e.title, ...(action.questions ?? []).map((q) => `- ${q}`), action.source_quote && `\nFrom the message: "${action.source_quote}"`].filter(Boolean);
    const { error } = await sb().from('submissions').insert({
      kind: 'kontakt',
      status: 'ny',
      name: customer?.name ?? e.new_customer?.name ?? 'Job assistant',
      phone: e.new_customer?.phone ?? customer?.phone ?? null,
      customer_id: customer?.id ?? null,
      data: { meddelande: lines.join('\n'), kalla: 'Jobbassistenten' },
    });
    if (error) throw new Error('Could not add the follow-up to the inbox.');
    return 'Added to the inbox';
  }

  throw new Error('Unknown suggestion');
}

