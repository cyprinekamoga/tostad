// Mina timmar: rapportera timmar och se dem per månad med summa per vecka.
import { useEffect, useState } from 'preact/hooks';
import { today, addDays, weekNumber } from '../../lib/planner.js';
import { sumHours, formatHours, entryHours } from '../../lib/worktime.js';
import { ErrorMsg } from '../ui.jsx';
import { myHours, myJobs, deleteHours } from './api.js';
import { dayName, HoursForm, savedText } from './parts.jsx';

const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}
const lastDay = (month) => addDays(`${shiftMonth(month, 1)}-01`, -1);

export default function Hours({ me }) {
  const now = today();
  const [month, setMonth] = useState(now.slice(0, 7));
  const [rows, setRows] = useState(null);
  const [jobs, setJobs] = useState(null);
  const [form, setForm] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function load() {
    setRows(null);
    try {
      setRows(await myHours(`${month}-01`, lastDay(month)));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, [month]);

  async function openForm() {
    setInfo('');
    setForm(true);
    if (!jobs) myJobs(addDays(now, -14), now).then((list) => setJobs(list.reverse()), () => setJobs([]));
  }

  async function remove(row) {
    if (!window.confirm(`Remove ${formatHours(entryHours(row))} on ${dayName(row.work_date)}?`)) return;
    setError('');
    try {
      await deleteHours(row.id);
      setInfo('The hours are removed.');
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  const sums = sumHours(rows ?? []);
  const days = Object.keys(sums.days).sort().reverse();
  const canRemove = (r) => !r.edited && r.work_date >= addDays(now, -31);

  return (
    <div class="st-page">
      {form ? (
        jobs === null ? (
          <p class="muted">Loading …</p>
        ) : (
          <HoursForm
            me={me}
            jobs={jobs}
            onCancel={() => setForm(false)}
            onSaved={(result) => {
              setForm(false);
              setInfo(savedText(result));
              setMonth(now.slice(0, 7));
              load();
            }}
          />
        )
      ) : (
        <button class="btn btn--block st-big" type="button" onClick={openForm}>Report hours</button>
      )}
      {info && <p class="msg msg--ok" role="status">{info}</p>}

      <div class="st-weekbar">
        <button class="btn btn--ghost btn--sm" type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <div>
          <strong>{monthFmt.format(new Date(`${month}-15T12:00:00Z`))}</strong>
          <small>{rows ? `Total ${formatHours(sums.total)}` : 'Loading …'}</small>
        </div>
        <button class="btn btn--ghost btn--sm" type="button" aria-label="Next month" disabled={month >= now.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
      </div>
      <ErrorMsg error={error} />
      {rows !== null && Object.keys(sums.weeks).length > 0 && (
        <section class="st-card">
          <h3>Per week</h3>
          <ul class="st-sum">
            {Object.keys(sums.weeks).sort().map((w) => (
              <li><span>Week {weekNumber(w)}</span><strong>{formatHours(sums.weeks[w])}</strong></li>
            ))}
          </ul>
        </section>
      )}
      {rows?.length === 0 && <p class="st-empty">No hours reported this month.</p>}
      {days.map((d) => (
        <section class="st-section">
          <h4 class="st-day">{dayName(d)} <span class="muted">{formatHours(sums.days[d])}</span></h4>
          <ul class="st-entries">
            {rows.filter((r) => r.work_date === d).map((r) => (
              <li>
                <span>{r.job_label || 'No specific job'}</span>
                <strong>{formatHours(entryHours(r))}</strong>
                {r.team.length > 0 && <small class="muted">With {r.team.map((p) => `${p.name.split(' ')[0]} (${formatHours(Number(p.hours))})`).join(', ')}</small>}
                {r.reported_by && r.reported_by !== me.profile.id && <small class="muted">Reported by {r.reporter_name ?? 'a colleague'}</small>}
                {r.edited && <small class="muted">Corrected by an admin</small>}
                {r.note && <small class="muted">{r.note}</small>}
                {canRemove(r) && <button class="st-link" type="button" onClick={() => remove(r)}>Remove</button>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p class="st-fine">To change hours for a job, open the job and press Change. Hours older than a month or corrected by an admin can only be changed by an admin.</p>
    </div>
  );
}
