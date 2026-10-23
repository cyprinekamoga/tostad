// Ledighet: ansök om ledighet, sjukanmäl, markera dagar då man inte kan jobba, och ta lediga pass.
import { useEffect, useState } from 'preact/hooks';
import { today, addDays } from '../../lib/planner.js';
import { SERVICE_LABELS, serviceColor } from '../admin/jobs.js';
import { formatDateTime } from '../../lib/supabase.js';
import { ErrorMsg } from '../ui.jsx';
import { ABSENCE_KIND, ABSENCE_STATUS, myAbsences, addAbsence, removeAbsence, openSwaps, takeSwap, cancelSwap } from './api.js';

const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtDate = (d) => shortDate.format(new Date(`${d}T12:00:00Z`));
const range = (a) => (a.starts_on === a.ends_on ? fmtDate(a.starts_on) : `${fmtDate(a.starts_on)} to ${fmtDate(a.ends_on)}`);

const HELP = {
  ledighet: 'Time off needs to be approved by an admin.',
  sjuk: 'Calling in sick takes effect right away. Also call your manager if you were supposed to work today.',
  kan_inte: 'Shown in the planner so that you are not booked on those days.',
};

export default function Leave({ me }) {
  const now = today();
  const [list, setList] = useState(null);
  const [swaps, setSwaps] = useState(null);
  const [form, setForm] = useState({ kind: 'ledighet', starts_on: addDays(now, 1), ends_on: addDays(now, 1), note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const set = (key) => (e) => {
    const value = e.currentTarget.value;
    const next = { ...form, [key]: value };
    if (key === 'starts_on' && next.ends_on < value) next.ends_on = value;
    if (key === 'kind' && value === 'sjuk') Object.assign(next, { starts_on: now, ends_on: now });
    setForm(next);
  };

  async function load() {
    try {
      const [a, s] = await Promise.all([myAbsences(me.profile.id), openSwaps()]);
      setList(a);
      setSwaps(s);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function run(fn, done) {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await fn();
      await load();
      setInfo(done);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }

  function submit(e) {
    e.preventDefault();
    if (form.ends_on < form.starts_on) return setError('The end date must be the same day or later.');
    run(async () => {
      await addAbsence(me.profile.id, form);
      setForm({ ...form, note: '' });
    }, form.kind === 'ledighet' ? 'Your request is sent.' : 'It is registered.');
  }

  const upcoming = (list ?? []).filter((a) => a.ends_on >= now);
  const past = (list ?? []).filter((a) => a.ends_on < now);

  return (
    <div class="st-page">
      <form class="st-card form-grid" onSubmit={submit}>
        <h3>Report an absence</h3>
        <div class="cp-tabs st-kinds" role="radiogroup" aria-label="Type">
          {Object.entries(ABSENCE_KIND).map(([k, v]) => (
            <button type="button" role="radio" aria-checked={form.kind === k} aria-pressed={form.kind === k} onClick={() => set('kind')({ currentTarget: { value: k } })}>{v}</button>
          ))}
        </div>
        <p class="muted">{HELP[form.kind]}</p>
        <div class="form-2">
          <div class="field">
            <label for="ab-from">From</label>
            <input id="ab-from" type="date" required value={form.starts_on} onInput={set('starts_on')} />
          </div>
          <div class="field">
            <label for="ab-to">To (inclusive)</label>
            <input id="ab-to" type="date" required min={form.starts_on} value={form.ends_on} onInput={set('ends_on')} />
          </div>
        </div>
        <div class="field">
          <label for="ab-note">Message (optional)</label>
          <textarea id="ab-note" rows={2} maxLength={500} value={form.note} onInput={set('note')} />
        </div>
        <ErrorMsg error={error} />
        {info && <p class="msg msg--ok">{info}</p>}
        <button class="btn btn--block st-big" type="submit" disabled={busy}>
          {form.kind === 'ledighet' ? 'Send request' : form.kind === 'sjuk' ? 'Call in sick' : 'Save'}
        </button>
      </form>

      <section class="st-section">
        <h3>My absences</h3>
        {list !== null && upcoming.length === 0 && <p class="st-empty st-empty--sm">No planned absences.</p>}
        <ul class="st-list">
          {upcoming.map((a) => (
            <li>
              <div>
                <strong>{ABSENCE_KIND[a.kind]}</strong> {range(a)}
                {a.note && <small class="muted">{a.note}</small>}
              </div>
              <span class={`badge ${a.status === 'begard' ? 'badge--ny' : a.status === 'nekad' ? 'badge--skadeanmalan' : ''}`}>{ABSENCE_STATUS[a.status]}</span>
              {(a.status === 'begard' || a.kind !== 'ledighet') && (
                <button class="st-link" type="button" disabled={busy} onClick={() => window.confirm('Remove?') && run(() => removeAbsence(a.id), 'Removed.')}>Remove</button>
              )}
            </li>
          ))}
        </ul>
        {past.length > 0 && (
          <details>
            <summary>Earlier</summary>
            <ul class="st-list">
              {past.map((a) => (
                <li><div><strong>{ABSENCE_KIND[a.kind]}</strong> {range(a)}</div><span class="badge badge--muted">{ABSENCE_STATUS[a.status]}</span></li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section class="st-section" id="pass">
        <h3>Open shifts</h3>
        <p class="muted">Shifts your colleagues want to give away. If you take one, an admin approves the swap.</p>
        {swaps !== null && swaps.length === 0 && <p class="st-empty st-empty--sm">No open shifts right now.</p>}
        {(swaps ?? []).map((s) => {
          const start = new Date(s.starts_at);
          return (
            <div class="st-swap" style={`--c:${serviceColor(s.service)}`}>
              <div>
                <span class="st-tag">{SERVICE_LABELS[s.service]}</span>
                <strong>{formatDateTime(s.starts_at)} to {new Date(s.ends_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' })}</strong>
                <small>{[s.city, `from ${s.from_name.split(' ')[0]}`].filter(Boolean).join(' · ')}</small>
                {s.note && <small class="muted">"{s.note}"</small>}
              </div>
              {s.mine ? (
                <div class="st-swap-act">
                  <span class="badge badge--ny">Waiting for approval</span>
                  <button class="st-link" type="button" disabled={busy} onClick={() => run(() => cancelSwap(s.id), 'You have given the shift back.')}>Undo</button>
                </div>
              ) : (
                <button class="btn btn--sm" type="button" disabled={busy || start < Date.now()} onClick={() => run(() => takeSwap(s.id), 'You have taken the shift. It is waiting for approval.')}>Take the shift</button>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
