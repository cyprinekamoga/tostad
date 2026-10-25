// Jobb i planeringen: hämta, spara, flytta och ta bort, och hitta adresser på kartan.
import { supabase, callFunction } from '../../lib/supabase.js';
import { toInstant, zoned, addDays, seriesDates } from '../../lib/planner.js';
import { SERVICES, SERVICES_SV } from './submission.js';

export const SERVICE_LABELS = { ...SERVICES, annat: 'Other' };
// Svenska namn för offerter och fakturor som kunden får.
export const SERVICE_LABELS_SV = { ...SERVICES_SV, annat: 'Annat' };
// En egen färg per tjänst så att jobben syns tydligt isär i planeringen.
export const SERVICE_COLORS = {
  hemstadning: '#16a34a',
  storstadning: '#ea580c',
  flyttstadning: '#0d9488',
  flytt: '#2563eb',
  paket: '#7c3aed',
  fonsterputs: '#0891b2',
  kontor: '#475569',
  pianoflytt: '#db2777',
  annat: '#a16207',
};
export const serviceColor = (service) => SERVICE_COLORS[service] ?? SERVICE_COLORS.annat;

export const JOB_STATUS = { planerad: 'Planned', klar: 'Done', avbokad: 'Cancelled' };

// Ungefärlig längd i timmar när ett nytt jobb skapas. Går att ändra i formuläret.
export const DEFAULT_HOURS = { flytt: 6, flyttstadning: 5, paket: 8, hemstadning: 3, storstadning: 5, fonsterputs: 3, kontor: 3, pianoflytt: 2, annat: 3 };

// Starttid utifrån det kunden valde i bokningsformuläret.
export function startFromWish(wish = '') {
  if (/eftermiddag/i.test(wish)) return '12:00';
  if (/kväll/i.test(wish)) return '16:00';
  return '08:00';
}

const COLUMNS =
  'id, customer_id, submission_id, series_id, service, title, status, starts_at, ends_at, street, postal_code, city, to_street, to_postal_code, to_city, lat, lng, price, staff_note, internal_note, checklist, on_way_at, done_at, done_by, customers(name, phone), job_staff(profile_id)';

function shape(row) {
  const start = Date.parse(row.starts_at);
  const end = Date.parse(row.ends_at);
  const z = zoned(start);
  return {
    ...row,
    start,
    end,
    date: z.date,
    startTime: z.time,
    endTime: zoned(end).time,
    staff: (row.job_staff ?? []).map((s) => s.profile_id),
    customerName: row.customers?.name ?? '',
  };
}

/** Jobb som börjar från och med fromDate till och med toDate (svensk tid). */
export async function loadJobs(fromDate, toDate) {
  const { data, error } = await supabase()
    .from('jobs')
    .select(COLUMNS)
    .gte('starts_at', toInstant(fromDate).toISOString())
    .lt('starts_at', toInstant(addDays(toDate, 1)).toISOString())
    .order('starts_at');
  if (error) throw new Error('Could not load the jobs.');
  return data.map(shape);
}

export async function loadJob(id) {
  const { data } = await supabase().from('jobs').select(COLUMNS).eq('id', id).maybeSingle();
  return data ? shape(data) : null;
}

export const jobLabel = (job) => job.customerName || job.title || SERVICE_LABELS[job.service] || 'Job';

export function jobAddress(job, to = false) {
  const street = to ? job.to_street : job.street;
  const place = [to ? job.to_postal_code : job.postal_code, to ? job.to_city : job.city].filter(Boolean).join(' ');
  return [street, place].filter(Boolean).join(', ');
}

// Checklistan skrivs som en punkt per rad. Punkter som redan är avbockade behåller sin bock.
export function parseChecklist(textValue, previous = []) {
  const done = new Set((previous ?? []).filter((i) => i.done).map((i) => i.label));
  return String(textValue ?? '')
    .split('\n')
    .map((l) => l.trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, 60)
    .map((label) => ({ label, done: done.has(label) }));
}

const text = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

// Fälten i databasen för ett tillfälle på datumet date.
function row(form, date) {
  const price = String(form.price ?? '').replace(/\D/g, '');
  return {
    customer_id: form.customer_id || null,
    service: form.service,
    title: text(form.title, 200),
    status: form.status || 'planerad',
    starts_at: toInstant(date, form.start).toISOString(),
    ends_at: toInstant(date, form.end).toISOString(),
    street: text(form.street, 200),
    postal_code: text(form.postal_code, 10),
    city: text(form.city, 100),
    to_street: text(form.to_street, 200),
    to_postal_code: text(form.to_postal_code, 10),
    to_city: text(form.to_city, 100),
    price: price ? Math.min(Number(price), 10000000) : null,
    staff_note: text(form.staff_note, 5000),
    internal_note: text(form.internal_note, 5000),
    ...(form.checklist_text !== undefined ? { checklist: parseChecklist(form.checklist_text, form.checklist_prev) } : {}),
  };
}

async function setStaff(jobIds, staff) {
  const sb = supabase();
  const { error } = await sb.from('job_staff').delete().in('job_id', jobIds);
  if (error) throw new Error('Could not save the staff.');
  if (!staff.length) return;
  const { error: insertError } = await sb.from('job_staff').insert(jobIds.flatMap((job_id) => staff.map((profile_id) => ({ job_id, profile_id }))));
  if (insertError) throw new Error('Could not save the staff.');
}

