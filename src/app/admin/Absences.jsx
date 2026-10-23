// Ledighet och passbyten: godkänn eller neka, se kommande frånvaro och lägg in frånvaro åt någon.
import { useEffect, useState } from 'preact/hooks';
import { supabase, formatDateTime } from '../../lib/supabase.js';
import { today } from '../../lib/planner.js';
import { ErrorMsg, Modal } from '../ui.jsx';
import { SERVICE_LABELS, serviceColor } from './jobs.js';
import { ABSENCE_KIND, ABSENCE_STATUS } from '../staff/api.js';

const shortDate = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmt = (d) => shortDate.format(new Date(`${d}T12:00:00Z`));
const range = (a) => (a.starts_on === a.ends_on ? fmt(a.starts_on) : `${fmt(a.starts_on)} to ${fmt(a.ends_on)}`);

export default function Absences({ onInboxChange }) {
  const sb = supabase();
  const [absences, setAbsences] = useState(null);
  const [swaps, setSwaps] = useState(null);
  const [people, setPeople] = useState([]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const now = today();

  async function load() {
    const [a, s, p] = await Promise.all([
      sb.from('absences').select('*').gte('ends_on', now).order('starts_on'),
      sb
        .from('swap_requests')
        .select('id, status, note, created_at, from_profile, to_profile, jobs(id, service, title, starts_at, ends_at, city, customers(name))')
        .in('status', ['oppen', 'vantar'])
        .order('created_at'),
      sb.from('profiles').select('id, full_name, color, active').order('full_name'),
    ]);
    if (a.error || s.error) setError('Could not load everything.');
    setAbsences(a.data ?? []);
    setSwaps(s.data ?? []);
    setPeople(p.data ?? []);
    onInboxChange?.();
  }

  useEffect(() => {
    load();
  }, []);

  const person = (id) => people.find((p) => p.id === id) ?? { full_name: 'Unknown', color: '#999' };

  async function run(key, fn) {
    setBusy(key);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message || 'Something went wrong.');
    }
    setBusy('');
  }

  const decide = (a, status) =>
    run(a.id, async () => {
      const { error: e } = await sb.from('absences').update({ status }).eq('id', a.id);
      if (e) throw new Error('Could not save.');
    });

  const decideSwap = (s, approve) =>
    run(s.id, async () => {
      const { error: e } = await sb.rpc('decide_swap', { p_id: s.id, p_approve: approve });
      if (e) throw new Error(e.message);
    });

  const pending = (absences ?? []).filter((a) => a.status === 'begard');
  const upcoming = (absences ?? []).filter((a) => a.status !== 'begard');
  const waiting = (swaps ?? []).filter((s) => s.status === 'vantar');
  const open = (swaps ?? []).filter((s) => s.status === 'oppen');

  return (
    <>
      <div class="cp-head">
        <h2>Time off and shift swaps</h2>
        <button class="btn btn--sm" type="button" onClick={() => setAdding(true)}>Add an absence</button>
      </div>
      <ErrorMsg error={error} />

      <section class="cp-panel" style="margin-bottom:16px">
        <h3 class="cp-subhead">Waiting for a decision</h3>
        {absences !== null && pending.length === 0 && waiting.length === 0 && <p class="muted">Nothing is waiting for you.</p>}
        <ul class="cp-list">
          {pending.map((a) => {
            const p = person(a.profile_id);
            return (
              <li class="cp-row cp-row--static">
                <span class="cp-row-top">
                  <strong><span class="dot" style={`background:${p.color}`} /> {p.full_name}: {ABSENCE_KIND[a.kind].toLowerCase()} {range(a)}</strong>
                  <span class="badge badge--ny">Time off</span>
                </span>
                {a.note && <p>{a.note}</p>}
                <small>Sent {formatDateTime(a.created_at)}</small>
                <span class="cp-actions">
                  <button class="btn btn--sm" type="button" disabled={busy === a.id} onClick={() => decide(a, 'godkand')}>Approve</button>
                  <button class="btn btn--danger btn--sm" type="button" disabled={busy === a.id} onClick={() => decide(a, 'nekad')}>Decline</button>
                </span>
              </li>
            );
          })}
          {waiting.map((s) => {
            const j = s.jobs;
            return (
              <li class="cp-row cp-row--static" style={`border-left:6px solid ${serviceColor(j?.service)}`}>
                <span class="cp-row-top">
                  <strong>Shift swap: {person(s.from_profile).full_name} to {person(s.to_profile).full_name}</strong>
                  <span class="badge">{SERVICE_LABELS[j?.service]}</span>
                </span>
                <p>{j ? `${formatDateTime(j.starts_at)} · ${j.customers?.name || j.title || ''} ${j.city ? `· ${j.city}` : ''}` : 'The job no longer exists'}</p>
                {s.note && <p>"{s.note}"</p>}
                <span class="cp-actions">
                  <button class="btn btn--sm" type="button" disabled={busy === s.id} onClick={() => decideSwap(s, true)}>Approve the swap</button>
                  <button class="btn btn--danger btn--sm" type="button" disabled={busy === s.id} onClick={() => decideSwap(s, false)}>Decline</button>
                  {j && <a class="btn btn--ghost btn--sm" href={`/admin/planering?jobb=${j.id}`}>Show the job</a>}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {open.length > 0 && (
        <section class="cp-panel" style="margin-bottom:16px">
          <h3 class="cp-subhead">Shifts offered to colleagues</h3>
          <ul class="cp-list">
            {open.map((s) => (
              <li class="cp-row cp-row--static">
                <strong>{person(s.from_profile).full_name}</strong>
                <p>{s.jobs ? `${SERVICE_LABELS[s.jobs.service]} ${formatDateTime(s.jobs.starts_at)}` : ''} · nobody has taken the shift yet</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section class="cp-panel">
        <h3 class="cp-subhead">Upcoming absences</h3>
        {absences !== null && upcoming.length === 0 && <p class="muted">No absences added.</p>}
        <ul class="cp-list">
          {upcoming.map((a) => {
            const p = person(a.profile_id);
            return (
              <li class="cp-row cp-row--static">
                <span class="cp-row-top">
                  <strong><span class="dot" style={`background:${p.color}`} /> {p.full_name}: {ABSENCE_KIND[a.kind].toLowerCase()} {range(a)}</strong>
                  <span class={`badge ${a.status === 'nekad' ? 'badge--skadeanmalan' : ''}`}>{ABSENCE_STATUS[a.status]}</span>
                </span>
                {a.note && <p>{a.note}</p>}
                <span class="cp-actions">
                  {a.status === 'godkand' && a.kind === 'ledighet' && (
                    <button class="btn btn--ghost btn--sm" type="button" disabled={busy === a.id} onClick={() => decide(a, 'nekad')}>Change to declined</button>
                  )}
                  <button
                    class="btn btn--ghost btn--sm"
                    type="button"
                    disabled={busy === a.id}
                    onClick={() => window.confirm('Remove the absence?') && run(a.id, async () => {
                      const { error: e } = await sb.from('absences').delete().eq('id', a.id);
                      if (e) throw new Error('Could not remove.');
                    })}
                  >
                    Remove
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <Modal open={adding} label="Add an absence" onClose={() => setAdding(false)}>
        {adding && <AddAbsence people={people.filter((p) => p.active)} onDone={() => { setAdding(false); load(); }} />}
      </Modal>
    </>
  );
}

function AddAbsence({ people, onDone }) {
  const now = today();
  const [form, setForm] = useState({ profile_id: people[0]?.id ?? '', kind: 'sjuk', starts_on: now, ends_on: now, note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.currentTarget.value });

  async function submit(e) {
    e.preventDefault();
    if (form.ends_on < form.starts_on) return setError('The end date must be the same day or later.');
    setBusy(true);
    // En administratör som lägger in frånvaro godkänner den samtidigt.
    const { error: err } = await supabase()
      .from('absences')
      .insert({ ...form, note: form.note.trim() || null, status: 'godkand' });
    setBusy(false);
    if (err) return setError('Could not save.');
    onDone();
  }

  return (
    <form onSubmit={submit}>
      <h3>Add an absence</h3>
      <div class="form-2">
        <div class="field">
          <label for="aa-person">Person</label>
          <select id="aa-person" value={form.profile_id} onChange={set('profile_id')}>
            {people.map((p) => <option value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
        <div class="field">
          <label for="aa-kind">Type</label>
          <select id="aa-kind" value={form.kind} onChange={set('kind')}>
            {Object.entries(ABSENCE_KIND).map(([k, v]) => <option value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <div class="form-2">
        <div class="field">
          <label for="aa-from">From</label>
          <input id="aa-from" type="date" required value={form.starts_on} onInput={set('starts_on')} />
        </div>
        <div class="field">
          <label for="aa-to">To (inclusive)</label>
          <input id="aa-to" type="date" required min={form.starts_on} value={form.ends_on} onInput={set('ends_on')} />
        </div>
      </div>
      <div class="field">
        <label for="aa-note">Note</label>
        <input id="aa-note" type="text" maxLength={500} value={form.note} onInput={set('note')} />
      </div>
      <ErrorMsg error={error} />
      <div class="cp-actions">
        <button class="btn" type="submit" disabled={busy}>Save</button>
        <button class="btn btn--ghost" type="button" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}
