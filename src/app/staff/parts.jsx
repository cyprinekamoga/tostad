// Delar som används på flera sidor i personalens app.
import { useEffect, useState } from 'preact/hooks';
import { SERVICE_LABELS, serviceColor } from '../admin/jobs.js';
import { formatHours, entryHours } from '../../lib/worktime.js';
import { zoned } from '../../lib/planner.js';
import { clockIn, clockOut, mapsLink } from './api.js';

export const jobTitle = (j) => j.customer_name || j.title || SERVICE_LABELS[j.service] || 'Jobb';

export function jobPlace(j, to = false) {
  const street = to ? j.to_street : j.street;
  const postal = to ? j.to_postal_code : j.postal_code;
  const city = to ? j.to_city : j.city;
  return [street, [postal, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

const dayFmt = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
export const dayName = (date) => {
  const s = dayFmt.format(new Date(`${date}T12:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Ett jobb som kort. Hela kortet går till jobbsidan. */
export function JobCard({ job, compact = false }) {
  const place = jobPlace(job);
  return (
    <a class={`st-job${job.status === 'avbokad' ? ' is-cancelled' : ''}${job.status === 'klar' ? ' is-done' : ''}`} href={`/app/jobb?id=${job.id}`} style={`--c:${serviceColor(job.service)}`}>
      <span class="st-job-time">
        <strong>{job.startTime}</strong>
        <small>{job.endTime}</small>
      </span>
      <span class="st-job-body">
        <span class="st-tag">
          {SERVICE_LABELS[job.service]}
          {job.status === 'klar' && ' · klart'}
          {job.status === 'avbokad' && ' · avbokat'}
          {job.my_swap && ' · erbjudet'}
        </span>
        <strong>{jobTitle(job)}</strong>
        {!compact && (place || job.city) && <small>{place || job.city}</small>}
        {!compact && job.team.length > 1 && (
          <span class="st-team">
            {job.team.map((p) => (
              <span class="pl-person-chip"><i style={`background:${p.color}`} />{p.name.split(' ')[0]}</span>
            ))}
          </span>
        )}
      </span>
      <span class="st-chev" aria-hidden="true">›</span>
    </a>
  );
}

export function NavButton({ job }) {
  const place = jobPlace(job);
  if (!place) return null;
  return (
    <a class="btn btn--ghost btn--sm" href={mapsLink(place)} target="_blank" rel="noopener">
      Navigera
    </a>
  );
}

/** Instämplad eller inte, med en stor knapp. */
export function ClockCard({ entry, jobId = null, jobLabel = '', onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [, tick] = useState(0);

  useEffect(() => {
    if (!entry) return;
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, [entry?.id]);

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await onChange();
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }

  return (
    <section class={`st-clock${entry ? ' is-in' : ''}`} aria-live="polite">
      {entry ? (
        <>
          <div>
            <strong>Instämplad sedan {zoned(entry.started_at).time}</strong>
            <small>{formatHours(entryHours(entry))} hittills</small>
          </div>
          <button class="btn st-big" type="button" disabled={busy} onClick={() => run(() => clockOut())}>
            {busy ? 'Stämplar …' : 'Stämpla ut'}
          </button>
        </>
      ) : (
        <>
          <div>
            <strong>Inte instämplad</strong>
            <small>{jobId ? `Stämpla in på ${jobLabel}` : 'Stämpla in när du börjar jobba'}</small>
          </div>
          <button class="btn st-big" type="button" disabled={busy} onClick={() => run(() => clockIn(jobId))}>
            {busy ? 'Stämplar …' : 'Stämpla in'}
          </button>
        </>
      )}
      {error && <p class="msg msg--error" role="alert">{error}</p>}
      <p class="st-fine">Tiden sätts av systemet. Din plats sparas bara när du trycker, om telefonen tillåter det.</p>
    </section>
  );
}
