// Inkorgen: bokningar, meddelanden och skadeanmälningar från webbplatsen.
import { useEffect, useState } from 'preact/hooks';
import { supabase, formatDateTime } from '../../lib/supabase.js';
import { ErrorMsg, Phone, Email } from '../ui.jsx';
import { KIND, STATUS, FIELDS, fieldValue, summary, ensureCustomer } from './submission.js';

const FILTERS = [
  ['ny', 'Nya'],
  ['hanterad', 'Hanterade'],
  ['arkiverad', 'Arkiverade'],
  ['alla', 'Alla'],
];
const COLUMNS = 'id, kind, status, name, email, phone, data, files, note, customer_id, handled_by, handled_at, created_at';

export default function Inbox({ onInboxChange }) {
  const sb = supabase();
  const [filter, setFilter] = useState('ny');
  const [items, setItems] = useState(null);
  const [selected, setSelected] = useState(null);
  const [names, setNames] = useState({});
  const [error, setError] = useState('');

  async function load(keepId) {
    let query = sb.from('submissions').select(COLUMNS).order('created_at', { ascending: false }).limit(200);
    if (filter !== 'alla') query = query.eq('status', filter);
    const { data, error: loadError } = await query;
    if (loadError) return setError('Kunde inte hämta inkorgen.');
    setItems(data);
    const wanted = keepId ?? window.location.hash.slice(1);
    if (wanted) {
      const hit = data.find((s) => s.id === wanted);
      if (hit) setSelected(hit);
      else if (!keepId) {
        // Länkat ärende som inte syns med nuvarande filter.
        const { data: one } = await sb.from('submissions').select(COLUMNS).eq('id', wanted).maybeSingle();
        if (one) setSelected(one);
      }
    }
  }

  useEffect(() => {
    load();
  }, [filter]);

  useEffect(() => {
    sb.from('profiles')
      .select('id, full_name')
      .then(({ data }) => setNames(Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name]))));
  }, []);

  function open(s) {
    setSelected(s);
    window.history.replaceState(null, '', `#${s.id}`);
  }

  async function changed(id) {
    await load(id);
    onInboxChange?.();
  }

  return (
    <>
      <div class="cp-head">
        <h2>Inkorg</h2>
        <div class="cp-tabs" role="group" aria-label="Filter">
          {FILTERS.map(([key, label]) => (
            <button type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <ErrorMsg error={error} />
      <div class="cp-split">
        <div>
          {items === null && <p class="muted">Laddar …</p>}
          {items?.length === 0 && <p class="cp-panel cp-empty">Inget här just nu.</p>}
          {items?.length > 0 && (
            <ul class="cp-list">
              {items.map((s) => (
                <li>
                  <button type="button" class="cp-row" aria-current={selected?.id === s.id ? 'true' : undefined} onClick={() => open(s)}>
                    <span class="cp-row-top">
                      <strong>{s.name || 'Utan namn'}</strong>
                      <span>
                        {s.status === 'ny' && <span class="badge badge--ny">Ny</span>}{' '}
                        <span class={`badge badge--${s.kind}`}>{KIND[s.kind]}</span>
                      </span>
                    </span>
                    <p>{summary(s)}</p>
                    <small>{formatDateTime(s.created_at)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {selected ? (
          <Detail key={selected.id} item={selected} names={names} onChanged={changed} onDeleted={() => { setSelected(null); window.history.replaceState(null, '', window.location.pathname); changed(); }} />
        ) : (
          items?.length > 0 && <p class="cp-panel cp-empty">Välj ett ärende i listan.</p>
        )}
      </div>
    </>
  );
}

function Detail({ item, names, onChanged, onDeleted }) {
  const sb = supabase();
  const [note, setNote] = useState(item.note ?? '');
  const [urls, setUrls] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [jobId, setJobId] = useState(undefined);
  const data = item.data ?? {};

  useEffect(() => {
    if (item.kind !== 'bokning') return;
    sb.from('jobs').select('id').eq('submission_id', item.id).maybeSingle().then(({ data: job }) => setJobId(job?.id ?? null));
  }, [item.id]);

  useEffect(() => {
    (async () => {
      if (!item.files?.length) return;
      const { data: signed } = await sb.storage.from('inbox').createSignedUrls(item.files, 300);
      setUrls(Object.fromEntries((signed ?? []).filter((f) => f.signedUrl).map((f) => [f.path, f.signedUrl])));
    })();
  }, [item.id]);

  async function run(task) {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await task();
    } catch (e) {
      setError(e.message || 'Något gick fel.');
    }
    setBusy(false);
  }

  const setStatus = (status) =>
    run(async () => {
      const { error: e } = await sb.from('submissions').update({ status }).eq('id', item.id);
      if (e) throw new Error('Kunde inte spara.');
      await onChanged(item.id);
    });

  const saveNote = () =>
    run(async () => {
      const { error: e } = await sb.from('submissions').update({ note: note.trim() || null }).eq('id', item.id);
      if (e) throw new Error('Kunde inte spara anteckningen.');
      setInfo('Anteckningen är sparad.');
      await onChanged(item.id);
    });

  // Skapar en kund av ärendet, eller kopplar till en befintlig kund med samma mejl eller telefon.
  const toCustomer = () =>
    run(async () => {
      const customer = await ensureCustomer(sb, item);
      setInfo(customer.existed ? `Kopplat till befintlig kund: ${customer.name}.` : 'Kunden är skapad.');
      await onChanged(item.id);
    });

  const remove = () => {
    if (!window.confirm('Ta bort ärendet och eventuella bilder för alltid?')) return;
    run(async () => {
      if (item.files?.length) await sb.storage.from('inbox').remove(item.files);
      const { error: e } = await sb.from('submissions').delete().eq('id', item.id);
      if (e) throw new Error('Kunde inte ta bort.');
      onDeleted();
    });
  };

  return (
    <article class="cp-panel cp-detail" aria-label="Ärende">
      <div class="cp-row-top">
        <h3>{item.name || 'Utan namn'}</h3>
        <span>
          <span class={`badge badge--${item.kind}`}>{KIND[item.kind]}</span>{' '}
          <span class={item.status === 'ny' ? 'badge badge--ny' : 'badge badge--muted'}>{STATUS[item.status]}</span>
        </span>
      </div>
      <p class="muted">
        Inkom {formatDateTime(item.created_at)}
        {item.handled_at && ` · ${STATUS[item.status]} ${formatDateTime(item.handled_at)}${names[item.handled_by] ? ` av ${names[item.handled_by]}` : ''}`}
      </p>
      <p>
        <Phone value={item.phone} /> {item.phone && item.email && ' · '} <Email value={item.email} />
      </p>
      <dl class="cp-dl">
        {FIELDS.filter(([key]) => data[key] && !['namn', 'telefon', 'epost', 'kontakt'].includes(key)).map(([key, label]) => (
          <>
            <dt>{label}</dt>
            <dd>{fieldValue(key, data[key])}</dd>
          </>
        ))}
      </dl>
      {item.files?.length > 0 && (
        <div class="cp-files">
          {item.files.map((path) => {
            const url = urls[path];
            const isImage = /\.(jpe?g|png|webp)$/i.test(path);
            return url ? (
              <a href={url} target="_blank" rel="noopener">
                {isImage ? <img src={url} alt="Bild från kunden" /> : <span style="display:block;padding:30px 6px">Öppna fil</span>}
              </a>
            ) : (
              <span class="muted">Laddar bild …</span>
            );
          })}
        </div>
      )}
      <div class="field">
        <label for="note">Intern anteckning</label>
        <textarea id="note" maxLength={5000} value={note} onInput={(e) => setNote(e.currentTarget.value)} />
        <div>
          <button class="btn btn--ghost btn--sm" type="button" disabled={busy || note === (item.note ?? '')} onClick={saveNote}>
            Spara anteckning
          </button>
        </div>
      </div>
      <ErrorMsg error={error} />
      {info && <p class="msg msg--ok">{info}</p>}
      <div class="cp-actions">
        {jobId && <a class="btn btn--sm" href={`/admin/planering?jobb=${jobId}`}>Visa jobbet</a>}
        {jobId === null && <a class="btn btn--sm" href={`/admin/planering?fran=${item.id}`}>Skapa jobb</a>}
        {item.kind !== 'skadeanmalan' && <a class="btn btn--ghost btn--sm" href={`/admin/offerter?fran=${item.id}`}>Skapa offert</a>}
        {item.status !== 'hanterad' && (
          <button class="btn btn--sm" type="button" disabled={busy} onClick={() => setStatus('hanterad')}>Markera som hanterad</button>
        )}
        {item.status !== 'arkiverad' && (
          <button class="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={() => setStatus('arkiverad')}>Arkivera</button>
        )}
        {item.status !== 'ny' && (
          <button class="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={() => setStatus('ny')}>Markera som ny</button>
        )}
        {item.customer_id ? (
          <a class="btn btn--ghost btn--sm" href={`/admin/kunder#${item.customer_id}`}>Visa kunden</a>
        ) : (
          <button class="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={toCustomer}>Skapa kund</button>
        )}
        <button class="btn btn--danger btn--sm" type="button" disabled={busy} onClick={remove}>Ta bort</button>
      </div>
    </article>
  );
}
