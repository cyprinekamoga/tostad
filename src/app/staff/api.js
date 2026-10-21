// Personalens app: hämtar egna jobb, stämplar, foton, ledighet och passbyten.
import { supabase } from '../../lib/supabase.js';
import { shrink } from '../../lib/inbox.js';
import { zoned } from '../../lib/planner.js';
import { SUPABASE_URL } from '../../config/supabase.js';

// Felmeddelanden från databasen är redan på svenska; tekniska fel får en allmän text.
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
  if (error) fail(error, 'Kunde inte hämta dina jobb.');
  return data.map(shape);
}

export async function myJob(id) {
  const { data, error } = await supabase().rpc('my_jobs', { p_from: '2000-01-01', p_to: '2000-01-01', p_job: id });
  if (error) fail(error, 'Kunde inte hämta jobbet.');
  return data[0] ? shape(data[0]) : null;
}

export async function jobAction(id, action, checklist) {
  const { error } = await supabase().rpc('staff_job', { p_job: id, p_action: action, p_checklist: checklist ?? null });
  if (error) fail(error, 'Kunde inte spara.');
}

// Platsen sparas bara i stunden man stämplar, och bara om telefonen tillåter det.
function position() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  });
}

export async function clockIn(jobId = null) {
  const { lat = null, lng = null } = await position();
  const { data, error } = await supabase().rpc('clock_in', { p_job: jobId, p_lat: lat, p_lng: lng });
  if (error) fail(error, 'Kunde inte stämpla in.');
  return data;
}

export async function clockOut(note) {
  const { lat = null, lng = null } = await position();
  const { data, error } = await supabase().rpc('clock_out', { p_lat: lat, p_lng: lng, p_note: note ?? null });
  if (error) fail(error, 'Kunde inte stämpla ut.');
  return data;
}

export async function openEntry(profileId) {
  const { data } = await supabase().from('time_entries').select('*').eq('profile_id', profileId).is('ended_at', null).maybeSingle();
  return data;
}

export async function entries(profileId, fromIso, toIso) {
  const { data, error } = await supabase()
    .from('time_entries')
    .select('*')
    .eq('profile_id', profileId)
    .gte('started_at', fromIso)
    .lt('started_at', toIso)
    .order('started_at', { ascending: false });
  if (error) fail(error, 'Kunde inte hämta tiderna.');
  return data;
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
  if (error) fail(error, 'Kunde inte ladda upp fotot.');
  const { error: rowError } = await sb.from('job_photos').insert({ job_id: jobId, path, kind, taken_by: profileId });
  if (rowError) {
    await sb.storage.from('job-photos').remove([path]);
    fail(rowError, 'Kunde inte spara fotot.');
  }
}

export async function deletePhoto(photo) {
  const sb = supabase();
  const { error } = await sb.from('job_photos').delete().eq('id', photo.id);
  if (error) fail(error, 'Kunde inte ta bort fotot.');
  await sb.storage.from('job-photos').remove([photo.path]);
}

// Ledighet och frånvaro
export const ABSENCE_KIND = { ledighet: 'Ledighet', sjuk: 'Sjuk', kan_inte: 'Kan inte jobba' };
export const ABSENCE_STATUS = { begard: 'Väntar på svar', godkand: 'Godkänd', nekad: 'Nekad' };

export async function myAbsences(profileId) {
  const { data, error } = await supabase()
    .from('absences')
    .select('*')
    .eq('profile_id', profileId)
    .gte('ends_on', zoned(Date.now() - 60 * 864e5).date)
    .order('starts_on');
  if (error) fail(error, 'Kunde inte hämta frånvaron.');
  return data;
}

export async function addAbsence(profileId, form) {
  const { error } = await supabase()
    .from('absences')
    .insert({ profile_id: profileId, kind: form.kind, starts_on: form.starts_on, ends_on: form.ends_on, note: form.note.trim() || null });
  if (error) fail(error, 'Kunde inte skicka.');
}

export async function removeAbsence(id) {
  const { error } = await supabase().from('absences').delete().eq('id', id);
  if (error) fail(error, 'Kunde inte ta bort.');
}

// Passbyten
async function rpc(name, args, fallback) {
  const { data, error } = await supabase().rpc(name, args);
  if (error) fail(error, fallback);
  return data;
}
export const offerSwap = (jobId, note) => rpc('offer_swap', { p_job: jobId, p_note: note || null }, 'Kunde inte erbjuda passet.');
export const openSwaps = () => rpc('open_swaps', {}, 'Kunde inte hämta lediga pass.');
export const takeSwap = (id) => rpc('take_swap', { p_id: id }, 'Kunde inte ta passet.');
export const cancelSwap = (id) => rpc('cancel_swap', { p_id: id }, 'Kunde inte återkalla.');

// Kalender
export async function calendarToken(profileId) {
  const { data } = await supabase().from('profiles').select('calendar_token').eq('id', profileId).maybeSingle();
  return data?.calendar_token ?? null;
}
export const newCalendarToken = () => rpc('new_calendar_token', {}, 'Kunde inte skapa en ny länk.');
export const calendarUrl = (token) => `${SUPABASE_URL}/functions/v1/calendar?t=${token}`;

/** Google Maps-länk till en adress (öppnar appen på telefonen). */
export const mapsLink = (address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
export const telLink = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`;
