// Offerter, fakturor och företagsinställningar: hämta, spara och statusändringar.
import { supabase } from '../../lib/supabase.js';
import { today, addDays, zoned } from '../../lib/planner.js';
import { exVat } from '../../lib/money.js';
import { SERVICE_LABELS_SV as SERVICE_LABELS } from './jobs.js';

export const QUOTE_STATUS = { utkast: 'Draft', skickad: 'Sent', oppnad: 'Opened', accepterad: 'Accepted', avbojd: 'Declined' };
export const INVOICE_STATUS = { utkast: 'Draft', skickad: 'Unpaid', betald: 'Paid', krediterad: 'Credited' };
export const RUT_STATUS = { ej_aktuell: 'No RUT', ej_ansokt: 'Not applied', ansokt: 'Applied', utbetald: 'Paid out', nekad: 'Rejected' };
// Tjänster där arbetet ger RUT-avdrag. Kontorsstädning åt företag gör det inte.
export const RUT_SERVICES = ['hemstadning', 'storstadning', 'flyttstadning', 'fonsterputs', 'flytt', 'paket', 'pianoflytt'];

const sb = () => supabase();
const fail = (error, fallback) => {
  const msg = error?.message ?? '';
  throw new Error(/^[A-ZÅÄÖ][a-zåäö ]/.test(msg) && !/[_(]|violates|duplicate/.test(msg) ? msg : fallback);
};

export const docUrl = (token) => `${window.location.origin}/dokument?t=${token}`;
export const isOverdue = (inv) => inv.status === 'skickad' && inv.kind === 'faktura' && inv.due_date && inv.due_date < today();

/** Köparens uppgifter från kundregistret, så som de ska stå på dokumentet. */
export function buyerFrom(c) {
  if (!c) return {};
  return {
    name: c.name ?? '',
    company: c.kind === 'company',
    org_nr: c.org_nr ?? '',
    street: c.street ?? '',
    postal_code: c.postal_code ?? '',
    city: c.city ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
  };
}

/** En rad från ett pris kunden betalar (inklusive moms, efter RUT om det gäller). */
export function lineFromCustomerPrice(text, price, service) {
  const rut = RUT_SERVICES.includes(service);
  const gross = rut ? Number(price) * 2 : Number(price);
  return { text, qty: 1, unit: 'st', price: exVat(gross), vat: 25, rut };
}

export async function loadSettings() {
  const { data } = await sb().from('company_settings').select('*').eq('id', 1).maybeSingle();
  return data ?? { id: 1, bankgiro: null, vat_nr: 'SE559470339801', payment_days: 10, quote_days: 30, invoice_note: '', late_interest: 'Vid försenad betalning debiteras dröjsmålsränta enligt räntelagen.', email: 'info@tostadflytt.se', phone: '072 222 88 00' };
}

export async function saveSettings(values) {
  const { error } = await sb().from('company_settings').upsert({ ...values, id: 1 });
  if (error) fail(error, /bankgiro/.test(error.message) ? 'Write the bankgiro number as 123-4567 or 1234-5678.' : 'Could not save.');
}

export async function nextInvoiceNumber() {
  const { data } = await sb().rpc('next_invoice_number');
  return data;
}

export async function setInvoiceStart(n) {
  const { error } = await sb().rpc('set_invoice_start', { p_next: Number(n) });
  if (error) fail(error, 'Could not save the start number.');
}

export async function loadCustomers() {
  const { data } = await sb().from('customers').select('id, kind, name, email, phone, street, postal_code, city, org_nr').order('name').limit(2000);
  return data ?? [];
}

// Offerter
const QUOTE_FIELDS = ['customer_id', 'submission_id', 'job_id', 'service', 'buyer', 'street', 'postal_code', 'city', 'wanted_date', 'lines', 'rut_persons', 'message', 'valid_until'];
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k] === '' ? null : obj[k]]));

export async function loadQuotes() {
  const { data, error } = await sb().from('quotes').select('*').order('created_at', { ascending: false }).limit(500);
  if (error) fail(error, 'Could not load the quotes.');
  return data;
}

export async function saveQuote(form) {
  const values = pick(form, QUOTE_FIELDS);
  const q = form.id ? sb().from('quotes').update(values).eq('id', form.id) : sb().from('quotes').insert(values);
  const { data, error } = await q.select('*').single();
  if (error) fail(error, 'Could not save the quote.');
  return data;
}

