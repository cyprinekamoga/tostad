// Timmar per kund och jobb per uppdragsgivare (t.ex. Spic and Span), räknat på jobbets datum i svensk tid.
import { zoned } from './planner.js';

export const OWN = 'Own customers';
export const NO_CUSTOMER = 'No customer linked';

const round = (h) => Math.round(h * 100) / 100;

/** Uppdragsgivaren: företagskunden själv, annars egna privatkunder. */
export function providerOf(job) {
  const c = job.customers;
  if (!c) return NO_CUSTOMER;
  return c.kind === 'company' ? c.name : OWN;
}

/** Ett jobb som en rad: månad, kund, timmar på plats och arbetade timmar för all personal. */
export function jobRow(job) {
  const date = zoned(job.starts_at).date;
  const site = Math.max(0, (new Date(job.ends_at) - new Date(job.starts_at)) / 3600000);
  const entries = job.work_hours ?? [];
  const address = job.street || job.city || job.title || 'No address';
  return {
    id: job.id,
    date,
    month: date.slice(0, 7),
    customerKey: job.customer_id ?? `address:${address.toLowerCase()}`,
    customerName: job.customers?.name ?? `${address} (no customer)`,
    address,
    provider: providerOf(job),
    siteHours: round(site),
    staffHours: round(entries.reduce((s, e) => s + (Number(e.hours) || 0), 0)),
    people: entries.length,
    reported: entries.length > 0,
  };
}

/** Avbokade jobb räknas inte. */
export const countable = (jobs) => jobs.filter((j) => j.status !== 'avbokad').map(jobRow);

function add(target, row) {
  target.jobs += 1;
  target.staffHours = round(target.staffHours + row.staffHours);
  target.siteHours = round(target.siteHours + row.siteHours);
  if (!row.reported) target.unreported += 1;
}
const empty = () => ({ jobs: 0, staffHours: 0, siteHours: 0, unreported: 0 });

/** Timmar per kund, flest arbetade timmar först. */
export function byCustomer(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.customerKey)) map.set(r.customerKey, { key: r.customerKey, name: r.customerName, provider: r.provider, rows: [], ...empty() });
    const c = map.get(r.customerKey);
    add(c, r);
    c.rows.push(r);
  }
  for (const c of map.values()) c.rows.sort((a, b) => a.date.localeCompare(b.date));
  return [...map.values()].sort((a, b) => b.staffHours - a.staffHours || b.jobs - a.jobs || a.name.localeCompare(b.name));
}

/** Jobb och timmar per uppdragsgivare och månad. Uppdragsgivare med flest jobb först. */
export function byProvider(rows, months) {
  const map = new Map();
  for (const r of rows) {
    if (!months.includes(r.month)) continue;
    if (!map.has(r.provider)) map.set(r.provider, { name: r.provider, months: Object.fromEntries(months.map((m) => [m, empty()])), total: empty() });
    const p = map.get(r.provider);
    add(p.months[r.month], r);
    add(p.total, r);
  }
  return [...map.values()].sort((a, b) => b.total.jobs - a.total.jobs || a.name.localeCompare(b.name));
}

/** De n månaderna fram till och med month, äldst först. */
export function monthsUpTo(month, n) {
  const [y, m] = month.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - n + i, 1)).toISOString().slice(0, 7));
}
