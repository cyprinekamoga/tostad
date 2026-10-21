// Ett jobb: adress, kund, kollegor, information, checklista, foton, stämpling och klart.
import { useEffect, useState } from 'preact/hooks';
import { ErrorMsg } from '../ui.jsx';
import { SERVICE_LABELS, serviceColor } from '../admin/jobs.js';
import { checklistFor } from '../../lib/worktime.js';
import { formatDateTime } from '../../lib/supabase.js';
import { myJob, jobAction, openEntry, photos as loadPhotos, uploadPhoto, deletePhoto, offerSwap, cancelSwap, mapsLink, telLink } from './api.js';
import { ClockCard, jobPlace, jobTitle, dayName } from './parts.jsx';

const KINDS = { fore: 'Före', efter: 'Efter', skada: 'Skada' };

export default function JobPage({ me }) {
  const id = new URLSearchParams(window.location.search).get('id');
  const [job, setJob] = useState(undefined);
  const [entry, setEntry] = useState(undefined);
  const [pics, setPics] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function load() {
    try {
      const [j, open] = await Promise.all([myJob(id), openEntry(me.profile.id)]);
      setJob(j);
      setEntry(open);
      if (j) setPics(await loadPhotos(j.id));
    } catch (e) {
      setError(e.message);
      setJob(null);
    }
  }

  useEffect(() => {
    if (id) load();
    else setJob(null);
  }, []);

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

  if (job === undefined) return <p class="muted" aria-busy="true">Laddar …</p>;
  if (job === null)
    return (
      <div class="st-page">
        <p class="st-empty">Jobbet finns inte eller så är du inte bokad på det längre.</p>
        <a class="btn btn--ghost btn--block" href="/app/schema">Till schemat</a>
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
    const next = list.map((item, i) => (i === index ? { ...item, done: !item.done } : item));
    setJob({ ...job, checklist: next });
    jobAction(job.id, 'checklist', next).catch((e) => {
      setError(e.message);
      load();
    });
  }

  async function addPhotos(e, kind) {
    const files = [...e.currentTarget.files];
    e.currentTarget.value = '';
    if (!files.length) return;
    run('foto', async () => {
      for (const f of files) await uploadPhoto(job.id, f, kind, me.profile.id);
    }, files.length === 1 ? 'Fotot är sparat.' : `${files.length} foton är sparade.`);
  }

  return (
    <div class="st-page">
      <a class="st-back" href="/app/schema">‹ Schema</a>
      <header class="st-jobhead" style={`--c:${serviceColor(job.service)}`}>
        <span class="st-tag">{SERVICE_LABELS[job.service]}</span>
        <h2>{jobTitle(job)}</h2>
        <p>
          {dayName(job.date)} · <strong>{job.startTime} till {job.endTime}</strong>
        </p>
        {job.status === 'avbokad' && <p class="msg msg--error">Jobbet är avbokat.</p>}
        {job.status === 'klar' && <p class="msg msg--ok">Klart {job.done_at ? formatDateTime(job.done_at) : ''}</p>}
      </header>
      <ErrorMsg error={error} />
      {info && <p class="msg msg--ok">{info}</p>}

      <section class="st-card">
        <h3>Adress</h3>
        {place ? (
          <p>
            <strong>{place}</strong>
            {toPlace && (
              <>
                <br />Till: <strong>{toPlace}</strong>
              </>
            )}
          </p>
        ) : (
          <p class="muted">{job.city ? `${job.city}. Hela adressen visas en vecka innan jobbet.` : 'Ingen adress angiven.'}</p>
        )}
        <div class="st-actions">
          {place && <a class="btn btn--sm" href={mapsLink(place)} target="_blank" rel="noopener">Navigera</a>}
          {toPlace && <a class="btn btn--ghost btn--sm" href={mapsLink(toPlace)} target="_blank" rel="noopener">Navigera till nya adressen</a>}
          {job.customer_phone && <a class="btn btn--ghost btn--sm" href={telLink(job.customer_phone)}>Ring kunden</a>}
        </div>
        {planned && !job.on_way_at && future && (
          <button class="btn btn--ghost btn--block" type="button" disabled={!!busy} onClick={() => run('vag', () => jobAction(job.id, 'on_way'), 'Markerat att ni är på väg.')}>
            Vi är på väg
          </button>
        )}
        {job.on_way_at && <p class="muted">På väg sedan {formatDateTime(job.on_way_at)}</p>}
      </section>

      {job.staff_note && (
        <section class="st-card st-note">
          <h3>Information</h3>
          <p style="white-space:pre-wrap">{job.staff_note}</p>
        </section>
      )}

      {others.length > 0 && (
        <section class="st-card">
          <h3>Du jobbar med</h3>
          <ul class="st-people">
            {others.map((p) => (
              <li>
                <span class="pl-person-chip"><i style={`background:${p.color}`} />{p.name}</span>
                {p.phone && <a href={telLink(p.phone)}>Ring</a>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {job.status !== 'avbokad' && entry !== undefined && (
        <ClockCard entry={entry} jobId={job.id} jobLabel={jobTitle(job)} onChange={load} />
      )}

      <section class="st-card">
        <h3>Checklista <small class="muted">{doneCount} av {list.length}</small></h3>
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
        <h3>Foton</h3>
        <p class="muted">Ta foton före och efter. De sparas på jobbet och kunden får dem i sin fotorapport.</p>
        <div class="st-actions">
          {['fore', 'efter', 'skada'].map((kind) => (
            <label class={`btn btn--sm ${kind === 'skada' ? 'btn--ghost' : ''}`}>
              {kind === 'skada' ? 'Foto på skada' : `Foto ${KINDS[kind].toLowerCase()}`}
              <input type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => addPhotos(e, kind)} />
            </label>
          ))}
        </div>
        {busy === 'foto' && <p class="muted">Laddar upp …</p>}
        {pics.length > 0 && (
          <div class="st-photos">
            {pics.map((p) => (
              <figure>
                <a href={p.url} target="_blank" rel="noopener"><img src={p.url} alt={`Foto ${KINDS[p.kind].toLowerCase()}`} loading="lazy" /></a>
                <figcaption>
                  {KINDS[p.kind]}
                  {p.taken_by === me.profile.id && Date.now() - Date.parse(p.created_at) < 864e5 && (
                    <button type="button" aria-label="Ta bort fotot" onClick={() => window.confirm('Ta bort fotot?') && run('del', () => deletePhoto(p))}>Ta bort</button>
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
            if (doneCount < list.length && !window.confirm(`${list.length - doneCount} punkter på checklistan är inte avbockade. Markera jobbet som klart ändå?`)) return;
            run('klar', () => jobAction(job.id, 'done'), 'Bra jobbat! Jobbet är markerat som klart.');
          }}
        >
          Markera jobbet som klart
        </button>
      )}
      {job.status === 'klar' && (
        <button class="btn btn--ghost btn--block" type="button" disabled={!!busy} onClick={() => run('ångra', () => jobAction(job.id, 'undone'))}>
          Ångra klart
        </button>
      )}

      {planned && future && (
        <section class="st-card">
          <h3>Kan du inte jobba?</h3>
          {job.my_swap ? (
            <>
              <p>{job.my_swap.status === 'vantar' ? 'En kollega har tagit passet. Det väntar på godkännande.' : 'Passet är erbjudet till dina kollegor.'}</p>
              <button class="btn btn--ghost btn--sm" type="button" disabled={!!busy} onClick={() => run('byte', () => cancelSwap(job.my_swap.id), 'Erbjudandet är återkallat.')}>
                Återkalla
              </button>
            </>
          ) : (
            <>
              <p class="muted">Erbjud passet till dina kollegor. Du står kvar på jobbet tills en administratör har godkänt bytet.</p>
              <button
                class="btn btn--ghost btn--sm"
                type="button"
                disabled={!!busy}
                onClick={() => {
                  const note = window.prompt('Vill du skriva något till kollegorna? (valfritt)', '');
                  if (note === null) return;
                  run('byte', () => offerSwap(job.id, note), 'Passet är erbjudet.');
                }}
              >
                Erbjud passet
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
}
