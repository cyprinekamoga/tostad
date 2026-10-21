// Tider: stämplade timmar per person och månad. Rätta, lägg till och exportera för lönen.
import { useEffect, useState } from 'preact/hooks';
import { supabase } from '../../lib/supabase.js';
import { today, toInstant, zoned } from '../../lib/planner.js';
import { sumHours, formatHours, entryHours } from '../../lib/worktime.js';
import { ErrorMsg, Modal } from '../ui.jsx';

const monthFmt = new Intl.DateTimeFormat('sv-SE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayFmt = new Intl.DateTimeFormat('sv-SE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}
const decimal = (h) => (Math.round(h * 100) / 100).toFixed(2).replace('.', ',');

export default function TimeReport({ me }) {
  const sb = supabase();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [rows, setRows] = useState(null);
  const [people, setPeople] = useState([]);
  const [selected, setSelected] = useState('');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    const from = toInstant(`${month}-01`).toISOString();
    const to = toInstant(`${shiftMonth(month, 1)}-01`).toISOString();
    const [e, p] = await Promise.all([
      sb.from('time_entries').select('*, jobs(service, title, customers(name))').gte('started_at', from).lt('started_at', to).order('started_at'),
      sb.from('profiles').select('id, full_name, color, active').order('full_name'),
    ]);
    if (e.error) setError('Kunde inte hämta tiderna.');
    setRows(e.data ?? []);
    setPeople(p.data ?? []);
  }

  useEffect(() => {
    setRows(null);
    load();
  }, [month]);

  const byPerson = people
    .map((p) => {
      const mine = (rows ?? []).filter((r) => r.profile_id === p.id);
      return { person: p, entries: mine, sums: sumHours(mine) };
    })
    .filter((x) => x.person.active || x.entries.length);
  const shown = byPerson.find((x) => x.person.id === selected);

  function exportCsv() {
    const lines = [['Namn', 'Datum', 'Start', 'Slut', 'Timmar', 'Jobb', 'Anteckning', 'Ändrad av administratör'].join(';')];
    for (const { person, entries } of byPerson) {
      for (const r of entries) {
        const job = r.jobs ? r.jobs.customers?.name || r.jobs.title || r.jobs.service : '';
        const clean = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        lines.push(
          [
            clean(person.full_name),
            zoned(r.started_at).date,
            zoned(r.started_at).time,
            r.ended_at ? zoned(r.ended_at).time : '',
            r.ended_at ? decimal(entryHours(r)) : '',
            clean(job),
            clean(r.note),
            r.edited_by ? 'ja' : '',
          ].join(';'),
        );
      }
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tider-${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div class="cp-head">
        <h2>Tider</h2>
        <div class="pl-nav">
          <button class="btn btn--ghost btn--sm" type="button" aria-label="Föregående månad" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
          <strong class="pl-title" style="margin:0 6px">{monthFmt.format(new Date(`${month}-15T12:00:00Z`))}</strong>
          <button class="btn btn--ghost btn--sm" type="button" aria-label="Nästa månad" onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
        </div>
      </div>
      <ErrorMsg error={error} />
      <div class="cp-panel" style="margin-bottom:16px">
        {rows === null ? (
          <p class="muted">Laddar …</p>
        ) : (
          <div class="cp-scroll">
            <table class="cp-table">
              <thead>
                <tr><th>Namn</th><th>Timmar</th><th>Pass</th><th>Pågår</th><th><span class="visually-hidden">Visa</span></th></tr>
              </thead>
              <tbody>
                {byPerson.map(({ person, entries, sums }) => (
                  <tr>
                    <td><span class="dot" style={`background:${person.color}`} /> <strong>{person.full_name}</strong></td>
                    <td>{formatHours(sums.total)}</td>
                    <td>{entries.length}</td>
                    <td>{entries.some((e) => !e.ended_at) ? <span class="badge">Instämplad</span> : ''}</td>
                    <td>
                      <div class="cp-actions">
                        <button class="btn btn--ghost btn--sm" type="button" onClick={() => setSelected(selected === person.id ? '' : person.id)}>
                          {selected === person.id ? 'Dölj' : 'Visa och rätta'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div class="cp-actions" style="margin-top:12px">
          <button class="btn btn--sm" type="button" disabled={!rows?.length} onClick={exportCsv}>Exportera till Excel (CSV)</button>
          <button class="btn btn--ghost btn--sm" type="button" onClick={() => setEditing({ entry: null, profile_id: selected || people.find((p) => p.active)?.id })}>Lägg till tid</button>
        </div>
      </div>

      {shown && (
        <section class="cp-panel">
          <h3 class="cp-subhead">{shown.person.full_name}: {formatHours(shown.sums.total)}</h3>
          {shown.entries.length === 0 && <p class="muted">Inga stämplingar den här månaden.</p>}
          <ul class="cp-list">
            {shown.entries.map((r) => (
              <li class="cp-row cp-row--static">
                <span class="cp-row-top">
                  <strong>
                    {dayFmt.format(new Date(`${zoned(r.started_at).date}T12:00:00Z`))} · {zoned(r.started_at).time} till {r.ended_at ? zoned(r.ended_at).time : 'pågår'}
                  </strong>
                  <span>{formatHours(entryHours(r))}</span>
                </span>
                <p>
                  {r.jobs ? r.jobs.customers?.name || r.jobs.title || '' : 'Utan jobb'}
                  {r.start_lat != null && (
                    <>
                      {' · '}
                      <a href={`https://www.google.com/maps/search/?api=1&query=${r.start_lat},${r.start_lng}`} target="_blank" rel="noopener">plats vid instämpling</a>
                    </>
                  )}
                  {r.edited_by && ' · ändrad av administratör'}
                </p>
                {r.note && <small>{r.note}</small>}
                <span class="cp-actions">
                  <button class="btn btn--ghost btn--sm" type="button" onClick={() => setEditing({ entry: r, profile_id: r.profile_id })}>Rätta</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal open={!!editing} label="Tid" onClose={() => setEditing(null)}>
        {editing && <EntryForm {...editing} me={me} people={people.filter((p) => p.active)} onDone={() => { setEditing(null); load(); }} />}
      </Modal>
    </>
  );
}

function EntryForm({ entry, profile_id, people, me, onDone }) {
  const sb = supabase();
  const start = entry ? zoned(entry.started_at) : { date: today(), time: '08:00' };
  const end = entry?.ended_at ? zoned(entry.ended_at) : null;
  const [form, setForm] = useState({
    profile_id: entry?.profile_id ?? profile_id ?? '',
    date: start.date,
    start: start.time,
    end: end?.time ?? (entry ? '' : '16:00'),
    note: entry?.note ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.currentTarget.value });

  async function save(e) {
    e.preventDefault();
    setError('');
    const startsAt = toInstant(form.date, form.start);
    // Slutar efter midnatt: räknas till nästa dag.
    let endsAt = form.end ? toInstant(form.date, form.end) : null;
    if (endsAt && endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 864e5);
    if (endsAt && endsAt - startsAt > 16 * 3600000) return setError('Ett pass kan vara högst 16 timmar.');
    const values = {
      profile_id: form.profile_id,
      started_at: startsAt.toISOString(),
      ended_at: endsAt ? endsAt.toISOString() : null,
      note: form.note.trim() || null,
      edited_by: me.profile.id,
    };
    setBusy(true);
    const { error: err } = entry ? await sb.from('time_entries').update(values).eq('id', entry.id) : await sb.from('time_entries').insert(values);
    setBusy(false);
    if (err) return setError(/open_idx|duplicate/.test(err.message) ? 'Personen är redan instämplad. Ange en sluttid.' : 'Kunde inte spara.');
    onDone();
  }

  async function remove() {
    if (!window.confirm('Ta bort stämplingen?')) return;
    const { error: err } = await sb.from('time_entries').delete().eq('id', entry.id);
    if (err) return setError('Kunde inte ta bort.');
    onDone();
  }

  return (
    <form onSubmit={save}>
      <h3>{entry ? 'Rätta tid' : 'Lägg till tid'}</h3>
      {!entry && (
        <div class="field">
          <label for="te-person">Person</label>
          <select id="te-person" value={form.profile_id} onChange={set('profile_id')}>
            {people.map((p) => <option value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
      )}
      <div class="form-3">
        <div class="field">
          <label for="te-date">Datum</label>
          <input id="te-date" type="date" required value={form.date} onInput={set('date')} />
        </div>
        <div class="field">
          <label for="te-start">Start</label>
          <input id="te-start" type="time" required value={form.start} onInput={set('start')} />
        </div>
        <div class="field">
          <label for="te-end">Slut</label>
          <input id="te-end" type="time" value={form.end} onInput={set('end')} />
        </div>
      </div>
      <p class="muted">Lämna sluttiden tom om personen fortfarande jobbar. Ändringen syns för personen som "ändrad av administratör".</p>
      <div class="field">
        <label for="te-note">Anteckning</label>
        <input id="te-note" type="text" maxLength={500} value={form.note} onInput={set('note')} placeholder="Till exempel: glömde stämpla ut" />
      </div>
      <ErrorMsg error={error} />
      <div class="cp-actions">
        <button class="btn" type="submit" disabled={busy}>Spara</button>
        <button class="btn btn--ghost" type="button" onClick={onDone}>Avbryt</button>
        {entry && <button class="btn btn--danger" type="button" onClick={remove}>Ta bort</button>}
      </div>
    </form>
  );
}
