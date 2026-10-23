// Ett jobb: adress, kund, kollegor, information, checklista, foton, timmar och klart.
import { useEffect, useRef, useState } from 'preact/hooks';
import { ErrorMsg } from '../ui.jsx';
import { SERVICE_LABELS, serviceColor } from '../admin/jobs.js';
import { checklistFor, formatHours, entryHours } from '../../lib/worktime.js';
import { addDays } from '../../lib/planner.js';
import { formatDateTime } from '../../lib/supabase.js';
import { myJob, myHours, jobAction, photos as loadPhotos, uploadPhoto, deletePhoto, offerSwap, cancelSwap, mapsLink, telLink } from './api.js';
import { HoursForm, savedText, jobPlace, jobTitle, dayName } from './parts.jsx';

const KINDS = { fore: 'Before', efter: 'After', skada: 'Damage' };

export default function JobPage({ me }) {
  const id = new URLSearchParams(window.location.search).get('id');
  const [job, setJob] = useState(undefined);
  const [entry, setEntry] = useState(undefined);
  const [editHours, setEditHours] = useState(false);
  const [pics, setPics] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  // Bockar sparas i tur och ordning, alltid med den senaste listan, så att snabba tryck inte skriver över varandra.
  const latest = useRef(null);
  const saving = useRef(Promise.resolve());

  async function load() {
    try {
      const j = await myJob(id);
      setJob(j);
      if (j) {
        const [rows, pictures] = await Promise.all([myHours(addDays(j.date, -31), addDays(j.date, 31)), loadPhotos(j.id)]);
        setEntry(rows.find((r) => r.job_id === j.id) ?? null);
        setPics(pictures);
      }
    } catch (e) {
      setError(e.message);
      setJob(null);
    }
  }

  useEffect(() => {
    if (id) load();
    else setJob(null);
  }, []);

  // Länken "Report hours" från Idag går direkt till timmarna.
  useEffect(() => {
    if (job && entry !== undefined && window.location.hash === '#hours') document.getElementById('hours')?.scrollIntoView();
  }, [job?.id, entry === undefined]);

  async function run(key, fn, done) {
    setBusy(key);
    setError('');
    setInfo('');
    try {
      await fn();
      await load();
      if (done) setInfo(done);
    } catch (e) {
      setError(e.message);
    }
    setBusy('');
  }

  if (job === undefined) return <p class="muted" aria-busy="true">Loading …</p>;
  if (job === null)
    return (
      <div class="st-page">
        <p class="st-empty">This job does not exist or you are no longer booked on it.</p>
        <a class="btn btn--ghost btn--block" href="/app/schema">Go to the schedule</a>
      </div>
    );

  const list = checklistFor(job);
  const doneCount = list.filter((i) => i.done).length;
  const place = jobPlace(job);
  const toPlace = jobPlace(job, true);
  const planned = job.status === 'planerad';
  const future = job.start > Date.now();
  const others = job.team.filter((p) => p.id !== me.profile.id);

  function toggle(index) {
    const current = latest.current ?? list;
    const next = current.map((item, i) => (i === index ? { ...item, done: !item.done } : item));
    latest.current = next;
    setJob((j) => ({ ...j, checklist: next }));
    saving.current = saving.current.then(() =>
      jobAction(job.id, 'checklist', latest.current).catch((e) => {
        setError(e.message);
        latest.current = null;
        load();
      }),
    );
  }

  async function addPhotos(e, kind) {
    const files = [...e.currentTarget.files];
    e.currentTarget.value = '';
    if (!files.length) return;
    run('foto', async () => {
      for (const f of files) await uploadPhoto(job.id, f, kind, me.profile.id);
    }, files.length === 1 ? 'The photo is saved.' : `${files.length} photos are saved.`);
  }

  return (
    <div class="st-page">
      <a class="st-back" href="/app/schema">‹ Schedule</a>
      <header class="st-jobhead" style={`--c:${serviceColor(job.service)}`}>
        <span class="st-tag">{SERVICE_LABELS[job.service]}</span>
        <h2>{jobTitle(job)}</h2>
        <p>
          {dayName(job.date)} · <strong>{job.startTime} to {job.endTime}</strong>
        </p>
        {job.status === 'avbokad' && <p class="msg msg--error">This job is cancelled.</p>}
        {job.status === 'klar' && <p class="msg msg--ok">Done {job.done_at ? formatDateTime(job.done_at) : ''}</p>}
      </header>
      <ErrorMsg error={error} />
      {info && <p class="msg msg--ok">{info}</p>}

      <section class="st-card">
        <h3>Address</h3>
        {place ? (
          <p>
            <strong>{place}</strong>
            {toPlace && (
              <>
                <br />To: <strong>{toPlace}</strong>
              </>
            )}
          </p>
        ) : (
          <p class="muted">{job.city ? `${job.city}. The full address is shown one week before the job.` : 'No address given.'}</p>
        )}
        <div class="st-actions">
          {place && <a class="btn btn--sm" href={mapsLink(place)} target="_blank" rel="noopener">Directions</a>}
          {toPlace && <a class="btn btn--ghost btn--sm" href={mapsLink(toPlace)} target="_blank" rel="noopener">Directions to the new address</a>}
          {job.customer_phone && <a class="btn btn--ghost btn--sm" href={telLink(job.customer_phone)}>Call the customer</a>}
        </div>
        {planned && !job.on_way_at && future && (
          <button class="btn btn--ghost btn--block" type="button" disabled={!!busy} onClick={() => run('vag', () => jobAction(job.id, 'on_way'), 'Marked that you are on your way.')}>
            We are on our way
          </button>
        )}
        {job.on_way_at && <p class="muted">On the way since {formatDateTime(job.on_way_at)}</p>}
      </section>

      {job.staff_note && (
        <section class="st-card st-note">
          <h3>Information</h3>
          <p style="white-space:pre-wrap">{job.staff_note}</p>
        </section>
      )}

      {others.length > 0 && (
        <section class="st-card">
          <h3>You work with</h3>
          <ul class="st-people">
            {others.map((p) => (
              <li>
                <span class="pl-person-chip"><i style={`background:${p.color}`} />{p.name}</span>
                {p.phone && <a href={telLink(p.phone)}>Call</a>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {job.status !== 'avbokad' && entry !== undefined && (
        future ? (
          <section class="st-card" id="hours">
            <h3>Your hours</h3>
            <p class="muted">You can report your hours once the job has started.</p>
          </section>
        ) : entry && !editHours ? (
          <section class="st-card" id="hours">
            <h3>Your hours</h3>
            <p>
              <strong>{formatHours(entryHours(entry))}</strong> on {dayName(entry.work_date)}
              {entry.reported_by !== me.profile.id && entry.reporter_name && <><br /><small class="muted">Reported by {entry.reporter_name}</small></>}
            </p>
            {entry.team.length > 0 && <p class="muted">With {entry.team.map((p) => `${p.name} (${formatHours(Number(p.hours))})`).join(', ')}</p>}
            {entry.note && <p class="muted">{entry.note}</p>}
            {entry.edited ? (
              <p class="st-fine">An admin has corrected these hours. Ask them if something is wrong.</p>
            ) : (
              <button class="btn btn--ghost btn--sm" type="button" onClick={() => { setInfo(''); setEditHours(true); }}>Change</button>
            )}
          </section>
        ) : (
          <HoursForm
            me={me}
            job={job}
            existing={entry}
            onCancel={entry ? () => setEditHours(false) : null}
            onSaved={async (result) => {
              setEditHours(false);
              await load();
              setInfo(savedText(result));
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )
      )}

      <section class="st-card">
        <h3>Checklist <small class="muted">{doneCount} of {list.length}</small></h3>
        <ul class="st-checklist">
          {list.map((item, i) => (
            <li>
              <label>
                <input type="checkbox" checked={item.done} disabled={job.status === 'avbokad'} onChange={() => toggle(i)} />
                <span>{item.label}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section class="st-card">
        <h3>Photos</h3>
        <p class="muted">Take photos before and after. They are saved on the job and the customer gets them in their photo report.</p>
        <div class="st-actions">
          {['fore', 'efter', 'skada'].map((kind) => (
            <label class={`btn btn--sm ${kind === 'skada' ? 'btn--ghost' : ''}`}>
              {kind === 'skada' ? 'Photo of damage' : `Photo ${KINDS[kind].toLowerCase()}`}
              <input type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => addPhotos(e, kind)} />
            </label>
          ))}
        </div>
        {busy === 'foto' && <p class="muted">Uploading …</p>}
        {pics.length > 0 && (
          <div class="st-photos">
            {pics.map((p) => (
              <figure>
                <a href={p.url} target="_blank" rel="noopener"><img src={p.url} alt={`Photo ${KINDS[p.kind].toLowerCase()}`} loading="lazy" /></a>
                <figcaption>
                  {KINDS[p.kind]}
                  {p.taken_by === me.profile.id && Date.now() - Date.parse(p.created_at) < 864e5 && (
                    <button type="button" aria-label="Remove the photo" onClick={() => window.confirm('Remove the photo?') && run('del', () => deletePhoto(p))}>Remove</button>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      {planned && (
        <button
          class="btn btn--block st-big"
          type="button"
          disabled={!!busy}
          onClick={() => {
            if (doneCount < list.length && !window.confirm(`${list.length - doneCount} items on the checklist are not ticked. Mark the job as done anyway?`)) return;
            run('klar', () => jobAction(job.id, 'done'), 'Great work! The job is marked as done.');
          }}
        >
          Mark the job as done
        </button>
      )}
      {job.status === 'klar' && (
        <button class="btn btn--ghost btn--block" type="button" disabled={!!busy} onClick={() => run('ångra', () => jobAction(job.id, 'undone'))}>
          Undo done
        </button>
      )}

      {planned && future && (
        <section class="st-card">
          <h3>Can't work this shift?</h3>
          {job.my_swap ? (
            <>
              <p>{job.my_swap.status === 'vantar' ? 'A colleague has taken the shift. It is waiting for approval.' : 'The shift is offered to your colleagues.'}</p>
              <button class="btn btn--ghost btn--sm" type="button" disabled={!!busy} onClick={() => run('byte', () => cancelSwap(job.my_swap.id), 'The offer is withdrawn.')}>
                Withdraw
              </button>
            </>
          ) : (
            <>
              <p class="muted">Offer the shift to your colleagues. You stay on the job until an admin has approved the swap.</p>
              <button
                class="btn btn--ghost btn--sm"
                type="button"
                disabled={!!busy}
                onClick={() => {
                  const note = window.prompt('Anything you want to tell your colleagues? (optional)', '');
                  if (note === null) return;
                  run('byte', () => offerSwap(job.id, note), 'The shift is offered.');
                }}
              >
                Offer the shift
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
}
