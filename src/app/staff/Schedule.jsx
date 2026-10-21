// Schema: veckans dagar överst och jobben i tidsordning.
import { useEffect, useState } from 'preact/hooks';
import { today, addDays, startOfWeek, daysBetween, weekNumber, weekday } from '../../lib/planner.js';
import { ErrorMsg } from '../ui.jsx';
import { myJobs } from './api.js';
import { JobCard, dayName } from './parts.jsx';
import { formatHours } from '../../lib/worktime.js';

const DAY_NAMES = ['mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön'];

export default function Schedule() {
  const now = today();
  const [monday, setMonday] = useState(startOfWeek(now));
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState('');
  const days = daysBetween(monday, addDays(monday, 6));

  useEffect(() => {
    setJobs(null);
    myJobs(monday, addDays(monday, 6)).then(setJobs, (e) => setError(e.message));
  }, [monday]);

  const planned = (jobs ?? []).filter((j) => j.status !== 'avbokad');
  const hours = planned.reduce((s, j) => s + (j.end - j.start) / 3600000, 0);

  return (
    <div class="st-page">
      <div class="st-weekbar">
        <button class="btn btn--ghost btn--sm" type="button" aria-label="Föregående vecka" onClick={() => setMonday(addDays(monday, -7))}>‹</button>
        <div>
          <strong>Vecka {weekNumber(monday)}</strong>
          <small>{jobs ? `${planned.length} jobb · ${formatHours(hours)}` : 'Laddar …'}</small>
        </div>
        <button class="btn btn--ghost btn--sm" type="button" aria-label="Nästa vecka" onClick={() => setMonday(addDays(monday, 7))}>›</button>
      </div>
      {monday !== startOfWeek(now) && (
        <button class="btn btn--ghost btn--sm btn--block" type="button" onClick={() => setMonday(startOfWeek(now))}>Till denna vecka</button>
      )}
      <div class="pl-strip">
        {days.map((d) => {
          const count = planned.filter((j) => j.date === d).length;
          return (
            <a href={`#d${d}`} class={d === now ? 'is-today' : ''}>
              <small>{DAY_NAMES[weekday(d)]}</small>
              <strong>{Number(d.slice(8))}</strong>
              <span class="pl-count">{count || ''}</span>
            </a>
          );
        })}
      </div>
      <ErrorMsg error={error} />
      {jobs !== null &&
        days.map((d) => {
          const list = jobs.filter((j) => j.date === d);
          return (
            <section class="st-section" id={`d${d}`}>
              <h4 class="st-day">{dayName(d)}{d === now && <span class="badge">Idag</span>}</h4>
              {list.length === 0 ? <p class="st-empty st-empty--sm">Ledig</p> : list.map((j) => <JobCard job={j} />)}
            </section>
          );
        })}
    </div>
  );
}
