// Tid i svensk tid och arbetstidsregler för planeringen. Rena funktioner utan webbläsarberoenden.

export const TZ = 'Europe/Stockholm';
const HOUR = 3600000;
export const DAILY_REST_H = 11;
export const WEEKLY_REST_H = 36;

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Datum (ÅÅÅÅ-MM-DD), klockslag (TT:MM) och minuter efter midnatt i svensk tid. */
export function zoned(when) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(when)).map((x) => [x.type, x.value]));
  const hour = p.hour === '24' ? '00' : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}`, minutes: Number(hour) * 60 + Number(p.minute) };
}

/** Svensk väggtid till en tidpunkt. Hanterar sommar- och vintertid. */
export function toInstant(date, time = '00:00') {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wanted = Date.UTC(y, mo - 1, d, h, mi);
  let guess = wanted;
  for (let i = 0; i < 3; i++) {
    const z = zoned(guess);
    const [zy, zmo, zd] = z.date.split('-').map(Number);
    const shown = Date.UTC(zy, zmo - 1, zd, Math.floor(z.minutes / 60), z.minutes % 60);
    if (shown === wanted) break;
    guess += wanted - shown;
  }
  return new Date(guess);
}

export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 0 = måndag … 6 = söndag. */
export function weekday(date) {
  const [y, m, d] = date.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export const startOfWeek = (date) => addDays(date, -weekday(date));
export const today = () => zoned(Date.now()).date;

export function daysBetween(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** ISO-veckonummer. */
export function weekNumber(date) {
  const thursday = addDays(date, 3 - weekday(date));
  const [y] = thursday.split('-').map(Number);
  const first = `${y}-01-01`;
  const firstThursday = addDays(first, (3 - weekday(first) + 7) % 7);
  return 1 + Math.round((Date.parse(thursday) - Date.parse(firstThursday)) / (7 * 24 * HOUR));
}

export function addMinutes(time, minutes) {
  const [h, m] = time.split(':').map(Number);
  const total = Math.max(0, Math.min(24 * 60 - 1, h * 60 + m + minutes));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Datum för varje tillfälle i en serie, från startdatum till och med slutdatum. Högst 60 tillfällen. */
export function seriesDates(start, intervalWeeks, until) {
  const out = [];
  for (let d = start; d <= until && out.length < 60; d = addDays(d, 7 * intervalWeeks)) out.push(d);
  return out;
}

/** Slår ihop överlappande arbetspass. Tar [{start, end}] i millisekunder. */
function merge(intervals) {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ start: i.start, end: i.end });
  }
  return out;
}

/** Längsta sammanhängande ledighet i fönstret [from, to). */
export function longestRest(intervals, from, to) {
  const inside = merge(intervals.filter((i) => i.end > from && i.start < to).map((i) => ({ start: Math.max(i.start, from), end: Math.min(i.end, to) })));
  let longest = 0;
  let cursor = from;
  for (const i of inside) {
    longest = Math.max(longest, i.start - cursor);
    cursor = i.end;
  }
  return Math.max(longest, to - cursor);
}

/** Par av jobb som överlappar i tid. Tar [{id, start, end}]. */
export function overlaps(intervals) {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j].start < sorted[i].end; j++) out.push([sorted[i].id, sorted[j].id]);
  }
  return out;
}

/**
 * Arbetskedjor: jobb där ledigheten mellan två jobb är kortare än dygnsvilan räknas ihop.
 * En kedja som är längre än 13 timmar betyder att det finns ett dygn utan 11 timmars vila.
 */
export function workChains(intervals) {
  const chains = [];
  for (const i of merge(intervals)) {
    const last = chains[chains.length - 1];
    if (last && i.start - last.end < DAILY_REST_H * HOUR) last.end = i.end;
    else chains.push({ ...i });
  }
  return chains;
}

/**
 * Varningar för en person: dubbelbokning, dygnsvila (11 timmar inom 24 timmar)
 * och veckovila (36 timmar per vecka, måndag till söndag).
 * intervals: [{id, start, end}] i millisekunder. days: datumen som visas.
 */
export function warningsFor(intervals, days) {
  const warnings = [];
  for (const [a, b] of overlaps(intervals)) warnings.push({ kind: 'dubbel', jobs: [a, b] });
  if (!intervals.length) return warnings;
  const shown = new Set(days);
  for (const chain of workChains(intervals)) {
    const hours = (chain.end - chain.start) / HOUR;
    const date = zoned(chain.start).date;
    if (hours > 24 - DAILY_REST_H && shown.has(date)) warnings.push({ kind: 'dygnsvila', date, restHours: Math.max(0, 24 - hours) });
  }
  for (const monday of [...new Set(days.map(startOfWeek))]) {
    const from = toInstant(monday).getTime();
    const to = toInstant(addDays(monday, 7)).getTime();
    const rest = longestRest(intervals, from, to);
    if (rest < WEEKLY_REST_H * HOUR) warnings.push({ kind: 'veckovila', date: monday, restHours: rest / HOUR });
  }
  return warnings;
}

/** Google Maps-länk med vägbeskrivning genom alla adresser i ordning. */
export function routeLink(origin, stops) {
  const list = stops.filter(Boolean);
  if (!list.length) return null;
  const params = new URLSearchParams({ api: '1', travelmode: 'driving', destination: list[list.length - 1] });
  if (origin) params.set('origin', origin);
  if (list.length > 1) params.set('waypoints', list.slice(0, -1).join('|'));
  return `https://www.google.com/maps/dir/?${params}`;
}
