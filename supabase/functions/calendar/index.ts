// Kalenderlänk för personalen (iCalendar). Telefonens kalender hämtar länken regelbundet.
// Länken innehåller en hemlig nyckel per person och visar bara personens egna jobb, utan
// kundens telefonnummer, pris eller interna anteckningar.
import { createClient } from 'npm:@supabase/supabase-js@2';

const secretKey = (() => {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  return keys ? JSON.parse(keys).default : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
})();
const db = createClient(Deno.env.get('SUPABASE_URL')!, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

const SERVICES: Record<string, string> = {
  flytt: 'Moving',
  flyttstadning: 'Move-out cleaning',
  paket: 'Moving + move-out cleaning',
  hemstadning: 'Home cleaning',
  storstadning: 'Deep cleaning',
  fonsterputs: 'Window cleaning',
  kontor: 'Office cleaning',
  pianoflytt: 'Piano moving / heavy lifting',
  annat: 'Job',
};

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
// Specialtecken i iCalendar-text och radbrytning efter 74 tecken.
const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 74) {
    let cut = 74;
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
  }
  out.push(rest);
  return out.join('\r\n');
}

const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

Deno.serve(async (req) => {
  if (req.method !== 'GET') return new Response(null, { status: 405 });
  const token = new URL(req.url).searchParams.get('t') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(token)) return notFound();
  const { data: person } = await db.from('profiles').select('id, full_name, active').eq('calendar_token', token).maybeSingle();
  if (!person || !person.active) return notFound();

  const from = new Date(Date.now() - 30 * 864e5).toISOString();
  const to = new Date(Date.now() + 120 * 864e5).toISOString();
  const { data: rows } = await db
    .from('job_staff')
    .select('jobs!inner(id, service, title, status, starts_at, ends_at, street, postal_code, city, to_street, to_city, staff_note, updated_at, customers(name))')
    .eq('profile_id', person.id)
    .gte('jobs.starts_at', from)
    .lt('jobs.starts_at', to);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TO Stad och Flytt//Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc('TO Städ & Flytt: my jobs')}`,
    'X-WR-TIMEZONE:Europe/Stockholm',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const row of rows ?? []) {
    // deno-lint-ignore no-explicit-any
    const j = (row as any).jobs;
    if (!j) continue;
    const service = SERVICES[j.service] ?? 'Job';
    const who = j.customers?.name || j.title;
    const place = [j.street, [j.postal_code, j.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const description = [j.to_street ? `To: ${[j.to_street, j.to_city].filter(Boolean).join(', ')}` : '', j.staff_note ?? '', 'Details: https://tostadflytt.se/app']
      .filter(Boolean)
      .join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${j.id}@tostadflytt.se`,
      `DTSTAMP:${stamp(j.updated_at)}`,
      `DTSTART:${stamp(j.starts_at)}`,
      `DTEND:${stamp(j.ends_at)}`,
      fold(`SUMMARY:${esc(`${j.status === 'avbokad' ? 'CANCELLED: ' : ''}${service}${who ? `: ${who}` : ''}`)}`),
      ...(place ? [fold(`LOCATION:${esc(place)}`)] : []),
      fold(`DESCRIPTION:${esc(description)}`),
      `STATUS:${j.status === 'avbokad' ? 'CANCELLED' : 'CONFIRMED'}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return new Response(lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="tostad-schema.ics"',
      'Cache-Control': 'private, max-age=300',
    },
  });
});
