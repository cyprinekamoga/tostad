// Personalens app: hämtar egna jobb, timmar, foton, ledighet och passbyten.
import { supabase, callFunction } from '../../lib/supabase.js';
import { shrink } from '../../lib/inbox.js';
import { zoned } from '../../lib/planner.js';
import { SUPABASE_URL } from '../../config/supabase.js';

// Felmeddelanden från databasen är redan läsbara; tekniska fel får en allmän text.
function fail(error, fallback) {
  const msg = error?.message ?? '';
  throw new Error(/^[A-ZÅÄÖ][a-zåäö ]+/.test(msg) && !/[_(]/.test(msg) ? msg : fallback);
}

function shape(j) {
  const start = Date.parse(j.starts_at);
  const end = Date.parse(j.ends_at);
  return { ...j, start, end, date: zoned(start).date, startTime: zoned(start).time, endTime: zoned(end).time, team: j.team ?? [] };
}

export async function myJobs(from, to) {
  const { data, error } = await supabase().rpc('my_jobs', { p_from: from, p_to: to });
  if (error) fail(error, 'Could not load your jobs.');
  return data.map(shape);
}

export async function myJob(id) {
  const { data, error } = await supabase().rpc('my_jobs', { p_from: '2000-01-01', p_to: '2000-01-01', p_job: id });
  if (error) fail(error, 'Could not load the job.');
  return data[0] ? shape(data[0]) : null;
}

export async function jobAction(id, action, checklist) {
  const { error } = await supabase().rpc('staff_job', { p_job: id, p_action: action, p_checklist: checklist ?? null });
  if (error) fail(error, 'Could not save.');
}

/** "Vi är på väg". sms: om kunden ska få ett SMS. Svarar { sms: 'sent' | 'skipped' | 'failed' | 'not_sent', reason }. */
export const onTheWay = (id, minutes, sms) => callFunction('sms', { action: 'on_way', job_id: id, minutes, sms });

// Timmar
export const colleagues = () => rpc('colleagues', {}, 'Could not load your colleagues.');

/** team: [{ id, hours }]. Svarar { colleagues, skipped } där skipped är namn som redan hade egna timmar. */
export const reportHours = ({ date, hours, jobId = null, note = '', team = [] }) =>
  rpc('report_hours', { p_date: date, p_hours: hours, p_job: jobId, p_note: note || null, p_team: team }, 'Could not save your hours.');

export const myHours = (from, to) => rpc('my_hours', { p_from: from, p_to: to }, 'Could not load your hours.');

export async function deleteHours(id) {
  const { data, error } = await supabase().from('work_hours').delete().eq('id', id).select('id');
  if (error) fail(error, 'Could not remove the hours.');
  if (!data?.length) throw new Error('These hours can no longer be removed. Ask an admin.');
}

// Foton
export async function photos(jobId) {
  const sb = supabase();
  const { data, error } = await sb.from('job_photos').select('id, path, kind, taken_by, created_at').eq('job_id', jobId).order('created_at');
  if (error || !data.length) return [];
  const { data: signed } = await sb.storage.from('job-photos').createSignedUrls(data.map((p) => p.path), 3600);
  const urls = Object.fromEntries((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return data.map((p) => ({ ...p, url: urls[p.path] }));
}

export async function uploadPhoto(jobId, file, kind, profileId) {
  const sb = supabase();
  const small = await shrink(file);
  const ext = small.type === 'image/png' ? 'png' : small.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${jobId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from('job-photos').upload(path, small, { contentType: small.type || 'image/jpeg' });
  if (error) fail(error, 'Could not upload the photo.');
  const { error: rowError } = await sb.from('job_photos').insert({ job_id: jobId, path, kind, taken_by: profileId });
  if (rowError) {
    await sb.storage.from('job-photos').remove([path]);
    fail(rowError, 'Could not save the photo.');
  }
}

export async function deletePhoto(photo) {
  const sb = supabase();
  const { error } = await sb.from('job_photos').delete().eq('id', photo.id);
  if (error) fail(error, 'Could not remove the photo.');
  await sb.storage.from('job-photos').remove([photo.path]);
}

// Ledighet och frånvaro
export const ABSENCE_KIND = { ledighet: 'Time off', sjuk: 'Sick', kan_inte: 'Unavailable' };
export const ABSENCE_STATUS = { begard: 'Waiting for answer', godkand: 'Approved', nekad: 'Declined' };

export async function myAbsences(profileId) {
  const { data, error } = await supabase()
    .from('absences')
    .select('*')
    .eq('profile_id', profileId)
    .gte('ends_on', zoned(Date.now() - 60 * 864e5).date)
    .order('starts_on');
  if (error) fail(error, 'Could not load your absences.');
  return data;
}

export async function addAbsence(profileId, form) {
  const { error } = await supabase()
    .from('absences')
    .insert({ profile_id: profileId, kind: form.kind, starts_on: form.starts_on, ends_on: form.ends_on, note: form.note.trim() || null });
  if (error) fail(error, 'Could not send.');
}

export async function removeAbsence(id) {
  const { error } = await supabase().from('absences').delete().eq('id', id);
  if (error) fail(error, 'Could not remove.');
}

// Passbyten
async function rpc(name, args, fallback) {
  const { data, error } = await supabase().rpc(name, args);
  if (error) fail(error, fallback);
  return data;
}
export const offerSwap = (jobId, note) => rpc('offer_swap', { p_job: jobId, p_note: note || null }, 'Could not offer the shift.');
export const openSwaps = () => rpc('open_swaps', {}, 'Could not load open shifts.');
export const takeSwap = (id) => rpc('take_swap', { p_id: id }, 'Could not take the shift.');
export const cancelSwap = (id) => rpc('cancel_swap', { p_id: id }, 'Could not withdraw.');

// Kalender
export async function calendarToken(profileId) {
  const { data } = await supabase().from('profiles').select('calendar_token').eq('id', profileId).maybeSingle();
  return data?.calendar_token ?? null;
}
export const newCalendarToken = () => rpc('new_calendar_token', {}, 'Could not create a new link.');
export const calendarUrl = (token) => `${SUPABASE_URL}/functions/v1/calendar?t=${token}`;

/** Google Maps-länk till en adress (öppnar appen på telefonen). */
export const mapsLink = (address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
export const telLink = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`;
