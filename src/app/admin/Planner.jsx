// Planering: vecka med en rad per person, dag med tidslinje och månad. Dra jobb mellan personer,
// dagar och klockslag. Varnar för dubbelbokning, kort dygnsvila och kort veckovila.
import { useEffect, useMemo, useState } from 'preact/hooks';

// Sant på mobil, där planeringen visas som en lista i stället för ett schema.
function usePhone() {
  const query = '(max-width: 760px)';
  const [phone, setPhone] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}
import { supabase, formatDateTime } from '../../lib/supabase.js';
import { today, addDays, startOfWeek, daysBetween, weekNumber, weekday, warningsFor, DAILY_REST_H, WEEKLY_REST_H } from '../../lib/planner.js';
import { loadJobs, loadJob, moveJob, jobLabel, jobAddress, startFromWish, locateJobs, SERVICE_LABELS, SERVICE_COLORS, serviceColor } from './jobs.js';
import { ensureCustomer } from './submission.js';
import { Modal, ErrorMsg } from '../ui.jsx';
import JobForm from './JobForm.jsx';

const VIEWS = [
  ['vecka', 'Vecka'],
  ['dag', 'Dag'],
  ['manad', 'Månad'],
];
const DAY_NAMES = ['mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön'];
const DAY_START = 6 * 60;
const DAY_END = 22 * 60;
const UNASSIGNED = { id: '', full_name: 'Ej bemannade', color: '#9aa5a0' };

