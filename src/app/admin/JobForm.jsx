// Formulär för ett jobb: kund, tjänst, tid, personal, adresser, pris och återkommande tillfällen.
import { useMemo, useState } from 'preact/hooks';
import { ErrorMsg } from '../ui.jsx';
import { addDays, toInstant, overlaps } from '../../lib/planner.js';
import { SERVICE_LABELS, JOB_STATUS, DEFAULT_HOURS, createJobs, updateJobs, deleteJobs, jobLabel } from './jobs.js';

const MOVES = ['flytt', 'paket', 'pianoflytt'];
const REPEAT = [
  ['0', 'Nej, bara en gång'],
  ['1', 'Varje vecka'],
  ['2', 'Varannan vecka'],
  ['3', 'Var tredje vecka'],
  ['4', 'Var fjärde vecka'],
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
    staff: [],
    repeat: '0',
    until: addDays(prefill.date, 7 * 12),
    ...prefill,
  };
}

export default function JobForm({ job, prefill, people, customers, jobs, onSaved, onClose, beforeCreate }) {
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
    if (form.end <= form.start) return setError('Sluttiden måste vara efter starttiden.');
    if (!job && form.repeat !== '0' && form.until < form.date) return setError('Slutdatumet för serien måste vara efter första tillfället.');
    if (!job && form.repeat !== '0' && form.until > addDays(form.date, 366)) return setError('En serie kan vara högst ett år. Förläng den senare vid behov.');
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
    if (!window.confirm(many ? 'Ta bort detta och alla kommande tillfällen i serien?' : 'Ta bort jobbet?')) return;
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
      <h3>{job ? jobLabel(job) : 'Nytt jobb'}</h3>
      {prefill?.fromSubmission && !job && <p class="msg msg--ok">Uppgifterna kommer från bokningen. Kontrollera tid och personal innan du sparar.</p>}

      <div class="form-2">
        <div class="field">
          <label for="j-service">Tjänst</label>
          <select id="j-service" value={form.service} onChange={set('service')}>
            {Object.entries(SERVICE_LABELS).map(([k, v]) => <option value={k}>{v}</option>)}
          </select>
        </div>
        <div class="field">
          <label for="j-title">Rubrik (valfri)</label>
          <input id="j-title" type="text" maxLength={200} value={form.title} onInput={set('title')} />
        </div>
      </div>

      {prefill?.newCustomerName && !job ? (
        <p class="muted">Kund: <strong>{prefill.newCustomerName}</strong> (skapas eller kopplas från bokningen när du sparar)</p>
      ) : (
        <div class="field">
          <label for="j-customer">Kund</label>
          <input type="search" placeholder="Sök kund" aria-label="Sök kund" value={search} onInput={(e) => setSearch(e.currentTarget.value)} />
          <select id="j-customer" value={form.customer_id} onChange={(e) => pickCustomer(e.currentTarget.value)}>
            <option value="">Ingen kund vald</option>
            {shownCustomers.slice(0, 200).map((c) => <option value={c.id}>{c.name}{c.street ? `, ${c.street}` : ''}</option>)}
          </select>
        </div>
      )}

      <div class="form-3">
        <div class="field">
          <label for="j-date">Datum</label>
          <input id="j-date" type="date" required value={form.date} onInput={set('date')} />
        </div>
        <div class="field">
          <label for="j-start">Start</label>
          <input id="j-start" type="time" step="900" required value={form.start} onInput={set('start')} />
        </div>
        <div class="field">
          <label for="j-end">Slut</label>
          <input id="j-end" type="time" step="900" required value={form.end} onInput={set('end')} />
        </div>
      </div>

      <fieldset class="cp-fieldset">
        <legend>Personal</legend>
        <div class="cp-checks">
          {people.map((p) => (
            <label class="cp-check">
              <input type="checkbox" checked={form.staff.includes(p.id)} onChange={() => toggleStaff(p.id)} />
              <span class="dot" style={`background:${p.color}`} /> {p.full_name}
              {busyPeople[p.id] && <small class="cp-warn-text"> upptagen: {jobLabel(busyPeople[p.id])} {busyPeople[p.id].startTime}</small>}
            </label>
          ))}
        </div>
      </fieldset>

      <div class="field">
        <label for="j-street">{isMove ? 'Från adress' : 'Adress'}</label>
        <input id="j-street" type="text" maxLength={200} autocomplete="off" value={form.street} onInput={set('street')} />
      </div>
      <div class="form-2">
        <div class="field">
          <label for="j-zip">Postnummer</label>
          <input id="j-zip" type="text" inputmode="numeric" maxLength={10} value={form.postal_code} onInput={set('postal_code')} />
        </div>
        <div class="field">
          <label for="j-city">Ort</label>
          <input id="j-city" type="text" maxLength={100} value={form.city} onInput={set('city')} />
        </div>
      </div>
      {isMove && (
        <>
          <div class="field">
            <label for="j-tostreet">Till adress</label>
            <input id="j-tostreet" type="text" maxLength={200} autocomplete="off" value={form.to_street} onInput={set('to_street')} />
          </div>
          <div class="form-2">
            <div class="field">
              <label for="j-tozip">Postnummer</label>
              <input id="j-tozip" type="text" inputmode="numeric" maxLength={10} value={form.to_postal_code} onInput={set('to_postal_code')} />
            </div>
            <div class="field">
              <label for="j-tocity">Ort</label>
              <input id="j-tocity" type="text" maxLength={100} value={form.to_city} onInput={set('to_city')} />
            </div>
          </div>
        </>
      )}

      <div class="form-2">
        <div class="field">
          <label for="j-price">Pris till kunden (kr)</label>
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
        <label for="j-staffnote">Information till personalen</label>
        <textarea id="j-staffnote" maxLength={5000} rows={3} placeholder="Portkod, nyckel, parkering, vad som ska göras" value={form.staff_note} onInput={set('staff_note')} />
      </div>
      <div class="field">
        <label for="j-note">Intern anteckning (bara administratörer)</label>
        <textarea id="j-note" maxLength={5000} rows={2} value={form.internal_note} onInput={set('internal_note')} />
      </div>

      {!job && (
        <div class="form-2">
          <div class="field">
            <label for="j-repeat">Återkommande</label>
            <select id="j-repeat" value={form.repeat} onChange={set('repeat')}>
              {REPEAT.map(([k, v]) => <option value={k}>{v}</option>)}
            </select>
          </div>
          {form.repeat !== '0' && (
            <div class="field">
              <label for="j-until">Till och med</label>
              <input id="j-until" type="date" required value={form.until} min={form.date} onInput={set('until')} />
            </div>
          )}
        </div>
      )}

      {job?.series_id && (
        <fieldset class="cp-fieldset">
          <legend>Jobbet ingår i en serie. Ändringen gäller</legend>
          <label class="cp-check"><input type="radio" name="scope" checked={scope === 'one'} onChange={() => setScope('one')} /> Bara detta tillfälle</label>
          <label class="cp-check"><input type="radio" name="scope" checked={scope === 'following'} onChange={() => setScope('following')} /> Detta och alla kommande</label>
        </fieldset>
      )}

      <ErrorMsg error={error} />
      <div class="cp-actions">
        <button class="btn" type="submit" disabled={busy}>{busy ? 'Sparar …' : 'Spara'}</button>
        <button class="btn btn--ghost" type="button" onClick={onClose}>Avbryt</button>
        {job && <button class="btn btn--danger" type="button" disabled={busy} onClick={remove}>Ta bort</button>}
      </div>
    </form>
  );
}
