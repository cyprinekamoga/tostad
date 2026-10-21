// Idag: stämpling, dagens jobb och de närmaste dagarna.
import { useEffect, useState } from 'preact/hooks';
import { today, addDays } from '../../lib/planner.js';
import { ErrorMsg } from '../ui.jsx';
import { myJobs, openEntry, openSwaps, jobAction, telLink } from './api.js';
import { JobCard, ClockCard, NavButton, dayName, jobTitle } from './parts.jsx';

export default function Today({ me }) {
  const [jobs, setJobs] = useState(null);
  const [entry, setEntry] = useState(undefined);
  const [swaps, setSwaps] = useState(0);
  const [error, setError] = useState('');
  const now = today();

  async function load() {
    try {
      const [list, open] = await Promise.all([myJobs(now, addDays(now, 7)), openEntry(me.profile.id)]);
      setJobs(list);
      setEntry(open);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
    openSwaps().then((s) => setSwaps(s.filter((x) => x.status === 'oppen').length)).catch(() => {});
  }, []);

  const todays = (jobs ?? []).filter((j) => j.date === now);
  const later = (jobs ?? []).filter((j) => j.date > now && j.status !== 'avbokad');
  const current = todays.find((j) => j.status === 'planerad' && j.end > Date.now()) ?? null;

  async function onWay(job) {
    try {
      await jobAction(job.id, 'on_way');
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div class="st-page">
      <header class="st-hello">
        <h2>Hej {me.profile.full_name.split(' ')[0]}!</h2>
        <p>{dayName(now)}</p>
      </header>
      <ErrorMsg error={error} />
      {entry !== undefined && (
        <ClockCard entry={entry} jobId={current?.id ?? null} jobLabel={current ? jobTitle(current) : ''} onChange={load} />
      )}

      <section class="st-section">
        <h3>Dagens jobb</h3>
        {jobs === null && <p class="muted">Laddar …</p>}
        {jobs?.length >= 0 && todays.length === 0 && <p class="st-empty">Inga jobb idag.</p>}
        {todays.map((j) => (
          <div class="st-jobwrap">
            <JobCard job={j} />
            {j.status === 'planerad' && (
              <div class="st-quick">
                <NavButton job={j} />
                {j.customer_phone && <a class="btn btn--ghost btn--sm" href={telLink(j.customer_phone)}>Ring kunden</a>}
                {!j.on_way_at && j.start > Date.now() && (
                  <button class="btn btn--ghost btn--sm" type="button" onClick={() => onWay(j)}>Vi är på väg</button>
                )}
                {j.on_way_at && <span class="badge">På väg</span>}
              </div>
            )}
          </div>
        ))}
      </section>

      {swaps > 0 && (
        <a class="st-banner" href="/app/ledighet#pass">
          {swaps === 1 ? 'En kollega vill byta bort ett pass.' : `${swaps} pass är lediga att ta.`} Visa
        </a>
      )}

      <section class="st-section">
        <h3>Kommande dagar</h3>
        {jobs !== null && later.length === 0 && <p class="st-empty">Inga jobb bokade den närmaste veckan.</p>}
        {[...new Set(later.map((j) => j.date))].map((d) => (
          <>
            <h4 class="st-day">{dayName(d)}</h4>
            {later.filter((j) => j.date === d).map((j) => <JobCard job={j} compact />)}
          </>
        ))}
        <a class="btn btn--ghost btn--block" href="/app/schema">Hela schemat</a>
      </section>
    </div>
  );
}