const longDate = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDate = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthName = new Intl.DateTimeFormat('sv-SE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmt = (f, date) => f.format(new Date(`${date}T12:00:00Z`));

function lastOfMonth(date) {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function shiftMonth(date, n) {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
}

function rangeFor(view, date) {
  if (view === 'dag') return { from: date, to: date };
  if (view === 'vecka') return { from: startOfWeek(date), to: addDays(startOfWeek(date), 6) };
  const first = `${date.slice(0, 7)}-01`;
  return { from: startOfWeek(first), to: addDays(startOfWeek(lastOfMonth(first)), 6) };
}

function title(view, date, from, to) {
  if (view === 'dag') return fmt(longDate, date);
  if (view === 'manad') return fmt(monthName, date);
  return `Vecka ${weekNumber(from)} · ${fmt(shortDate, from)} till ${fmt(shortDate, to)}`;
}

const minutesOf = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const timeOf = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const hoursText = (h) => `${Math.round(h * 10) / 10}`.replace('.', ',');

export default function Planner() {
  const sb = supabase();
  const params = new URLSearchParams(window.location.search);
  const [view, setView] = useState(VIEWS.some(([k]) => k === params.get('vy')) ? params.get('vy') : 'vecka');
  const [date, setDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(params.get('datum') ?? '') ? params.get('datum') : today());
  const [jobs, setJobs] = useState(null);
  const [people, setPeople] = useState([]);
  const [ready, setReady] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [over, setOver] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const { from, to } = rangeFor(view, date);
  const days = daysBetween(from, to);
  const now = today();

  async function reload() {
    try {
      // Hela veckor hämtas så att vilan kan räknas även i dagsvyn.
      setJobs(await loadJobs(addDays(startOfWeek(from), -1), addDays(startOfWeek(to), 7)));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    reload();
    const url = new URL(window.location.href);
    url.searchParams.set('vy', view);
    url.searchParams.set('datum', date);
    url.searchParams.delete('jobb');
    url.searchParams.delete('fran');
    window.history.replaceState(null, '', url);
  }, [view, from, to]);

  useEffect(() => {
    (async () => {
      const [{ data: staff }, { data: cust }] = await Promise.all([
        sb.from('profiles').select('id, full_name, color, role').eq('active', true).order('full_name'),
        sb.from('customers').select('id, name, phone, email, street, postal_code, city').order('name').limit(2000),
      ]);
      setPeople(staff ?? []);
      setCustomers(cust ?? []);
      setReady(true);
      if (params.get('jobb')) openJob(params.get('jobb'));
      if (params.get('fran')) fromSubmission(params.get('fran'));
    })();
  }, []);

  async function openJob(id) {
    const job = await loadJob(id);
    if (!job) return setError('Hittar inte jobbet.');
    setDate(job.date);
    setEditing({ job });
  }

  // Ny bokning från inkorgen: fyll i formuläret med det kunden skrev.
  async function fromSubmission(id) {
    const { data: item } = await sb.from('submissions').select('id, kind, name, email, phone, data, customer_id, created_at').eq('id', id).maybeSingle();
    if (!item) return setError('Hittar inte bokningen.');
    const { data: existing } = await sb.from('jobs').select('id').eq('submission_id', id).maybeSingle();
    if (existing) return openJob(existing.id);
    const d = item.data ?? {};
    const wanted = /^\d{4}-\d{2}-\d{2}$/.test(d.datum ?? '') && d.datum >= now ? d.datum : now;
    const zip = (d.postnummer ?? '').replace(/\D/g, '');
    setDate(wanted);
    setEditing({
      submission: item,
      prefill: {
        fromSubmission: true,
        submission_id: item.id,
        customer_id: item.customer_id ?? '',
        newCustomerName: item.customer_id ? '' : item.name || 'Utan namn',
        service: SERVICE_LABELS[d.tjanst] ? d.tjanst : 'annat',
        date: wanted,
        start: startFromWish(d.tid),
        street: d.adress ?? '',
        postal_code: zip.length === 5 ? `${zip.slice(0, 3)} ${zip.slice(3)}` : d.postnummer ?? '',
        to_street: d.nyAdress ?? '',
        price: /^\d+$/.test(d.pris ?? '') ? d.pris : '',
        staff_note: [d.vaningOchHiss && `Våning och hiss: ${d.vaningOchHiss}`, d.ovrigt].filter(Boolean).join('\n'),
        internal_note: `Från bokning ${formatDateTime(item.created_at)}${d.flexibel ? ', kunden är flexibel ± 2 dagar' : ''}`,
      },
    });
  }

  async function saved(ids) {
    const submission = editing?.submission;
    setEditing(null);
    if (submission && ids.length) {
      await sb.from('submissions').update({ status: 'hanterad' }).eq('id', submission.id);
      setInfo('Jobbet är skapat och bokningen är markerad som hanterad.');
    }
    await reload();
    // Kartpositionen hämtas i bakgrunden.
    if (ids.length) {
      const fresh = await loadJobs(addDays(startOfWeek(from), -1), addDays(startOfWeek(to), 7)).catch(() => []);
      locateJobs(fresh.filter((j) => ids.includes(j.id)));
    }
  }

  function step(n) {
    if (view === 'dag') setDate(addDays(date, n));
    else if (view === 'vecka') setDate(addDays(date, 7 * n));
    else setDate(shiftMonth(date, n));
  }

  const active = (jobs ?? []).filter((j) => j.status !== 'avbokad');

  const warnings = useMemo(() => {
    const list = [];
    const cells = new Set();
    for (const p of people) {
      const mine = active.filter((j) => j.staff.includes(p.id)).map((j) => ({ id: j.id, start: j.start, end: j.end, date: j.date }));
      for (const w of warningsFor(mine, days)) {
        list.push({ ...w, person: p });
        if (w.kind === 'dubbel') for (const id of w.jobs) cells.add(`${p.id}|${mine.find((j) => j.id === id)?.date}`);
        if (w.kind === 'dygnsvila') cells.add(`${p.id}|${w.date}`);
      }
    }
    return { list, cells };
  }, [jobs, people, from, to]);

  // Dra och släpp
  function dragStart(e, job, person, grabMinutes = 0) {
    e.dataTransfer.setData('text/plain', JSON.stringify({ id: job.id, from: person, grab: grabMinutes }));
    e.dataTransfer.effectAllowed = 'move';
  }

  function dragOver(e, key) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (over !== key) setOver(key);
  }

  async function drop(e, target) {
    e.preventDefault();
    setOver('');
    let payload;
    try {
      payload = JSON.parse(e.dataTransfer.getData('text/plain'));
    } catch {
      return;
    }
    const job = jobs.find((j) => j.id === payload.id);
    if (!job) return;
    let startTime = job.startTime;
    if (target.lane) {
      const rect = e.currentTarget.getBoundingClientRect();
      const span = DAY_END - DAY_START;
      const raw = DAY_START + ((e.clientX - rect.left) / rect.width) * span - payload.grab;
      const length = Math.round((job.end - job.start) / 60000);
      const snapped = Math.max(0, Math.min(24 * 60 - length, Math.round(raw / 15) * 15));
      startTime = timeOf(snapped);
    }
    const sameTime = target.date === job.date && startTime === job.startTime;
    if (sameTime && (target.person === undefined || target.person === payload.from)) return;
    if (target.person && target.person !== payload.from && job.staff.includes(target.person) && sameTime) return;
    setError('');
    try {
      await moveJob(job, { date: target.date, startTime, from: target.person === undefined ? undefined : payload.from, to: target.person });
    } catch (err) {
      setError(err.message);
    }
    reload();
  }

  const newJob = (prefill) => setEditing({ prefill: { date, ...prefill } });
  const rows = [UNASSIGNED, ...people];
  const jobsFor = (personId, day) => (jobs ?? []).filter((j) => j.date === day && (personId ? j.staff.includes(personId) : j.staff.length === 0));
  const colorOf = (id) => people.find((p) => p.id === id)?.color ?? UNASSIGNED.color;
  const nameOf = (id) => people.find((p) => p.id === id)?.full_name ?? '';
  const phone = usePhone();

  const hoursIn = (personId) =>
    active.filter((j) => j.staff.includes(personId) && j.date >= from && j.date <= to).reduce((sum, j) => sum + (j.end - j.start) / 3600000, 0);

  // Anropas som funktion, inte som komponent, så att kortet inte byts ut medan det dras.
  function card(job, person, grabFrom) {
    const warn = warnings.list.some((w) => w.kind === 'dubbel' && w.person.id === person && w.jobs.includes(job.id));
    return (
      <div
        class={`pl-job${job.status === 'avbokad' ? ' is-cancelled' : ''}${job.status === 'klar' ? ' is-done' : ''}${warn ? ' is-warn' : ''}`}
        style={`--c:${serviceColor(job.service)}`}
        role="button"
        tabIndex={0}
        draggable
        onDragStart={(e) => dragStart(e, job, person, grabFrom ? grabFrom(e) : 0)}
        onClick={() => setEditing({ job })}
        onKeyDown={(e) => e.key === 'Enter' && setEditing({ job })}
        title={`${job.startTime} till ${job.endTime} ${jobLabel(job)}`}
      >
        <strong>{job.startTime} till {job.endTime}</strong>
        <span>{jobLabel(job)}</span>
        <small>
          {SERVICE_LABELS[job.service]}
          {job.staff.length > 1 && <span class="pl-dots">{job.staff.map((id) => <i style={`background:${colorOf(id)}`} title={nameOf(id)} />)}</span>}
          {job.series_id && ' · återkommande'}
          {job.status !== 'planerad' && ` · ${job.status === 'klar' ? 'klar' : 'avbokad'}`}
        </small>
      </div>
    );
  }

  return (
    <>
      <div class="cp-head">
        <h2>Planering</h2>
        <button class="btn btn--sm" type="button" onClick={() => newJob({})}>Nytt jobb</button>
      </div>
      <div class="pl-toolbar">
        <div class="cp-tabs" role="group" aria-label="Vy">
          {VIEWS.map(([key, label]) => (
            <button type="button" aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>
          ))}
        </div>
        <div class="pl-nav">
          <button class="btn btn--ghost btn--sm" type="button" onClick={() => step(-1)} aria-label="Föregående">‹</button>
          <button class="btn btn--ghost btn--sm" type="button" onClick={() => setDate(now)}>Idag</button>
          <button class="btn btn--ghost btn--sm" type="button" onClick={() => step(1)} aria-label="Nästa">›</button>
          <input type="date" aria-label="Gå till datum" value={date} onInput={(e) => e.currentTarget.value && setDate(e.currentTarget.value)} />
        </div>
        <strong class="pl-title">{title(view, date, from, to)}</strong>
      </div>
      <ul class="pl-legend-list" aria-label="Färger per tjänst">
        {Object.entries(SERVICE_COLORS).map(([k, c]) => (
          <li><i style={`background:${c}`} />{SERVICE_LABELS[k]}</li>
        ))}
      </ul>
      <ErrorMsg error={error} />
      {info && <p class="msg msg--ok">{info}</p>}

      {jobs === null || !ready ? (
        <p class="muted">Laddar …</p>
      ) : phone && view !== 'manad' ? (
        <Agenda
          days={view === 'vecka' ? days : [date]}
          week={daysBetween(startOfWeek(date), addDays(startOfWeek(date), 6))}
          selected={date}
          now={now}
          jobs={jobs}
          warnings={warnings.list}
          colorOf={colorOf}
          nameOf={nameOf}
          onPick={(d) => { setDate(d); setView('dag'); }}
          onOpen={(job) => setEditing({ job })}
          onNew={(d) => newJob({ date: d })}
        />
      ) : view === 'vecka' ? (
        <div class="pl-scroll">
          <div class="pl-week">
            <div class="pl-corner" />
            {days.map((d) => (
              <button type="button" class={`pl-dayhead${d === now ? ' is-today' : ''}`} onClick={() => { setDate(d); setView('dag'); }}>
                {DAY_NAMES[weekday(d)]} {Number(d.slice(8))}/{Number(d.slice(5, 7))}
              </button>
            ))}
            {rows.map((p) => (
              <>
                <div class="pl-person">
                  <span class="dot" style={`background:${p.color}`} />
                  <span>
                    {p.full_name}
                    {p.id && <small>{hoursText(hoursIn(p.id))} h</small>}
                  </span>
                </div>
                {days.map((d) => {
                  const key = `${p.id}|${d}`;
                  return (
                    <div
                      class={`pl-cell${over === key ? ' is-over' : ''}${warnings.cells.has(key) ? ' is-warn' : ''}${d === now ? ' is-today' : ''}`}
                      onDragOver={(e) => dragOver(e, key)}
                      onDragLeave={() => over === key && setOver('')}
                      onDrop={(e) => drop(e, { date: d, person: p.id })}
                    >
                      {jobsFor(p.id, d).map((j) => card(j, p.id))}
                      <button class="pl-add" type="button" aria-label={`Nytt jobb ${d}${p.id ? ` för ${p.full_name}` : ''}`} onClick={() => newJob({ date: d, staff: p.id ? [p.id] : [] })}>+</button>
                    </div>
                  );
                })}
              </>
            ))}
          </div>
        </div>
      ) : view === 'dag' ? (
        <DayView
          rows={rows}
          date={date}
          jobsFor={jobsFor}
          over={over}
          warnCells={warnings.cells}
          onDragOver={dragOver}
          onDragLeave={(key) => over === key && setOver('')}
          onDrop={drop}
          onNew={newJob}
          card={card}
        />
      ) : (
        <div class="pl-month">
          {DAY_NAMES.map((n) => <div class="pl-monthhead">{n}</div>)}
          {days.map((d) => {
            const list = (jobs ?? []).filter((j) => j.date === d);
            const key = `m|${d}`;
            const outside = d.slice(0, 7) !== date.slice(0, 7);
            return (
              <div
                class={`pl-mday${outside ? ' is-outside' : ''}${d === now ? ' is-today' : ''}${over === key ? ' is-over' : ''}`}
                onDragOver={(e) => dragOver(e, key)}
                onDragLeave={() => over === key && setOver('')}
                onDrop={(e) => drop(e, { date: d })}
              >
                <button type="button" class="pl-mdate" onClick={() => { setDate(d); setView('dag'); }}>{Number(d.slice(8))}</button>
                {list.slice(0, 4).map((j) => (
                  <div
                    class={`pl-chip${j.status === 'avbokad' ? ' is-cancelled' : ''}`}
                    style={`--c:${serviceColor(j.service)}`}
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={(e) => dragStart(e, j)}
                    onClick={() => setEditing({ job: j })}
                    onKeyDown={(e) => e.key === 'Enter' && setEditing({ job: j })}
                  >
                    {j.startTime} {jobLabel(j)}
                  </div>
                ))}
                {list.length > 4 && <button type="button" class="pl-more" onClick={() => { setDate(d); setView('dag'); }}>+{list.length - 4} till</button>}
              </div>
            );
          })}
        </div>
      )}

      {phone && <button class="pl-fab" type="button" aria-label="Nytt jobb" onClick={() => newJob({})}>+</button>}
      <section class="cp-panel pl-warnings" aria-label="Varningar">
        <h3>Varningar</h3>
        {warnings.list.length === 0 ? (
          <p class="muted">Inga dubbelbokningar och vilan räcker för alla under perioden.</p>
        ) : (
          <ul>
            {warnings.list.map((w) => (
              <li>
                <span class="dot" style={`background:${w.person.color}`} /> <strong>{w.person.full_name}:</strong>{' '}
                {w.kind === 'dubbel' &&
                  `dubbelbokad ${fmt(shortDate, jobs.find((j) => j.id === w.jobs[0])?.date ?? from)} (${w.jobs.map((id) => jobLabel(jobs.find((j) => j.id === id) ?? {})).join(' och ')})`}
                {w.kind === 'dygnsvila' && `mindre än ${DAILY_REST_H} timmars dygnsvila ${fmt(shortDate, w.date)} (bara ${hoursText(w.restHours)} h)`}
                {w.kind === 'veckovila' && `mindre än ${WEEKLY_REST_H} timmars sammanhängande ledighet vecka ${weekNumber(w.date)} (längsta ${hoursText(w.restHours)} h)`}
              </li>
            ))}
          </ul>
        )}
        <p class="muted pl-legend">
          {phone ? 'Tryck på ett jobb för att ändra tid, dag eller personal.' : 'Dra ett jobb till en annan person, dag eller tid. Klicka på ett jobb för att ändra det.'}
        </p>
      </section>

      <Modal open={!!editing} label="Jobb" onClose={() => setEditing(null)}>
        {editing && (
          <JobForm
            key={editing.job?.id ?? 'ny'}
            job={editing.job}
            prefill={editing.prefill}
            people={people}
            customers={customers}
            jobs={jobs ?? []}
            onClose={() => setEditing(null)}
            onSaved={saved}
            beforeCreate={
              editing.submission && !editing.submission.customer_id
                ? async () => ({ customer_id: (await ensureCustomer(sb, editing.submission)).id })
                : undefined
            }
          />
        )}
      </Modal>
    </>
  );
}

function DayView({ rows, date, jobsFor, over, warnCells, onDragOver, onDragLeave, onDrop, onNew, card }) {
  const span = DAY_END - DAY_START;
  const hours = [];
  for (let m = DAY_START; m <= DAY_END; m += 120) hours.push(m);
  // Var i jobbet man tog tag, i minuter, så att jobbet hamnar där man släpper det.
  const grabFrom = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const width = e.currentTarget.closest('.pl-lane').getBoundingClientRect().width;
    return ((e.clientX - box.left) / width) * span;
  };
  return (
    <div class="pl-scroll">
      <div class="pl-day">
        <div class="pl-corner" />
        <div class="pl-hours">
          {hours.map((m) => <span style={`left:${((m - DAY_START) / span) * 100}%`}>{timeOf(m)}</span>)}
        </div>
        {rows.map((p) => {
          const key = `${p.id}|${date}`;
          const list = jobsFor(p.id, date);
          // Jobb som överlappar läggs på egna rader i stället för ovanpå varandra.
          const tracks = [];
          const trackOf = new Map();
          for (const j of [...list].sort((a, b) => a.start - b.start)) {
            let t = tracks.findIndex((end) => end <= j.start);
            if (t === -1) t = tracks.push(0) - 1;
            tracks[t] = j.end;
            trackOf.set(j.id, t);
          }
          const rowsIn = Math.max(1, tracks.length);
          return (
            <>
              <div class="pl-person">
                <span class="dot" style={`background:${p.color}`} />
                <span>{p.full_name}</span>
              </div>
              <div
                class={`pl-lane${over === key ? ' is-over' : ''}${warnCells.has(key) ? ' is-warn' : ''}`}
                style={`min-height:${rowsIn * 64 + 6}px`}
                onDragOver={(e) => onDragOver(e, key)}
                onDragLeave={() => onDragLeave(key)}
                onDrop={(e) => onDrop(e, { date, person: p.id, lane: true })}
                onDblClick={(e) => {
                  if (e.target !== e.currentTarget) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const m = Math.round((DAY_START + ((e.clientX - rect.left) / rect.width) * span) / 30) * 30;
                  onNew({ date, start: timeOf(m), staff: p.id ? [p.id] : [] });
                }}
              >
                {hours.map((m) => <i class="pl-grid" style={`left:${((m - DAY_START) / span) * 100}%`} />)}
                {list.map((j) => {
                  const start = Math.max(DAY_START, minutesOf(j.startTime));
                  const end = Math.min(DAY_END, j.endTime <= j.startTime ? DAY_END : minutesOf(j.endTime));
                  const left = ((start - DAY_START) / span) * 100;
                  const width = Math.max(3, ((end - start) / span) * 100);
                  return (
                    <div class="pl-block" style={`left:${left}%;width:${width}%;top:calc(3px + ${trackOf.get(j.id)} * (100% - 6px) / ${rowsIn});height:calc((100% - 6px) / ${rowsIn})`}>
                      {card(j, p.id, grabFrom)}
                    </div>
                  );
                })}
              </div>
            </>
          );
        })}
      </div>
      <p class="muted pl-legend">Dubbelklicka på en tom plats för att lägga till ett jobb där. Tiden visas 06 till 22.</p>
    </div>
  );
}