export async function sendQuote(quote, quoteDays) {
  const { data, error } = await sb()
    .from('quotes')
    .update({ status: quote.status === 'utkast' ? 'skickad' : quote.status, sent_at: new Date().toISOString(), valid_until: quote.valid_until ?? addDays(today(), quoteDays) })
    .eq('id', quote.id)
    .select('*')
    .single();
  if (error) fail(error, 'Could not send the quote.');
  return data;
}

export async function deleteDraft(table, id) {
  const { error } = await sb().from(table).delete().eq('id', id).eq('status', 'utkast');
  if (error) fail(error, 'Could not remove the draft.');
}

// Fakturor
const INVOICE_FIELDS = ['customer_id', 'job_id', 'job_ids', 'quote_id', 'buyer', 'your_ref', 'delivery_date', 'issue_date', 'due_date', 'lines', 'rut_persons', 'message', 'internal_note'];

export async function loadInvoices() {
  const { data, error } = await sb()
    .from('invoices')
    .select('*, rut_people(id, slot, name, pnr_last4)')
    .not('rut_people.pnr_last4', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) fail(error, 'Could not load the invoices.');
  return data.map((inv) => ({ ...inv, rut_people: (inv.rut_people ?? []).sort((a, b) => a.slot - b.slot) }));
}

export async function saveInvoice(form, people) {
  const values = pick(form, INVOICE_FIELDS);
  const q = form.id ? sb().from('invoices').update(values).eq('id', form.id) : sb().from('invoices').insert(values);
  const { data, error } = await q.select('*').single();
  if (error) fail(error, 'Could not save the invoice.');
  // Personnummer skickas bara när de har ändrats (fältet är tomt annars).
  if (people) {
    const { error: e } = await sb().rpc('set_rut_people', { p_invoice: data.id, p_people: people });
    if (e) fail(e, 'Could not save the personal identity numbers.');
  }
  return data;
}

/** En faktura via OCR-nummer, även om den inte finns bland de senast hämtade. */
export async function invoiceByOcr(ocr) {
  const { data } = await sb()
    .from('invoices')
    .select('*, rut_people(id, slot, name, pnr_last4)')
    .eq('ocr', ocr)
    .not('rut_people.pnr_last4', 'is', null)
    .maybeSingle();
  return data ? { ...data, rut_people: (data.rut_people ?? []).sort((a, b) => a.slot - b.slot) } : null;
}

export async function finalizeInvoice(id) {
  const { data, error } = await sb().rpc('finalize_invoice', { p_id: id });
  if (error) fail(error, 'Could not send the invoice.');
  return data;
}

export async function creditInvoice(id, reason) {
  const { data, error } = await sb().rpc('credit_invoice', { p_id: id, p_reason: reason || null });
  if (error) fail(error, 'Could not credit the invoice.');
  return data;
}

export async function updateInvoice(id, values) {
  const { data, error } = await sb().from('invoices').update(values).eq('id', id).select('*').single();
  if (error) fail(error, 'Could not save.');
  return data;
}

export async function revealPnr(personId) {
  const { data, error } = await sb().rpc('reveal_pnr', { p_id: personId });
  if (error) fail(error, 'Could not show the personal identity number.');
  return data;
}

/** Utkast till en faktura från ett jobb. */
export async function invoiceFromJob(jobId) {
  const { data: job } = await sb().from('jobs').select('id, service, title, starts_at, price, customer_id, customers(*)').eq('id', jobId).maybeSingle();
  if (!job) return null;
  const date = zoned(job.starts_at).date;
  const rut = RUT_SERVICES.includes(job.service) && job.customers?.kind !== 'company';
  return {
    customer_id: job.customer_id,
    job_id: job.id,
    buyer: buyerFrom(job.customers),
    delivery_date: date,
    rut_persons: rut ? 1 : 0,
    lines: job.price
      ? [lineFromCustomerPrice(`${SERVICE_LABELS[job.service]} ${date}${job.title ? `, ${job.title}` : ''}`, job.price, rut ? job.service : 'kontor')]
      : [{ text: `${SERVICE_LABELS[job.service]} ${date}`, qty: 1, unit: 'st', price: 0, vat: 25, rut }],
  };
}

