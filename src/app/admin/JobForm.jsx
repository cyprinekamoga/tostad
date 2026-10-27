// Formulär för ett jobb: kund, tjänst, tid, personal, adresser, pris och återkommande tillfällen.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { ErrorMsg } from '../ui.jsx';
import { ABSENCE_KIND, photos as loadPhotos } from '../staff/api.js';
import { CHECKLISTS } from '../../lib/worktime.js';
import { formatDateTime } from '../../lib/supabase.js';
import { addDays, toInstant, overlaps } from '../../lib/planner.js';
import { serviceColor, SERVICE_LABELS, JOB_STATUS, DEFAULT_HOURS, createJobs, updateJobs, deleteJobs, jobLabel } from './jobs.js';

const MOVES = ['flytt', 'paket', 'pianoflytt'];
const REPEAT = [
  ['0', 'No, just once'],
  ['1', 'Every week'],
  ['2', 'Every other week'],
  ['3', 'Every third week'],
  ['4', 'Every fourth week'],
];

function initialForm(job, prefill) {
  if (job)
    return {
      customer_id: job.customer_id ?? '',
      service: job.service,
      title: job.title ?? '',
      status: job.status,
      date: job.date,
      start: job.startTime,
      end: job.endTime,
      street: job.street ?? '',
      postal_code: job.postal_code ?? '',
      city: job.city ?? '',
      to_street: job.to_street ?? '',
      to_postal_code: job.to_postal_code ?? '',
      to_city: job.to_city ?? '',
      price: job.price ?? '',
      staff_note: job.staff_note ?? '',
      internal_note: job.internal_note ?? '',
      checklist_text: (job.checklist ?? []).map((i) => i.label).join('\n'),
      checklist_prev: job.checklist ?? [],
      staff: [...job.staff],
    };
  const service = prefill.service ?? 'hemstadning';
  const start = prefill.start ?? '08:00';
  const hours = DEFAULT_HOURS[service] ?? 3;
  const [h, m] = start.split(':').map(Number);
  const endH = Math.min(23, h + hours);
  return {
    customer_id: '',
    service,
    title: '',
    status: 'planerad',
    date: prefill.date,
    start,
    end: `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    street: '',
    postal_code: '',
    city: '',
    to_street: '',
    to_postal_code: '',
    to_city: '',
    price: '',
    staff_note: '',
    internal_note: '',
    checklist_text: '',
    staff: [],
    repeat: '0',
    until: addDays(prefill.date, 7 * 12),
    ...prefill,
  };
}

export default function JobForm({ job, prefill, people, customers, jobs, absentOn = () => null, onSaved, onClose, beforeCreate }) {
  const [form, setForm] = useState(() => initialForm(job, prefill ?? {}));
  const [scope, setScope] = useState('one');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.currentTarget.value });
  const isMove = MOVES.includes(form.service);

  const shownCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? customers.filter((c) => [c.name, c.phone, c.email, c.street].some((v) => v?.toLowerCase().includes(q))) : customers;
    const selected = customers.find((c) => c.id === form.customer_id);
    return selected && !list.includes(selected) ? [selected, ...list] : list;
  }, [search, customers, form.customer_id]);

  function pickCustomer(id) {
    const c = customers.find((x) => x.id === id);
    const next = { ...form, customer_id: id };
    // Fyll i adressen från kunden om den inte redan är ifylld.
    if (c && !form.street) Object.assign(next, { street: c.street ?? '', postal_code: c.postal_code ?? '', city: c.city ?? '' });
    setForm(next);
  }

  function toggleStaff(id) {
    setForm({ ...form, staff: form.staff.includes(id) ? form.staff.filter((x) => x !== id) : [...form.staff, id] });
  }

  // Personal som redan har ett annat jobb under samma tid.
  const busyPeople = useMemo(() => {
    if (!form.date || !form.start || !form.end || form.end <= form.start) return {};
    const me = { id: job?.id ?? 'ny', start: toInstant(form.date, form.start).getTime(), end: toInstant(form.date, form.end).getTime() };
    const out = {};
    for (const p of people) {
      const theirs = jobs.filter((j) => j.id !== me.id && j.status !== 'avbokad' && j.staff.includes(p.id));
      const hit = overlaps([me, ...theirs]).find((pair) => pair.includes(me.id));
      if (hit) out[p.id] = theirs.find((j) => hit.includes(j.id));
    }
    return out;
  }, [form.date, form.start, form.end, jobs, people]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (form.end <= form.start) return setError('The end time must be after the start time.');
    if (!job && form.repeat !== '0' && form.until < form.date) return setError('The end date of the series must be after the first visit.');
    if (!job && form.repeat !== '0' && form.until > addDays(form.date, 366)) return setError('A series can be at most one year. Extend it later if needed.');
    setBusy(true);
    try {
      let values = form;
      if (!job && beforeCreate) values = { ...form, ...(await beforeCreate(form)) };
      const ids = job ? await updateJobs(job, values, scope) : await createJobs(values);
      onSaved(ids, values);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function remove() {
    const many = scope === 'following' && job.series_id;
    if (!window.confirm(many ? 'Remove this and all coming visits in the series?' : 'Remove the job?')) return;
    setBusy(true);
    try {
      await deleteJobs(job, scope);
      onSaved([], null);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h3>{job ? jobLabel(job) : 'New job'}</h3>
      {prefill?.fromSubmission && !job && <p class="msg msg--ok">The details come from the booking. Check the time and staff before you save.</p>}

      <div class="form-2">
        <div class="field">
          <label for="j-service"><span class="dot" style={`background:${serviceColor(form.service)}`} /> Service</label>
          <select id="j-service" value={form.service} onChange={set('service')}>
            {Object.entries(SERVICE_LABELS).map(([k, v]) => <option value={k}>{v}</option>)}
          </select>
        </div>
        <div class="field">
          <label for="j-title">Title (optional)</label>
          <input id="j-title" type="text" maxLength={200} value={form.title} onInput={set('title')} />
        </div>
      </div>

      {prefill?.newCustomerName && !job ? (
        <p class="muted">Customer: <strong>{prefill.newCustomerName}</strong> (created or linked from the booking when you save)</p>
      ) : (
        <div class="field">
          <label for="j-customer">Customer</label>
          <input type="search" placeholder="Search customer" aria-label="Search customer" value={search} onInput={(e) => setSearch(e.currentTarget.value)} />
          <select id="j-customer" value={form.customer_id} onChange={(e) => pickCustomer(e.currentTarget.value)}>
            <option value="">No customer chosen</option>
            {shownCustomers.slice(0, 200).map((c) => <option value={c.id}>{c.name}{c.street ? `, ${c.street}` : ''}</option>)}
          </select>
        </div>
      )}

      <div class="form-3">
        <div class="field">
          <label for="j-date">Date</label>
          <input id="j-date" type="date" required value={form.date} onInput={set('date')} />
        </div>
        <div class="field">
          <label for="j-start">Start</label>
          <input id="j-start" type="time" step="900" required value={form.start} onInput={set('start')} />
        </div>
        <div class="field">
          <label for="j-end">End</label>
          <input id="j-end" type="time" step="900" required value={form.end} onInput={set('end')} />
        </div>
      </div>

      <fieldset class="cp-fieldset">
        <legend>Staff</legend>
        <div class="cp-checks">
          {people.map((p) => (
            <label class="cp-check">
              <input type="checkbox" checked={form.staff.includes(p.id)} onChange={() => toggleStaff(p.id)} />
              <span class="dot" style={`background:${p.color}`} /> {p.full_name}
              {busyPeople[p.id] && <small class="cp-warn-text"> busy: {jobLabel(busyPeople[p.id])} {busyPeople[p.id].startTime}</small>}
              {absentOn(p.id, form.date) && <small class="cp-warn-text"> {ABSENCE_KIND[absentOn(p.id, form.date).kind].toLowerCase()}{absentOn(p.id, form.date).status === 'begard' ? ' (requested)' : ''}</small>}
            </label>
          ))}
        </div>
      </fieldset>

      <div class="field">
        <label for="j-street">{isMove ? 'From address' : 'Address'}</label>
        <input id="j-street" type="text" maxLength={200} autocomplete="off" value={form.street} onInput={set('street')} />
      </div>
      <div class="form-2">
        <div class="field">
          <label for="j-zip">Postcode</label>
          <input id="j-zip" type="text" inputmode="numeric" maxLength={10} value={form.postal_code} onInput={set('postal_code')} />
        </div>
        <div class="field">
          <label for="j-city">City</label>
          <input id="j-city" type="text" maxLength={100} value={form.city} onInput={set('city')} />
        </div>
      </div>
      {isMove && (
        <>
          <div class="field">
            <label for="j-tostreet">To address</label>
            <input id="j-tostreet" type="text" maxLength={200} autocomplete="off" value={form.to_street} onInput={set('to_street')} />
          </div>
          <div class="form-2">
            <div class="field">
              <label for="j-tozip">Postcode</label>
              <input id="j-tozip" type="text" inputmode="numeric" maxLength={10} value={form.to_postal_code} onInput={set('to_postal_code')} />
            </div>
            <div class="field">
              <label for="j-tocity">City</label>
              <input id="j-tocity" type="text" maxLength={100} value={form.to_city} onInput={set('to_city')} />
            </div>
          </div>
        </>
      )}

      <div class="form-2">
        <div class="field">
          <label for="j-price">Price to the customer (kr)</label>
          <input id="j-price" type="text" inputmode="numeric" maxLength={9} value={form.price} onInput={set('price')} />
        </div>
        {job && (
          <div class="field">
            <label for="j-status">Status</label>
            <select id="j-status" value={form.status} onChange={set('status')}>
              {Object.entries(JOB_STATUS).map(([k, v]) => <option value={k}>{v}</option>)}
            </select>
          </div>
        )}
      </div>
      <div class="field">
        <label for="j-staffnote">Information for the staff</label>
        <textarea id="j-staffnote" maxLength={5000} rows={3} placeholder="Door code, key, parking, what to do" value={form.staff_note} onInput={set('staff_note')} />
      </div>
      <div class="field">
        <label for="j-check">Checklist for the staff (one item per line)</label>
        <textarea id="j-check" rows={4} maxLength={8000} placeholder={`Leave empty for the standard list:\n${(CHECKLISTS[form.service] ?? CHECKLISTS.annat).slice(0, 3).join('\n')} …`} value={form.checklist_text} onInput={set('checklist_text')} />
        {job?.checklist?.length > 0 && <small class="muted">{job.checklist.filter((i) => i.done).length} of {job.checklist.length} ticked by the staff.</small>}
      </div>
      <div class="field">
        <label for="j-note">Internal note (admins only)</label>
        <textarea id="j-note" maxLength={5000} rows={2} value={form.internal_note} onInput={set('internal_note')} />
      </div>

      {job && <JobProgress job={job} people={people} />}

      {!job && (
        <div class="form-2">
          <div class="field">
            <label for="j-repeat">Recurring</label>
            <select id="j-repeat" value={form.repeat} onChange={set('repeat')}>
              {REPEAT.map(([k, v]) => <option value={k}>{v}</option>)}
            </select>
          </div>
          {form.repeat !== '0' && (
            <div class="field">
              <label for="j-until">Until (inclusive)</label>
              <input id="j-until" type="date" required value={form.until} min={form.date} onInput={set('until')} />
            </div>
          )}
        </div>
      )}

      {job?.series_id && (
        <fieldset class="cp-fieldset">
          <legend>This job is part of a series. The change applies to</legend>
          <label class="cp-check"><input type="radio" name="scope" checked={scope === 'one'} onChange={() => setScope('one')} /> Only this visit</label>
          <label class="cp-check"><input type="radio" name="scope" checked={scope === 'following'} onChange={() => setScope('following')} /> This and all coming visits</label>
        </fieldset>
      )}

      <ErrorMsg error={error} />
      <div class="cp-actions">
        <button class="btn" type="submit" disabled={busy}>{busy ? 'Saving …' : 'Save'}</button>
        <button class="btn btn--ghost" type="button" onClick={onClose}>Cancel</button>
        {job && <button class="btn btn--danger" type="button" disabled={busy} onClick={remove}>Remove</button>}
        {job && job.status !== 'avbokad' && <a class="btn btn--ghost" href={`/admin/fakturor?jobb=${job.id}`}>Create invoice</a>}
      </div>
    </form>
  );
}

// Vad personalen har gjort: på väg, klart och foton.
function JobProgress({ job, people }) {
  const [pics, setPics] = useState(null);
  useEffect(() => {
    loadPhotos(job.id).then(setPics, () => setPics([]));
  }, [job.id]);
  const name = (id) => people.find((p) => p.id === id)?.full_name ?? '';
  const kinds = { fore: 'Before', efter: 'After', skada: 'Damage' };
  if (!job.on_way_at && !job.done_at && !pics?.length) return null;
  return (
    <fieldset class="cp-fieldset">
      <legend>From the staff</legend>
      {job.on_way_at && <p class="muted" style="margin:0">On the way {formatDateTime(job.on_way_at)}</p>}
      {job.done_at && <p class="muted" style="margin:0">Done {formatDateTime(job.done_at)}{job.done_by ? ` by ${name(job.done_by)}` : ''}</p>}
      {pics?.length > 0 && (
        <div class="cp-files">
          {pics.map((p) => (
            <a href={p.url} target="_blank" rel="noopener">
              <img src={p.url} alt={`Photo ${kinds[p.kind].toLowerCase()}`} loading="lazy" />
              {kinds[p.kind]}
            </a>
          ))}
        </div>
      )}
    </fieldset>
  );
}