// Mobil: en rad med veckans dagar och jobben som kort i tidsordning.
function Agenda({ days, week, selected, now, jobs, warnings, colorOf, nameOf, onPick, onOpen, onNew }) {
  const dayLabel = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return (
    <div class="pl-agenda">
      <div class="pl-strip" role="group" aria-label="Välj dag">
        {week.map((d) => {
          const count = jobs.filter((j) => j.date === d && j.status !== 'avbokad').length;
          return (
            <button type="button" class={`${d === selected && days.length === 1 ? 'is-selected' : ''}${d === now ? ' is-today' : ''}`} onClick={() => onPick(d)}>
              <small>{DAY_NAMES[weekday(d)]}</small>
              <strong>{Number(d.slice(8))}</strong>
              <span class="pl-count">{count > 0 ? count : ''}</span>
            </button>
          );
        })}
      </div>
      {days.map((d) => {
        const list = jobs.filter((j) => j.date === d).sort((a, b) => a.start - b.start);
        return (
          <section class="pl-aday">
            <h3>{fmt(dayLabel, d)}{d === now && <span class="badge">Idag</span>}</h3>
            {list.length === 0 && (
              <button type="button" class="pl-aempty" onClick={() => onNew(d)}>Inga jobb · lägg till</button>
            )}
            {list.map((j) => {
              const warn = warnings.filter((w) => (w.kind === 'dubbel' && w.jobs.includes(j.id)) || (w.kind === 'dygnsvila' && w.date === d && j.staff.includes(w.person.id)));
              const hours = (j.end - j.start) / 3600000;
              return (
                <button type="button" class={`pl-acard${j.status === 'avbokad' ? ' is-cancelled' : ''}${j.status === 'klar' ? ' is-done' : ''}`} style={`--c:${serviceColor(j.service)}`} onClick={() => onOpen(j)}>
                  <span class="pl-atime">
                    <strong>{j.startTime}</strong>
                    <small>{j.endTime}</small>
                    <small>{hoursText(hours)} h</small>
                  </span>
                  <span class="pl-abody">
                    <span class="pl-atag">{SERVICE_LABELS[j.service]}{j.series_id ? ' · återkommande' : ''}{j.status !== 'planerad' ? ` · ${j.status === 'klar' ? 'klar' : 'avbokad'}` : ''}</span>
                    <strong>{jobLabel(j)}</strong>
                    {jobAddress(j) && <small class="pl-aaddr">{jobAddress(j)}{j.to_street ? ` → ${jobAddress(j, true)}` : ''}</small>}
                    <span class="pl-astaff">
                      {j.staff.length === 0 ? (
                        <span class="badge badge--ny">Ingen personal</span>
                      ) : (
                        j.staff.map((id) => (
                          <span class="pl-person-chip"><i style={`background:${colorOf(id)}`} />{nameOf(id).split(' ')[0]}</span>
                        ))
                      )}
                    </span>
                    {warn.length > 0 && (
                      <small class="cp-warn-text">
                        {[...new Set(warn.map((w) => `${w.person.full_name.split(' ')[0]}: ${w.kind === 'dubbel' ? 'dubbelbokad' : 'kort dygnsvila'}`))].join(', ')}
                      </small>
                    )}
                  </span>
                </button>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