/** Utkast till en faktura från en accepterad offert. */
export function invoiceFromQuote(q) {
  return {
    customer_id: q.customer_id,
    quote_id: q.id,
    job_id: q.job_id,
    buyer: q.buyer,
    delivery_date: q.wanted_date ?? today(),
    rut_persons: q.rut_persons,
    lines: q.lines,
    message: `Enligt offert ${q.number}.`,
  };
}

/** Utkast till en offert från en bokning eller förfrågan i inkorgen. */
export function quoteFromSubmission(s) {
  const d = s.data ?? {};
  const service = SERVICE_LABELS[d.tjanst] ? d.tjanst : 'annat';
  const zip = (d.postnummer ?? '').replace(/\D/g, '');
  return {
    customer_id: s.customer_id ?? null,
    submission_id: s.id,
    service,
    buyer: { name: s.name ?? '', email: s.email ?? '', phone: s.phone ?? '', street: d.adress ?? '', postal_code: zip.length === 5 ? `${zip.slice(0, 3)} ${zip.slice(3)}` : '' },
    street: d.adress ?? '',
    postal_code: zip.length === 5 ? `${zip.slice(0, 3)} ${zip.slice(3)}` : '',
    wanted_date: /^\d{4}-\d{2}-\d{2}$/.test(d.datum ?? '') ? d.datum : null,
    rut_persons: RUT_SERVICES.includes(service) ? 1 : 0,
    lines: /^\d+$/.test(d.pris ?? '') ? [lineFromCustomerPrice(SERVICE_LABELS[service], d.pris, service)] : [{ text: SERVICE_LABELS[service], qty: 1, unit: 'st', price: 0, vat: 25, rut: RUT_SERVICES.includes(service) }],
  };
}

const kr = (n) => `${new Intl.NumberFormat('sv-SE').format(Math.round(Number(n)))} kr`;

/** Text till mejl eller SMS med länken. Kunden får texten på svenska. */
export function messageFor(kind, doc, url, reminder = false) {
  const first = (doc.buyer?.name ?? '').split(' ')[0];
  const hi = first ? `Hej ${first}!` : 'Hej!';
  if (kind === 'offert') return `${hi}\n\nHär är vår offert ${doc.number} från TO Städ & Flytt. Du kan läsa den och acceptera direkt via länken:\n${url}\n\nHör av dig om du har frågor.\n\nVänliga hälsningar\nTO Städ & Flytt\n072 222 88 00`;
  if (reminder) {
    const fee = Number(doc.reminder_fee) || 0;
    const owed = fee ? ` En påminnelseavgift på ${kr(fee)} har lagts till, så att betala är nu ${kr(Number(doc.to_pay) + fee)}.` : '';
    return `${hi}\n\nVi har inte fått betalt för faktura ${doc.number} på ${kr(doc.to_pay)}, som förföll ${doc.due_date}.${owed} Har du redan betalat kan du bortse från detta. Fakturan med OCR-nummer finns här:\n${url}\n\nVänliga hälsningar\nTO Städ & Flytt\n072 222 88 00`;
  }
  return `${hi}\n\nTack för att du anlitade TO Städ & Flytt! Här är faktura ${doc.number} på ${kr(doc.to_pay)} med förfallodag ${doc.due_date}:\n${url}\n\nVänliga hälsningar\nTO Städ & Flytt\n072 222 88 00`;
}

/** Företagsuppgifterna så som dokumentet visar dem (samma som på kundens länk). */
export function companyFor(s) {
  return {
    name: 'TO Städ & Flytt',
    legalName: 'TO Städ och Flytt AB',
    orgNr: '559470-3398',
    street: 'Hasselgatan 58',
    postalCode: '194 37',
    city: 'Upplands Väsby',
    web: 'tostadflytt.se',
    vatNr: s?.vat_nr ?? 'SE559470339801',
    bankgiro: s?.bankgiro ?? null,
    email: s?.email ?? 'info@tostadflytt.se',
    phone: s?.phone ?? '072 222 88 00',
    lateInterest: s?.late_interest ?? '',
    invoiceNote: s?.invoice_note ?? '',
  };
}
