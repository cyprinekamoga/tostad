// Delar som används på flera sidor i personalens app.
import { useEffect, useState } from 'preact/hooks';
import { SERVICE_LABELS, serviceColor } from '../admin/jobs.js';
import { formatHours, parseHours, jobHours } from '../../lib/worktime.js';
import { today, addDays } from '../../lib/planner.js';
import { ErrorMsg } from '../ui.jsx';
import { colleagues, reportHours, mapsLink, onTheWay } from './api.js';
import { pushState, turnOn, turnOff, sendTest } from './push.js';

export const jobTitle = (j) => j.customer_name || j.title || SERVICE_LABELS[j.service] || 'Job';

export function jobPlace(j, to = false) {
  const street = to ? j.to_street : j.street;
  const postal = to ? j.to_postal_code : j.postal_code;
  const city = to ? j.to_city : j.city;
  return [street, [postal, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
export const dayName = (date) => dayFmt.format(new Date(`${date}T12:00:00Z`));

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
          {job.status === 'klar' && ' · done'}
          {job.status === 'avbokad' && ' · cancelled'}
          {job.my_swap && ' · offered'}
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
      Directions
    </a>
  );
}

// Kollegorna hämtas en gång per sidvisning.
let colleaguesOnce;
const loadColleagues = () => (colleaguesOnce ??= colleagues().catch((e) => {
  colleaguesOnce = null;
  throw e;
}));

/** Kollegorna och deras timmar som formuläret ska börja med. */
function startTeam(job, existing, meId) {
  if (existing) {
    return Object.fromEntries(existing.team.map((p) => [p.id, Number(p.hours) === Number(existing.hours) ? null : String(p.hours)]));
  }
  return Object.fromEntries((job?.team ?? []).filter((p) => p.id !== meId).map((p) => [p.id, null]));
}

/**
 * Rapportera timmar för sig själv och kollegorna. Kollegorna får samma timmar som du,
 * om du inte ändrar för någon av dem.
 * job: ett bestämt jobb (jobbsidan). jobs: jobb att välja bland (sidan Hours).
 */
export function HoursForm({ me, job = null, jobs = null, existing = null, onSaved, onCancel }) {
  const now = today();
  const firstJob = job ?? null;
  const [jobId, setJobId] = useState(firstJob?.id ?? '');
  const [date, setDate] = useState(existing?.work_date ?? (firstJob && firstJob.date <= now ? firstJob.date : now));
  const [hours, setHours] = useState(existing ? String(Number(existing.hours)) : firstJob ? String(jobHours(firstJob)) : '');
  const [team, setTeam] = useState(() => startTeam(firstJob, existing, me.profile.id));
  const [note, setNote] = useState(existing?.note ?? '');
  const [people, setPeople] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadColleagues().then((list) => setPeople(list.filter((p) => p.id !== me.profile.id)), (e) => setError(e.message));
  }, []);

  const mine = parseHours(hours);
  const chosen = Object.keys(team);

  function pickJob(id) {
    setJobId(id);
    const j = (jobs ?? []).find((x) => x.id === id);
    if (!j) return;
    setDate(j.date <= now ? j.date : now);
    setHours(String(jobHours(j)));
    setTeam(startTeam(j, null, me.profile.id));
  }

  function toggle(id) {
    const next = { ...team };
    if (id in next) delete next[id];
    else next[id] = null;
    setTeam(next);
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (mine === null) return setError('Write your hours as a number between 0.25 and 16, for example 3.5.');
    const list = [];
    for (const id of chosen) {
      const own = team[id] === null ? mine : parseHours(team[id]);
      if (own === null) {
        const name = people?.find((p) => p.id === id)?.full_name ?? 'your colleague';
        return setError(`Check the hours for ${name}. Use a number between 0.25 and 16.`);
      }
      list.push({ id, hours: own });
    }
    setBusy(true);
    try {
      const result = await reportHours({ date, hours: mine, jobId: jobId || null, note, team: list });
      onSaved(result);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  const jobChoices = (jobs ?? []).filter((j) => j.date <= now && j.status !== 'avbokad');

  return (
    <form class="st-card st-hours form-grid" id="hours" onSubmit={submit}>
      <h3>{existing ? 'Change your hours' : 'Report your hours'}</h3>
      {!job && jobs && (
        <div class="field">
          <label for="hr-job">Job</label>
          <select id="hr-job" value={jobId} onChange={(e) => pickJob(e.currentTarget.value)}>
            <option value="">No specific job</option>
            {jobChoices.map((j) => (
              <option value={j.id}>{dayName(j.date)} {j.startTime} · {jobTitle(j)}</option>
            ))}
          </select>
        </div>
      )}
      <div class="form-2">
        <div class="field">
          <label for="hr-date">Date</label>
          <input id="hr-date" type="date" required min={addDays(now, -31)} max={now} value={date} onInput={(e) => setDate(e.currentTarget.value)} />
        </div>
        <div class="field">
          <label for="hr-hours">Hours you worked</label>
          <input id="hr-hours" type="text" inputMode="decimal" autoComplete="off" required placeholder="For example 3.5" value={hours} onInput={(e) => setHours(e.currentTarget.value)} />
          <small class="hint">{hours && (mine === null ? 'Use a number like 3.5 or 3:30' : formatHours(mine))}</small>
        </div>
      </div>

      <fieldset class="st-with">
        <legend>Who did you work with?</legend>
        {people === null && !error && <p class="muted">Loading …</p>}
        {people?.length === 0 && <p class="muted">No colleagues to choose from.</p>}
        <ul>
          {(people ?? []).map((p) => {
            const on = p.id in team;
            const custom = team[p.id];
            const theirs = custom === null || custom === undefined ? mine : parseHours(custom);
            return (
              <li class={on ? 'is-on' : ''}>
                <label class="st-with-name">
                  <input type="checkbox" checked={on} onChange={() => toggle(p.id)} />
                  <span class="pl-person-chip"><i style={`background:${p.color}`} />{p.full_name}</span>
                </label>
                {on && (custom === null ? (
                  <span class="st-with-hours">
                    <span>{mine === null ? 'Same hours as you' : `Same as you: ${formatHours(mine)}`}</span>
                    <button class="st-link" type="button" onClick={() => setTeam({ ...team, [p.id]: hours })}>Change</button>
                  </span>
                ) : (
                  <span class="st-with-hours">
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`Hours for ${p.full_name}`}
                      value={custom}
                      onInput={(e) => setTeam({ ...team, [p.id]: e.currentTarget.value })}
                    />
                    <span class="muted">{theirs === null ? 'Check the number' : formatHours(theirs)}</span>
                    <button class="st-link" type="button" onClick={() => setTeam({ ...team, [p.id]: null })}>Same as me</button>
                  </span>
                ))}
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div class="field">
        <label for="hr-note">Note (optional)</label>
        <input id="hr-note" type="text" maxLength={500} value={note} onInput={(e) => setNote(e.currentTarget.value)} placeholder="For example: took longer because of the stairs" />
      </div>
      <ErrorMsg error={error} />
      <button class="btn btn--block st-big" type="submit" disabled={busy}>
        {busy ? 'Saving …' : chosen.length ? `Save hours for you and ${chosen.length === 1 ? '1 colleague' : `${chosen.length} colleagues`}` : 'Save my hours'}
      </button>
      {onCancel && <button class="btn btn--ghost btn--block" type="button" onClick={onCancel}>Cancel</button>}
    </form>
  );
}

/** Text efter sparade timmar, med kollegor som redan hade egna timmar. */
export function savedText(result) {
  const parts = ['Your hours are saved.'];
  if (result?.colleagues) parts.push(result.colleagues === 1 ? 'Also saved for 1 colleague.' : `Also saved for ${result.colleagues} colleagues.`);
  if (result?.skipped?.length) parts.push(`${result.skipped.join(', ')} had already reported their own hours for this job, so theirs were not changed.`);
  return parts.join(' ');
}

const ARRIVAL = [10, 15, 20, 30, 45, 60, 90];
const SMS_RESULT = { sent: 'The customer got an SMS.', not_sent: 'No SMS was sent.' };

/** "We are on our way": personalen väljer när de är framme och om kunden ska få ett SMS. */
export function OnTheWay({ job, onDone, small = false }) {
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(30);
  const [sms, setSms] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    setBusy(true);
    setError('');
    try {
      const r = await onTheWay(job.id, minutes, sms);
      setOpen(false);
      onDone?.(`Marked that you are on your way. ${SMS_RESULT[r.sms] ?? `No SMS was sent: ${r.reason}.`}`);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <button class={`btn btn--ghost ${small ? 'btn--sm' : 'btn--block'}`} type="button" onClick={() => setOpen(true)}>
        We are on our way
      </button>
    );
  }
  return (
    <div class="st-onway">
      <ErrorMsg error={error} />
      <p class="st-onway-q">When do you arrive?</p>
      <div class="st-chips" role="radiogroup" aria-label="Arrive in">
        {ARRIVAL.map((m) => (
          <button type="button" role="radio" aria-checked={minutes === m} class={`st-chip${minutes === m ? ' is-on' : ''}`} onClick={() => setMinutes(m)}>
            {m} min
          </button>
        ))}
      </div>
      <label class="cp-check">
        <input type="checkbox" checked={sms} onChange={(e) => setSms(e.currentTarget.checked)} /> Send an SMS to {jobTitle(job)}
      </label>
      {sms && <p class="hint">The customer gets your first names, the address and that you arrive in about {minutes} minutes.</p>}
      <div class="st-actions">
        <button class="btn" type="button" disabled={busy} onClick={send}>
          {sms ? 'Send' : 'Mark as on the way'}
        </button>
        <button class="btn btn--ghost" type="button" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Pushnotiser på den här telefonen. compact: bara en uppmaning att slå på, visas tills de är på. */
export function Notifications({ compact = false }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    pushState().then(setState).catch(() => setState('unsupported'));
  }, []);

  async function act(fn, done) {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await fn();
      setState(await pushState());
      if (done) setInfo(done);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }

  if (compact) {
    if (state !== 'off') return null;
    return (
      <section class="st-card st-push-ask">
        <p>
          <strong>Get a notification</strong> when you get a new job, or a job is changed or cancelled.
        </p>
        <ErrorMsg error={error} />
        <button class="btn btn--sm" type="button" disabled={busy} onClick={() => act(turnOn)}>
          Turn on notifications
        </button>
      </section>
    );
  }

  return (
    <section class="st-card">
      <h3>Notifications</h3>
      <p class="muted">You get a notification on this phone when you get a new job, are taken off a job, or a job's time, address or status changes.</p>
      <ErrorMsg error={error} />
      {info && <p class="msg msg--ok">{info}</p>}
      {state === null && <p class="muted">Checking …</p>}
      {state === 'homescreen' && (
        <p class="msg">On iPhone, first add the app to your Home Screen (see below), open it from there, and turn on notifications here.</p>
      )}
      {state === 'unsupported' && <p class="msg">This browser cannot show notifications. Use Chrome on Android or the app on your iPhone Home Screen.</p>}
      {state === 'blocked' && <p class="msg">Notifications are blocked for tostadflytt.se. Allow them in the phone settings, then come back here.</p>}
      {state === 'off' && (
        <button class="btn btn--block" type="button" disabled={busy} onClick={() => act(turnOn, 'Notifications are on. Send a test to check.')}>
          Turn on notifications
        </button>
      )}
      {state === 'on' && (
        <div class="st-actions st-actions--stack">
          <p class="msg msg--ok">Notifications are on for this phone.</p>
          <button class="btn btn--ghost" type="button" disabled={busy} onClick={() => act(sendTest, 'A test notification is on its way.')}>
            Send a test notification
          </button>
          <button class="st-link" type="button" disabled={busy} onClick={() => act(turnOff, 'Notifications are off for this phone.')}>
            Turn off on this phone
          </button>
        </div>
      )}
    </section>
  );
}
