// Tider: rapporterade timmar per person och månad. Rätta, lägg till och exportera för lönen.
import { useEffect, useState } from 'preact/hooks';
import { supabase } from '../../lib/supabase.js';
import { today, addDays } from '../../lib/planner.js';
import { sumHours, formatHours, entryHours, parseHours } from '../../lib/worktime.js';
import { ErrorMsg, Modal } from '../ui.jsx';

const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtDay = (d) => dayFmt.format(new Date(`${d}T12:00:00Z`));

function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}
const decimal = (h) => (Math.round(h * 100) / 100).toFixed(2);
const jobName = (r) => (r.jobs ? r.jobs.customers?.name || r.jobs.title || r.jobs.service : '');

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
    const [e, p] = await Promise.all([
      sb
        .from('work_hours')
        .select('*, jobs(service, title, customers(name))')
        .gte('work_date', `${month}-01`)
        .lte('work_date', addDays(`${shiftMonth(month, 1)}-01`, -1))
        .order('work_date')
        .order('created_at'),
      sb.from('profiles').select('id, full_name, color, active').order('full_name'),
    ]);
    if (e.error) setError('Could not load the hours.');
    setRows(e.data ?? []);
    setPeople(p.data ?? []);
  }

  useEffect(() => {
    setRows(null);
    load();
  }, [month]);

  const nameOf = (id) => people.find((p) => p.id === id)?.full_name ?? '';
  const byPerson = people
    .map((p) => {
      const mine = (rows ?? []).filter((r) => r.profile_id === p.id);
      return { person: p, entries: mine, sums: sumHours(mine) };
    })
    .filter((x) => x.person.active || x.entries.length);
  const shown = byPerson.find((x) => x.person.id === selected);

  function exportCsv() {
    const clean = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Name', 'Date', 'Hours', 'Job', 'Reported by', 'Note', 'Corrected by admin'].join(';')];
    for (const { person, entries } of byPerson) {
      for (const r of entries) {
        lines.push(
          [
            clean(person.full_name),
            r.work_date,
            decimal(entryHours(r)),
            clean(jobName(r)),
            clean(r.reported_by && r.reported_by !== r.profile_id ? nameOf(r.reported_by) : ''),
            clean(r.note),
            r.edited_by ? 'yes' : '',
          ].join(';'),
        );
      }
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hours-${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div class="cp-head">
        <h2>Hours</h2>
        <div class="pl-nav">
          <button class="btn btn--ghost btn--sm" type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
          <strong class="pl-title" style="margin:0 6px">{monthFmt.format(new Date(`${month}-15T12:00:00Z`))}</strong>
          <button class="btn btn--ghost btn--sm" type="button" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
        </div>
      </div>
      <p class="muted">Staff report their own hours after each job and can report for the colleagues they worked with.</p>
      <ErrorMsg error={error} />
      <div class="cp-panel" style="margin-bottom:16px">
        {rows === null ? (
          <p class="muted">Loading …</p>
        ) : (
          <div class="cp-scroll">
            <table class="cp-table">
              <thead>
                <tr><th>Name</th><th>Hours</th><th>Entries</th><th><span class="visually-hidden">Show</span></th></tr>
              </thead>
              <tbody>
                {byPerson.map(({ person, entries, sums }) => (
                  <tr>
                    <td><span class="dot" style={`background:${person.color}`} /> <strong>{person.full_name}</strong></td>
                    <td>{formatHours(sums.total)}</td>
                    <td>{entries.length}</td>
                    <td>
                      <div class="cp-actions">
                        <button class="btn btn--ghost btn--sm" type="button" onClick={() => setSelected(selected === person.id ? '' : person.id)}>
                          {selected === person.id ? 'Hide' : 'Show and correct'}
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
          <button class="btn btn--sm" type="button" disabled={!rows?.length} onClick={exportCsv}>Export to Excel (CSV)</button>
          <button class="btn btn--ghost btn--sm" type="button" onClick={() => setEditing({ entry: null, profile_id: selected || people.find((p) => p.active)?.id })}>Add hours</button>
        </div>
      </div>

      {shown && (
        <section class="cp-panel">
          <h3 class="cp-subhead">{shown.person.full_name}: {formatHours(shown.sums.total)}</h3>
          {shown.entries.length === 0 && <p class="muted">No hours this month.</p>}
          <ul class="cp-list">
            {shown.entries.map((r) => (
              <li class="cp-row cp-row--static">
                <span class="cp-row-top">
                  <strong>{fmtDay(r.work_date)}</strong>
                  <span>{formatHours(entryHours(r))}</span>
                </span>
                <p>
                  {jobName(r) || 'No specific job'}
                  {r.reported_by && r.reported_by !== r.profile_id && ` · reported by ${nameOf(r.reported_by)}`}
                  {r.edited_by && ' · corrected by admin'}
                </p>
                {r.note && <small>{r.note}</small>}
                <span class="cp-actions">
                  <button class="btn btn--ghost btn--sm" type="button" onClick={() => setEditing({ entry: r, profile_id: r.profile_id })}>Correct</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal open={!!editing} label="Hours" onClose={() => setEditing(null)}>
        {editing && <EntryForm {...editing} me={me} people={people.filter((p) => p.active)} onDone={() => { setEditing(null); load(); }} />}
      </Modal>
    </>
  );
}

function EntryForm({ entry, profile_id, people, me, onDone }) {
  const sb = supabase();
  const [form, setForm] = useState({
    profile_id: entry?.profile_id ?? profile_id ?? '',
    date: entry?.work_date ?? today(),
    hours: entry ? String(Number(entry.hours)) : '',
    note: entry?.note ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.currentTarget.value });
  const hours = parseHours(form.hours);

  async function save(e) {
    e.preventDefault();
    setError('');
    if (hours === null) return setError('Write the hours as a number between 0.25 and 16, for example 7.5.');
    const values = {
      profile_id: form.profile_id,
      work_date: form.date,
      hours,
      note: form.note.trim() || null,
      edited_by: me.profile.id,
      updated_at: new Date().toISOString(),
      ...(entry ? {} : { reported_by: me.profile.id }),
    };
    setBusy(true);
    const { error: err } = entry ? await sb.from('work_hours').update(values).eq('id', entry.id) : await sb.from('work_hours').insert(values);
    setBusy(false);
    if (err) return setError('Could not save.');
    onDone();
  }

  async function remove() {
    if (!window.confirm('Remove these hours?')) return;
    const { error: err } = await sb.from('work_hours').delete().eq('id', entry.id);
    if (err) return setError('Could not remove.');
    onDone();
  }

  return (
    <form onSubmit={save}>
      <h3>{entry ? 'Correct hours' : 'Add hours'}</h3>
      {!entry && (
        <div class="field">
          <label for="te-person">Person</label>
          <select id="te-person" value={form.profile_id} onChange={set('profile_id')}>
            {people.map((p) => <option value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
      )}
      <div class="form-2">
        <div class="field">
          <label for="te-date">Date</label>
          <input id="te-date" type="date" required value={form.date} onInput={set('date')} />
        </div>
        <div class="field">
          <label for="te-hours">Hours</label>
          <input id="te-hours" type="text" inputMode="decimal" required value={form.hours} onInput={set('hours')} placeholder="For example 7.5" />
          <small class="hint">{form.hours && (hours === null ? 'Use a number like 7.5 or 7:30' : formatHours(hours))}</small>
        </div>
      </div>
      <p class="muted">The person sees the hours as "corrected by an admin" and can no longer change them.</p>
      <div class="field">
        <label for="te-note">Note</label>
        <input id="te-note" type="text" maxLength={500} value={form.note} onInput={set('note')} placeholder="For example: forgot to report" />
      </div>
      <ErrorMsg error={error} />
      <div class="cp-actions">
        <button class="btn" type="submit" disabled={busy}>Save</button>
        <button class="btn btn--ghost" type="button" onClick={onDone}>Cancel</button>
        {entry && <button class="btn btn--danger" type="button" onClick={remove}>Remove</button>}
      </div>
    </form>
  );
}