/** Skapar ett jobb, eller en serie om form.repeat är antal veckor mellan tillfällena. Returnerar id:n. */
export async function createJobs(form) {
  const sb = supabase();
  let seriesId = null;
  let dates = [form.date];
  if (Number(form.repeat) > 0) {
    const { data: series, error } = await sb.from('job_series').insert({ interval_weeks: Number(form.repeat), until: form.until }).select('id').single();
    if (error) throw new Error('Could not create the series.');
    seriesId = series.id;
    dates = seriesDates(form.date, Number(form.repeat), form.until);
  }
  const rows = dates.map((d) => ({ ...row(form, d), series_id: seriesId, submission_id: d === form.date ? form.submission_id || null : null }));
  const { data, error } = await sb.from('jobs').insert(rows).select('id');
  if (error) throw new Error(/submission_id/.test(error.message) ? 'There is already a job for this booking.' : 'Could not save the job.');
  const ids = data.map((r) => r.id);
  await setStaff(ids, form.staff);
  // Bokningsbekräftelsen skickas direkt i stället för vid nästa timme (bara när mejl är påslaget).
  callFunction('email', { action: 'run_now' }).catch(() => {});
  return ids;
}

/** Sparar ändringar. scope 'following' gäller detta och kommande tillfällen i serien. */
export async function updateJobs(job, form, scope = 'one') {
  const sb = supabase();
  const addressChanged = ['street', 'postal_code', 'city'].some((k) => (text(form[k], 200) ?? null) !== (job[k] ?? null));
  const coords = addressChanged ? { lat: null, lng: null } : {};
  let targets = [{ id: job.id, date: form.date }];
  if (scope === 'following' && job.series_id) {
    const { data } = await sb.from('jobs').select('id, starts_at').eq('series_id', job.series_id).gte('starts_at', job.starts_at).order('starts_at');
    targets = (data ?? []).map((r) => ({ id: r.id, date: r.id === job.id ? form.date : zoned(r.starts_at).date }));
  }
  for (const t of targets) {
    const values = { ...row(form, t.date), ...coords };
    // Status ändras bara på det valda tillfället.
    if (t.id !== job.id) {
      delete values.status;
      if (values.checklist) values.checklist = values.checklist.map((i) => ({ ...i, done: false }));
    }
    const { error } = await sb.from('jobs').update(values).eq('id', t.id);
    if (error) throw new Error('Could not save the job.');
  }
  await setStaff(targets.map((t) => t.id), form.staff);
  return targets.map((t) => t.id);
}

export async function deleteJobs(job, scope = 'one') {
  const sb = supabase();
  let query = sb.from('jobs').delete();
  query = scope === 'following' && job.series_id ? query.eq('series_id', job.series_id).gte('starts_at', job.starts_at) : query.eq('id', job.id);
  const { error } = await query;
  if (error) throw new Error('Could not remove the job.');
}

/** Flyttar ett jobb till ett annat datum eller klockslag och byter person (dra och släpp). */
export async function moveJob(job, { date = job.date, startTime = job.startTime, from, to }) {
  const sb = supabase();
  const start = toInstant(date, startTime).getTime();
  if (start !== job.start) {
    const { error } = await sb
      .from('jobs')
      .update({ starts_at: new Date(start).toISOString(), ends_at: new Date(start + job.end - job.start).toISOString() })
      .eq('id', job.id);
    if (error) throw new Error('Could not move the job.');
  }
  if (from === to) return;
  if (from) {
    const { error } = await sb.from('job_staff').delete().eq('job_id', job.id).eq('profile_id', from);
    if (error) throw new Error('Could not change the person.');
  }
  if (to && !job.staff.includes(to)) {
    const { error } = await sb.from('job_staff').insert({ job_id: job.id, profile_id: to });
    if (error) throw new Error('Could not change the person.');
  }
}

// Adresser slås upp hos OpenStreetMap (Nominatim), högst en fråga per sekund enligt deras regler.
let queue = Promise.resolve();
const cache = new Map();

export function geocode(address) {
  if (!address) return Promise.resolve(null);
  if (cache.has(address)) return cache.get(address);
  const result = (queue = queue.then(async () => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=se&q=${encodeURIComponent(address)}`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'sv' } });
      const hits = res.ok ? await res.json() : [];
      return hits[0] ? { lat: Number(hits[0].lat), lng: Number(hits[0].lon) } : null;
    } catch {
      return null;
    } finally {
      await new Promise((r) => setTimeout(r, 1100));
    }
  }));
  cache.set(address, result);
  return result;
}

/** Hittar kartpositionen för jobb som saknar en och sparar den. Returnerar uppdaterade jobb. */
export async function locateJobs(jobs) {
  const out = [];
  for (const job of jobs) {
    if (job.lat != null || !job.street) continue;
    const point = await geocode(jobAddress(job));
    if (!point) continue;
    await supabase().from('jobs').update(point).eq('id', job.id);
    out.push({ ...job, ...point });
  }
  return out;
}
