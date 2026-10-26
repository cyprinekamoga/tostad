// Pushnotiser till personalen: vad som har hänt med deras jobb. Rena funktioner, så att de går att testa.
const TZ = 'Europe/Stockholm';

const SERVICE = {
  flytt: 'Moving',
  flyttstadning: 'Move-out cleaning',
  paket: 'Moving and cleaning',
  hemstadning: 'Home cleaning',
  storstadning: 'Deep cleaning',
  fonsterputs: 'Window cleaning',
  kontor: 'Office cleaning',
  pianoflytt: 'Piano moving',
  annat: 'Job',
};
const whenFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const when = (iso) => whenFmt.format(new Date(iso)).replace(',', '');

const TITLE = { ny: 'New job', borttagen: 'You are off a job', andrad: 'Job changed', avbokad: 'Job cancelled' };

/**
 * Det som faktiskt har hänt för en person och ett jobb, från alla händelser i kön (äldst först).
 * Bortplockad och tillagd igen blir ingenting, eller "ändrad" om tid eller adress också ändrades.
 * onJobNow: om personen är bokad på jobbet just nu och jobbet är planerat.
 */
export function outcome(events, onJobNow) {
  const kinds = events.map((e) => e.kind);
  const wasOn = kinds[0] !== 'ny';
  if (!wasOn && onJobNow) return 'ny';
  if (wasOn && !onJobNow) return kinds.includes('avbokad') ? 'avbokad' : 'borttagen';
  if (wasOn && onJobNow && kinds.includes('andrad')) return 'andrad';
  return null;
}

/** Notisen för en person. items: [{ kind, job_id, service, starts_at, city }]. */
export function notification(items) {
  const line = (i) => [when(i.starts_at), SERVICE[i.service] ?? 'Job', i.city].filter(Boolean).join(' · ');
  if (items.length === 1) {
    const i = items[0];
    const url = i.kind === 'ny' || i.kind === 'andrad' ? `/app/jobb?id=${i.job_id}` : '/app/schema';
    return { title: TITLE[i.kind], body: line(i), url, tag: `job-${i.job_id}` };
  }
  const sorted = [...items].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const news = items.filter((i) => i.kind === 'ny').length;
  const title = news === items.length ? `${news} new jobs` : `${items.length} changes in your schedule`;
  const body = sorted.slice(0, 4).map((i) => `${TITLE[i.kind]}: ${line(i)}`).join('\n') + (items.length > 4 ? `\nand ${items.length - 4} more` : '');
  return { title, body, url: '/app/schema', tag: 'schedule' };
}
