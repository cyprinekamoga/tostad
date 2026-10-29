// Inkorgen: bokningar, meddelanden och skadeanmälningar från webbplatsen.
import { useEffect, useState } from 'preact/hooks';
import { supabase, formatDateTime, callFunction } from '../../lib/supabase.js';
import { ErrorMsg, Phone, Email } from '../ui.jsx';
import { KIND, STATUS, FIELDS, fieldValue, summary, ensureCustomer } from './submission.js';
import { describeCalc } from '../../lib/calcSummary.js';

const FILTERS = [
  ['ny', 'New'],
  ['hanterad', 'Handled'],
  ['arkiverad', 'Archived'],
  ['alla', 'All'],
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
    if (loadError) return setError('Could not load the inbox.');
    setItems(data);
    const wanted = keepId ?? window.location.hash.slice(1);
    if (wanted) {
      const hit = data.find((s) => s.id === wanted);
      if (hit) setSelected(hit);
      else {
        // Ärendet syns inte med nuvarande filter (länkat, eller nyss hanterat): hämta det ändå.
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
        <h2>Inbox</h2>
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
          {items === null && <p class="muted">Loading …</p>}
          {items?.length === 0 && <p class="cp-panel cp-empty">Nothing here right now.</p>}
          {items?.length > 0 && (
            <ul class="cp-list">
              {items.map((s) => (
                <li>
                  <button type="button" class="cp-row" aria-current={selected?.id === s.id ? 'true' : undefined} onClick={() => open(s)}>
                    <span class="cp-row-top">
                      <strong>{s.name || 'No name'}</strong>
                      <span>
                        {s.status === 'ny' && <span class="badge badge--ny">New</span>}{' '}
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
          items?.length > 0 && <p class="cp-panel cp-empty">Choose an item in the list.</p>
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
      setError(e.message || 'Something went wrong.');
    }
    setBusy(false);
  }

  const setStatus = (status) =>
    run(async () => {
      const { error: e } = await sb.from('submissions').update({ status }).eq('id', item.id);
      if (e) throw new Error('Could not save.');
      await onChanged(item.id);
    });

  const saveNote = () =>
    run(async () => {
      const { error: e } = await sb.from('submissions').update({ note: note.trim() || null }).eq('id', item.id);
      if (e) throw new Error('Could not save the note.');
      setInfo('The note is saved.');
      await onChanged(item.id);
    });

  // Skapar en kund av ärendet, eller kopplar till en befintlig kund med samma mejl eller telefon.
  const toCustomer = () =>
    run(async () => {
      const customer = await ensureCustomer(sb, item);
      setInfo(customer.existed ? `Linked to existing customer: ${customer.name}.` : 'The customer is created.');
      await onChanged(item.id);
    });

  const remove = () => {
    if (!window.confirm('Remove this item and any photos for good?')) return;
    run(async () => {
      if (item.files?.length) await sb.storage.from('inbox').remove(item.files);
      const { error: e } = await sb.from('submissions').delete().eq('id', item.id);
      if (e) throw new Error('Could not remove.');
      onDeleted();
    });
  };

  return (
    <article class="cp-panel cp-detail" aria-label="Item">
      <div class="cp-row-top">
        <h3>{item.name || 'No name'}</h3>
        <span>
          <span class={`badge badge--${item.kind}`}>{KIND[item.kind]}</span>{' '}
          <span class={item.status === 'ny' ? 'badge badge--ny' : 'badge badge--muted'}>{STATUS[item.status]}</span>
        </span>
      </div>
      <p class="muted">
        Received {formatDateTime(item.created_at)}
        {item.handled_at && ` · ${STATUS[item.status]} ${formatDateTime(item.handled_at)}${names[item.handled_by] ? ` by ${names[item.handled_by]}` : ''}`}
      </p>
      <p>
        <Phone value={item.phone} /> {item.phone && item.email && ' · '} <Email value={item.email} />
      </p>
      <dl class="cp-dl">
        {FIELDS.filter(([key]) => data[key] && !['namn', 'telefon', 'epost', 'kontakt', 'kalkyl'].includes(key)).map(([key, label]) => (
          <>
            <dt>{label}</dt>
            <dd>{fieldValue(key, data[key])}</dd>
          </>
        ))}
      </dl>
      {data.kalkyl && describeCalc(data.kalkyl).length > 0 && (
        <section class="cp-calc">
          <h4>The customer's choices in the price calculator</h4>
          <dl class="cp-dl">
            {describeCalc(data.kalkyl).map(([label, value]) => (
              <>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </>
            ))}
          </dl>
        </section>
      )}
      {item.files?.length > 0 && (
        <div class="cp-files">
          {item.files.map((path) => {
            const url = urls[path];
            const isImage = /\.(jpe?g|png|webp)$/i.test(path);
            return url ? (
              <a href={url} target="_blank" rel="noopener">
                {isImage ? <img src={url} alt="Photo from the customer" /> : <span style="display:block;padding:30px 6px">Open file</span>}
              </a>
            ) : (
              <span class="muted">Loading photo …</span>
            );
          })}
        </div>
      )}
      {item.customer_id && data.kalla === 'Kundportalen' && <Conversation item={item} onReplied={() => onChanged(item.id)} />}
      <div class="field">
        <label for="note">Internal note</label>
        <textarea id="note" maxLength={5000} value={note} onInput={(e) => setNote(e.currentTarget.value)} />
        <div>
          <button class="btn btn--ghost btn--sm" type="button" disabled={busy || note === (item.note ?? '')} onClick={saveNote}>
            Save note
          </button>
        </div>
      </div>
      <ErrorMsg error={error} />
      {info && <p class="msg msg--ok">{info}</p>}
      <div class="cp-actions">
        {jobId && <a class="btn btn--sm" href={`/admin/planering?jobb=${jobId}`}>Show the job</a>}
        {jobId === null && <a class="btn btn--sm" href={`/admin/planering?fran=${item.id}`}>Create job</a>}
        {item.kind !== 'skadeanmalan' && <a class="btn btn--ghost btn--sm" href={`/admin/offerter?fran=${item.id}`}>Create quote</a>}
        {item.status !== 'hanterad' && (
          <button class="btn btn--sm" type="button" disabled={busy} onClick={() => setStatus('hanterad')}>Mark as handled</button>
        )}
        {item.status !== 'arkiverad' && (
          <button class="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={() => setStatus('arkiverad')}>Archive</button>
        )}
        {item.status !== 'ny' && (
          <button class="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={() => setStatus('ny')}>Mark as new</button>
        )}
        {item.customer_id ? (
          <a class="btn btn--ghost btn--sm" href={`/admin/kunder#${item.customer_id}`}>Show the customer</a>
        ) : (
          <button class="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={toCustomer}>Create customer</button>
        )}
        <button class="btn btn--danger btn--sm" type="button" disabled={busy} onClick={remove}>Remove</button>
      </div>
    </article>
  );
}

// Tråden med kunden på Mina sidor. Svaret syns där och mejlas till kunden.
function Conversation({ item, onReplied }) {
  const sb = supabase();
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = () =>
    sb
      .from('portal_messages')
      .select('id, from_customer, body, created_at, read_at')
      .eq('customer_id', item.customer_id)
      .order('created_at')
      .limit(100)
      .then(({ data }) => setMessages(data ?? []));

  useEffect(() => {
    setText('');
    setInfo('');
    load();
  }, [item.id]);

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const r = await callFunction('email', { action: 'portal_reply', customer_id: item.customer_id, submission_id: item.id, body: text });
      setText('');
      setInfo(r.emailed ? `The reply is on the customer's page and emailed to ${r.emailed}.` : `The reply is on the customer's page. Not emailed: ${r.email_error}.`);
      await load();
      onReplied();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <section class="cp-thread" aria-label="Conversation with the customer">
      <h4>Conversation on Mina sidor</h4>
      {messages === null && <p class="muted">Loading …</p>}
      <ol class="cp-thread-list">
        {(messages ?? []).map((m) => (
          <li class={m.from_customer ? 'is-customer' : 'is-us'}>
            <small>
              {m.from_customer ? item.name || 'Customer' : 'You'} · {formatDateTime(m.created_at)}
              {!m.from_customer && (m.read_at ? ' · read' : ' · not read yet')}
            </small>
            <p>{m.body}</p>
          </li>
        ))}
      </ol>
      <form class="field" onSubmit={send}>
        <label for={`reply-${item.id}`}>Reply (Swedish)</label>
        <textarea id={`reply-${item.id}`} rows={4} maxLength={4000} required value={text} onInput={(e) => setText(e.currentTarget.value)} placeholder="Hej! …" />
        <ErrorMsg error={error} />
        {info && <p class="msg msg--ok">{info}</p>}
        <div>
          <button class="btn btn--sm" type="submit" disabled={busy || !text.trim()}>
            {busy ? 'Sending …' : 'Send reply'}
          </button>
        </div>
      </form>
    </section>
  );
}
