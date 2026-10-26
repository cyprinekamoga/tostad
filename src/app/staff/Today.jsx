// Idag: dagens jobb, påminnelse om att rapportera timmar och de närmaste dagarna.
import { useEffect, useState } from 'preact/hooks';
import { today, addDays } from '../../lib/planner.js';
import { ErrorMsg } from '../ui.jsx';
import { myJobs, myHours, openSwaps, telLink } from './api.js';
import { JobCard, NavButton, OnTheWay, dayName, jobTitle } from './parts.jsx';

export default function Today({ me }) {
  const [jobs, setJobs] = useState(null);
  const [reported, setReported] = useState(null);
  const [swaps, setSwaps] = useState(0);
  const [error, setError] = useState('');
  const now = today();

  async function load() {
    try {
      const [list, hours] = await Promise.all([myJobs(now, addDays(now, 7)), myHours(addDays(now, -7), now)]);
      setJobs(list);
      setReported(new Set(hours.map((h) => h.job_id).filter(Boolean)));
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
  // Jobb som har börjat idag men saknar dina timmar.
  const toReport = reported ? todays.filter((j) => j.status !== 'avbokad' && j.start <= Date.now() && !reported.has(j.id)) : [];

  const [info, setInfo] = useState('');
  function onWay(text) {
    setInfo(text);
    load();
  }

  return (
    <div class="st-page">
      <header class="st-hello">
        <h2>Hi {me.profile.full_name.split(' ')[0]}!</h2>
        <p>{dayName(now)}</p>
      </header>
      <ErrorMsg error={error} />
      {info && <p class="msg msg--ok">{info}</p>}

      {reported && (
        <section class="st-card st-report">
          <h3>Your hours</h3>
          {toReport.length > 0 ? (
            <>
              <p class="muted">Write how many hours you worked and who you worked with.</p>
              <div class="st-actions st-actions--stack">
                {toReport.map((j) => (
                  <a class="btn" href={`/app/jobb?id=${j.id}#hours`}>Report hours for {jobTitle(j)}</a>
                ))}
              </div>
            </>
          ) : (
            <p class="muted">{todays.some((j) => reported.has(j.id)) ? 'You have reported your hours for today. Thank you!' : 'Report your hours after each job.'}</p>
          )}
          <a class="btn btn--ghost btn--sm" href="/app/tider">Report other hours</a>
        </section>
      )}

      <section class="st-section">
        <h3>Today's jobs</h3>
        {jobs === null && <p class="muted">Loading …</p>}
        {jobs?.length >= 0 && todays.length === 0 && <p class="st-empty">No jobs today.</p>}
        {todays.map((j) => (
          <div class="st-jobwrap">
            <JobCard job={j} />
            {j.status === 'planerad' && (
              <div class="st-quick">
                <NavButton job={j} />
                {j.customer_phone && <a class="btn btn--ghost btn--sm" href={telLink(j.customer_phone)}>Call the customer</a>}
                {!j.on_way_at && j.start > Date.now() && (
                  <OnTheWay job={j} small onDone={onWay} />
                )}
                {j.on_way_at && <span class="badge">On the way</span>}
              </div>
            )}
          </div>
        ))}
      </section>

      {swaps > 0 && (
        <a class="st-banner" href="/app/ledighet#pass">
          {swaps === 1 ? 'A colleague wants to give away a shift.' : `${swaps} shifts are open to take.`} Show
        </a>
      )}

      <section class="st-section">
        <h3>Coming days</h3>
        {jobs !== null && later.length === 0 && <p class="st-empty">No jobs booked in the coming week.</p>}
        {[...new Set(later.map((j) => j.date))].map((d) => (
          <>
            <h4 class="st-day">{dayName(d)}</h4>
            {later.filter((j) => j.date === d).map((j) => <JobCard job={j} compact />)}
          </>
        ))}
        <a class="btn btn--ghost btn--block" href="/app/schema">Full schedule</a>
      </section>
    </div>
  );
}
