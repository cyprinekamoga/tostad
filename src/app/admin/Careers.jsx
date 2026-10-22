// Rekrytering: ansökningar (brev, CV, status, anteckning) och annonser på /jobb.
import { useEffect, useState } from 'preact/hooks';
import { supabase, formatDateTime } from '../../lib/supabase.js';
import { EMPLOYMENT, slugify } from '../../lib/careers.js';
import { ErrorMsg, Modal, Phone, Email } from '../ui.jsx';

const STATUS = { ny: 'Ny', intervju: 'Intervju', anstalld: 'Anställd', nej: 'Nej tack' };
const VSTATUS = { utkast: 'Utkast', publicerad: 'Publicerad', stangd: 'Stängd' };

export default function Careers({ onInboxChange }) {
  const sb = supabase();
  const [tab, setTab] = useState('ansokningar');
  const [apps, setApps] = useState(null);
  const [vacancies, setVacancies] = useState([]);
  const [filter, setFilter] = useState('aktiva');
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    const [a, v] = await Promise.all([
      sb.from('applications').select('*').order('created_at', { ascending: false }).limit(500),
      sb.from('vacancies').select('*').order('created_at', { ascending: false }),
    ]);
    if (a.error || v.error) setError('Kunde inte hämta allt.');
    setApps(a.data ?? []);
    setVacancies(v.data ?? []);
    if (selected) setSelected((a.data ?? []).find((x) => x.id === selected.id) ?? null);
    onInboxChange?.();
  }

  useEffect(() => {
    load();
  }, []);

  const title = (id) => vacancies.find((v) => v.id === id)?.title ?? 'Spontanansökan';
  const shown = (apps ?? []).filter((a) => (filter === 'aktiva' ? ['ny', 'intervju'].includes(a.status) : filter === 'alla' ? true : a.status === filter));

  return (
    <>
      <div class="cp-head">
        <h2>Rekrytering</h2>
        <div class="cp-tabs" role="group" aria-label="Visa">
          <button type="button" aria-pressed={tab === 'ansokningar'} onClick={() => setTab('ansokningar')}>Ansökningar</button>
          <button type="button" aria-pressed={tab === 'annonser'} onClick={() => setTab('annonser')}>Annonser</button>
        </div>
      </div>
      <ErrorMsg error={error} />

      {tab === 'ansokningar' ? (
        <>
          <div class="cp-tabs" role="group" aria-label="Filter" style="margin-bottom:14px">
            {[['aktiva', 'Nya och intervju'], ['anstalld', 'Anställda'], ['nej', 'Nej tack'], ['alla', 'Alla']].map(([k, l]) => (
              <button type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
          <div class="cp-split">
            <div>
              {apps === null && <p class="muted">Laddar …</p>}
              {apps && shown.length === 0 && <p class="cp-panel cp-empty">Inga ansökningar här.</p>}
              <ul class="cp-list">
                {shown.map((a) => (
                  <li>
                    <button type="button" class="cp-row" aria-current={selected?.id === a.id ? 'true' : undefined} onClick={() => setSelected(a)}>
                      <span class="cp-row-top">
                        <strong>{a.name}</strong>
                        <span class={`badge ${a.status === 'ny' ? 'badge--ny' : a.status === 'nej' ? 'badge--muted' : ''}`}>{STATUS[a.status]}</span>
                      </span>
                      <p>{title(a.vacancy_id)}</p>
                      <small>{formatDateTime(a.created_at)}{a.cv_path ? ' · CV bifogat' : ''}</small>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            {selected ? (
              <ApplicationDetail key={selected.id} app={selected} vacancyTitle={title(selected.vacancy_id)} onChanged={load} onDeleted={() => { setSelected(null); load(); }} />
            ) : (
              apps?.length > 0 && <p class="cp-panel cp-empty">Välj en ansökan i listan.</p>
            )}
          </div>
          <p class="muted" style="margin-top:12px">Ansökningar som får nej raderas automatiskt två år efter beslutet, tillsammans med CV:t.</p>
        </>
      ) : (
        <>
          <div class="cp-actions" style="margin-bottom:14px">
            <button class="btn btn--sm" type="button" onClick={() => setEditing({ title: '', location: 'Stockholm', employment: 'timanstallning', description: '', status: 'utkast' })}>Ny annons</button>
          </div>
          <div class="cp-panel">
            {vacancies.length === 0 && <p class="cp-empty">Inga annonser ännu.</p>}
            <ul class="cp-list">
              {vacancies.map((v) => {
                const count = (apps ?? []).filter((a) => a.vacancy_id === v.id).length;
                return (
                  <li class="cp-row cp-row--static">
                    <span class="cp-row-top">
                      <strong>{v.title}</strong>
                      <span class={`badge ${v.status === 'publicerad' ? '' : 'badge--muted'}`}>{VSTATUS[v.status]}</span>
                    </span>
                    <p>{EMPLOYMENT[v.employment]} · {v.location}{v.valid_through ? ` · sista dag ${v.valid_through}` : ''} · {count} ansökningar</p>
                    <span class="cp-actions">
                      <button class="btn btn--ghost btn--sm" type="button" onClick={() => setEditing(v)}>Ändra</button>
                      {v.status === 'publicerad' && <a class="btn btn--ghost btn--sm" href={`/jobb/annons?a=${v.slug}`} target="_blank" rel="noopener">Visa annonsen</a>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <p class="muted" style="margin-top:12px">Publicerade annonser syns direkt på tostadflytt.se/jobb och kan visas i Googles jobbsök.</p>
        </>
      )}

      <Modal open={!!editing} label="Annons" onClose={() => setEditing(null)}>
        {editing && <VacancyForm value={editing} onDone={() => { setEditing(null); load(); }} />}
      </Modal>
    </>
  );
}

function ApplicationDetail({ app, vacancyTitle, onChanged, onDeleted }) {
  const sb = supabase();
  const [note, setNote] = useState(app.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }

  const setStatus = (status) =>
    run(async () => {
      const { error: e } = await sb.from('applications').update({ status }).eq('id', app.id);
      if (e) throw new Error('Kunde inte spara.');
    });

  // CV:t laddas ner via en länk som gäller i en minut. Sidan står kvar.
  async function openCv() {
    const { data, error: e } = await sb.storage.from('cv').createSignedUrl(app.cv_path, 60, { download: app.cv_name || true });
    if (e) return setError('Kunde inte hämta CV:t.');
    window.location.assign(data.signedUrl);
  }

  async function remove() {
    if (!window.confirm(`Radera ansökan från ${app.name} och CV:t för alltid?`)) return;
    setBusy(true);
    if (app.cv_path) await sb.storage.from('cv').remove([app.cv_path]);
    const { error: e } = await sb.from('applications').delete().eq('id', app.id);
    if (e) {
      setBusy(false);
      return setError('Kunde inte radera.');
    }
    onDeleted();
  }

  const staffLink = `/admin/personal?ny=1&namn=${encodeURIComponent(app.name)}&epost=${encodeURIComponent(app.email)}&tel=${encodeURIComponent(app.phone ?? '')}`;

  return (
    <article class="cp-panel cp-detail" aria-label="Ansökan">
      <div class="cp-row-top">
        <h3>{app.name}</h3>
        <span class="badge">{STATUS[app.status]}</span>
      </div>
      <p class="muted">{vacancyTitle} · inkom {formatDateTime(app.created_at)}{app.decided_at ? ` · ${STATUS[app.status].toLowerCase()} ${formatDateTime(app.decided_at)}` : ''}</p>
      <p><Phone value={app.phone} /> {app.phone && ' · '} <Email value={app.email} /></p>
      <dl class="cp-dl">
        {app.licence !== null && <><dt>B-körkort</dt><dd>{app.licence ? 'Ja' : 'Nej'}</dd></>}
        {app.start_date && <><dt>Kan börja</dt><dd>{app.start_date}</dd></>}
        {app.experience && <><dt>Erfarenhet</dt><dd>{app.experience}</dd></>}
        <dt>Personligt brev</dt><dd>{app.letter}</dd>
      </dl>
      {app.cv_path ? (
        <button class="btn btn--ghost btn--sm" type="button" onClick={openCv}>Ladda ner CV ({app.cv_name || 'fil'})</button>
      ) : (
        <p class="muted">Inget CV bifogat.</p>
      )}
      <div class="field">
        <label for="ap-note">Anteckning (syns bara för administratörer)</label>
        <textarea id="ap-note" rows={3} maxLength={4000} value={note} onInput={(e) => setNote(e.currentTarget.value)} />
        <div>
          <button class="btn btn--ghost btn--sm" type="button" disabled={busy || note === (app.note ?? '')} onClick={() => run(async () => {
            const { error: e } = await sb.from('applications').update({ note: note.trim() || null }).eq('id', app.id);
            if (e) throw new Error('Kunde inte spara anteckningen.');
          })}>Spara anteckning</button>
        </div>
      </div>
      <ErrorMsg error={error} />
      <div class="cp-actions">
        {app.status !== 'intervju' && <button class="btn btn--sm" type="button" disabled={busy} onClick={() => setStatus('intervju')}>Kalla till intervju</button>}
        {app.status !== 'anstalld' && <button class="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={() => setStatus('anstalld')}>Anställd</button>}
        {app.status !== 'nej' && <button class="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={() => setStatus('nej')}>Nej tack</button>}
        {app.status !== 'ny' && <button class="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={() => setStatus('ny')}>Markera som ny</button>}
        <a class="btn btn--ghost btn--sm" href={`mailto:${app.email}?subject=${encodeURIComponent(`Din ansökan till TO Städ & Flytt`)}`}>Mejla</a>
        {app.status === 'anstalld' && <a class="btn btn--sm" href={staffLink}>Lägg till som personal</a>}
        <button class="btn btn--danger btn--sm" type="button" disabled={busy} onClick={remove}>Radera</button>
      </div>
    </article>
  );
}

function VacancyForm({ value, onDone }) {
  const sb = supabase();
  const [form, setForm] = useState({ intro: '', requirements: '', salary: '', start_text: '', valid_through: '', slug: '', ...value });
  const [slugTouched, setSlugTouched] = useState(!!value.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (e) => {
    const v = e.currentTarget.value;
    const next = { ...form, [key]: v };
    if (key === 'title' && !slugTouched) next.slug = slugify(v);
    setForm(next);
  };

  async function submit(e) {
    e.preventDefault();
    setError('');
    const slug = slugify(form.slug || form.title);
    if (!slug) return setError('Skriv en rubrik.');
    if (form.status === 'publicerad' && form.description.trim().length < 40) return setError('Skriv en beskrivning av jobbet innan du publicerar.');
    const values = {
      title: form.title.trim(),
      slug,
      location: form.location.trim() || 'Stockholm',
      employment: form.employment,
      intro: form.intro.trim() || null,
      description: form.description.trim(),
      requirements: form.requirements?.trim() || null,
      salary: form.salary?.trim() || null,
      start_text: form.start_text?.trim() || null,
      valid_through: form.valid_through || null,
      status: form.status,
    };
    setBusy(true);
    const { error: err } = value.id ? await sb.from('vacancies').update(values).eq('id', value.id) : await sb.from('vacancies').insert(values);
    setBusy(false);
    if (err) return setError(/slug|duplicate|unique/.test(err.message) ? 'Det finns redan en annons med samma webbadress. Ändra rubriken eller adressen.' : 'Kunde inte spara.');
    onDone();
  }

  return (
    <form onSubmit={submit}>
      <h3>{value.id ? 'Ändra annons' : 'Ny annons'}</h3>
      <div class="field">
        <label for="v-title">Rubrik</label>
        <input id="v-title" type="text" required minLength={3} maxLength={120} placeholder="Till exempel Städare till hemstädning, deltid" value={form.title} onInput={set('title')} />
      </div>
      <div class="field">
        <label for="v-slug">Webbadress</label>
        <input id="v-slug" type="text" maxLength={80} value={form.slug} onInput={(e) => { setSlugTouched(true); set('slug')(e); }} />
        <small class="muted">tostadflytt.se/jobb/annons?a={slugify(form.slug || form.title) || '…'}</small>
      </div>
      <div class="form-3">
        <div class="field">
          <label for="v-loc">Ort</label>
          <input id="v-loc" type="text" maxLength={120} value={form.location} onInput={set('location')} />
        </div>
        <div class="field">
          <label for="v-emp">Anställning</label>
          <select id="v-emp" value={form.employment} onChange={set('employment')}>
            {Object.entries(EMPLOYMENT).map(([k, v]) => <option value={k}>{v}</option>)}
          </select>
        </div>
        <div class="field">
          <label for="v-until">Sista ansökningsdag</label>
          <input id="v-until" type="date" value={form.valid_through ?? ''} onInput={set('valid_through')} />
        </div>
      </div>
      <div class="field">
        <label for="v-intro">Ingress (kort, syns i listan)</label>
        <input id="v-intro" type="text" maxLength={500} value={form.intro} onInput={set('intro')} />
      </div>
      <div class="field">
        <label for="v-desc">Om jobbet</label>
        <textarea id="v-desc" rows={7} maxLength={8000} value={form.description} onInput={set('description')} placeholder={'Tom rad ger nytt stycke.\nRader som börjar med - blir en punktlista.'} />
      </div>
      <div class="field">
        <label for="v-req">Vi söker dig som (valfritt)</label>
        <textarea id="v-req" rows={4} maxLength={4000} value={form.requirements} onInput={set('requirements')} placeholder={'- Har B-körkort\n- Pratar svenska eller engelska'} />
      </div>
      <div class="form-2">
        <div class="field">
          <label for="v-sal">Lön (valfritt)</label>
          <input id="v-sal" type="text" maxLength={200} value={form.salary} onInput={set('salary')} placeholder="Till exempel timlön enligt överenskommelse" />
        </div>
        <div class="field">
          <label for="v-start">Start (valfritt)</label>
          <input id="v-start" type="text" maxLength={200} value={form.start_text} onInput={set('start_text')} placeholder="Till exempel snarast" />
        </div>
      </div>
      <div class="field">
        <label for="v-status">Status</label>
        <select id="v-status" value={form.status} onChange={set('status')}>
          {Object.entries(VSTATUS).map(([k, v]) => <option value={k}>{v}</option>)}
        </select>
      </div>
      <ErrorMsg error={error} />
      <div class="cp-actions">
        <button class="btn" type="submit" disabled={busy}>{busy ? 'Sparar …' : 'Spara'}</button>
        <button class="btn btn--ghost" type="button" onClick={onDone}>Avbryt</button>
      </div>
    </form>
  );
}
