// Jobbassistenten: klistra in en text, kontrollera förslagen och genomför de som stämmer.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { formatDateTime } from '../../lib/supabase.js';
import { today } from '../../lib/planner.js';
import { ErrorMsg, copyText } from '../ui.jsx';
import { SERVICE_LABELS, jobLabel } from './jobs.js';
import { ABSENCE_KIND } from '../staff/api.js';
import { totals, formatMoney, formatKrWhole } from '../../lib/money.js';
import { KIND_LABEL, readText, openDrafts, loadDraft, closeDraft, referenceData, jobsFor, lastPrice, toCard, applyCard, conversations, readConversation, whatsappSetup } from './assistant.js';

const REPEAT = [['0', 'Once'], ['1', 'Every week'], ['2', 'Every other week'], ['3', 'Every third week'], ['4', 'Every fourth week']];

export default function Assistant({ me }) {
  const [text, setText] = useState('');
  const [from, setFrom] = useState('');
  const [ref, setRef] = useState(null);
  const [waiting, setWaiting] = useState([]);
  const [chats, setChats] = useState(null);
  const [draft, setDraft] = useState(null);
  const [jobs, setJobs] = useState({});
  const [cards, setCards] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    referenceData().then(setRef);
    openDrafts().then(setWaiting);
    conversations().then(setChats, () => setChats([]));
    const id = new URLSearchParams(window.location.search).get('d');
    if (id) loadDraft(id).then((d) => d && open(d));
  }, []);

  async function open(d) {
    setError('');
    setDone('');
    const r = ref ?? (await referenceData());
    if (!ref) setRef(r);
    const j = await jobsFor(d.result?.actions ?? []);
    setJobs(j);
    const list = (d.result?.actions ?? []).map((a, i) => toCard(a, i, { customers: r.customers, jobs: j, products: r.products }));
    // "Samma pris som förra": hämta kundens senaste pris.
    for (const c of list) {
      if (c.action.kind === 'create_job' && !c.e.price && c.action.price_basis?.same_as_last_time && c.e.customer_id) {
        const p = await lastPrice(c.e.customer_id, c.e.service);
        if (p) Object.assign(c.e, { price: String(p), price_basis: 'Same as the last job for this customer' });
      }
    }
    setDraft(d);
    setCards(list);
    if (d.from_profile) setFrom(d.from_profile);
    window.history.replaceState(null, '', `${window.location.pathname}?d=${d.id}`);
  }

  async function readChat(c) {
    setBusy(`chat-${c.phone}`);
    setError('');
    try {
      await open(await readConversation(c));
      conversations().then(setChats);
    } catch (err) {
      setError(err.message);
    }
    setBusy('');
  }

  async function read(e) {
    e.preventDefault();
    if (text.trim().length < 3) return setError('Paste a text first.');
    setBusy('read');
    setError('');
    try {
      const d = await readText(text, from);
      await open(d);
      setText('');
    } catch (err) {
      setError(err.message);
    }
    setBusy('');
  }

  const update = (key, patch) => setCards((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const setE = (key, patch) => setCards((list) => list.map((c) => (c.key === key ? { ...c, e: { ...c.e, ...patch } } : c)));

  async function applyAll() {
    setBusy('apply');
    setError('');
    const ctx = { created: {}, jobs, customers: ref.customers, fromProfile: from || draft.from_profile, meId: me.profile.id };
    let ok = 0;
    let failed = 0;
    for (const c of cards) {
      if (!c.include || c.status === 'done') continue;
      try {
        const msg = await applyCard(c, ctx);
        update(c.key, typeof msg === 'object' ? { status: 'done', message: msg.text, link: msg.link, linkText: msg.linkText } : { status: 'done', message: msg });
        ok++;
      } catch (err) {
        update(c.key, { status: 'error', message: err.message });
        failed++;
      }
    }
    if (!failed) {
      await closeDraft(draft.id, 'klar', me.profile.id);
      setWaiting((w) => w.filter((x) => x.id !== draft.id));
      setDone(ok === 1 ? '1 suggestion is saved.' : `${ok} suggestions are saved.`);
    } else setError(`${failed} could not be saved. Fix them and press Save again; the others are already saved.`);
    setBusy('');
  }

  async function discard() {
    if (!window.confirm('Discard all suggestions from this message?')) return;
    await closeDraft(draft.id, 'avvisad', me.profile.id);
    setWaiting((w) => w.filter((x) => x.id !== draft.id));
    newText();
  }

  function newText() {
    setDraft(null);
    setCards([]);
    setDone('');
    setError('');
    window.history.replaceState(null, '', window.location.pathname);
  }

  const selected = cards.filter((c) => c.include && c.status !== 'done').length;
  const result = draft?.result;
  const fromName = (id) => ref?.staff.find((p) => p.id === id)?.full_name;

  return (
    <>
      <div class="cp-head">
        <h2>Job assistant</h2>
        {draft && <button class="btn btn--ghost btn--sm" type="button" onClick={newText}>New text</button>}
      </div>

      {!draft && (
        <>
          <form class="cp-panel form-grid as-input" onSubmit={read}>
            <p class="muted" style="margin:0">
              Paste a message from a customer, a landlord or your staff. The assistant suggests jobs, changes, hours and follow-ups. Nothing is saved until you check and press Save.
            </p>
            <div class="field">
              <label for="as-text">Message</label>
              <textarea id="as-text" rows={10} maxLength={20000} value={text} onInput={(e) => setText(e.currentTarget.value)} placeholder={'For example:\nFlyttstäd följande lgh v.45\nHammargatan 12B lgh 1102, 2 rok 61kvm …'} />
            </div>
            <div class="field">
              <label for="as-from">Who wrote it?</label>
              <select id="as-from" value={from} onChange={(e) => setFrom(e.currentTarget.value)}>
                <option value="">A customer, landlord or someone else</option>
                {(ref?.staff ?? []).map((p) => <option value={p.id}>Staff: {p.full_name}</option>)}
              </select>
              <small class="hint">Choose the staff member when it is their report, so "jag" means them.</small>
            </div>
            <ErrorMsg error={error} />
            <div class="cp-actions">
              <button class="btn" type="submit" disabled={busy === 'read'}>{busy === 'read' ? 'Reading … (10 to 30 seconds)' : 'Read the message'}</button>
            </div>
          </form>

          {chats?.length > 0 && (
            <section class="cp-panel" style="margin-bottom:16px">
              <h3 class="cp-subhead">WhatsApp from customers</h3>
              <p class="muted" style="margin-top:0">Messages to the company number from the last two weeks. Customers never get answers from the assistant; you choose what it reads.</p>
              <ul class="cp-list">
                {chats.map((c) => (
                  <li class="cp-row cp-row--static">
                    <span class="cp-row-top">
                      <strong>{c.name ?? `+${c.phone}`}{c.name && <small class="muted"> +{c.phone}</small>}</strong>
                      {c.unread > 0 ? <span class="badge badge--ny">{c.unread} new</span> : <span class="badge badge--muted">Read</span>}
                    </span>
                    <div class="as-chat">
                      {c.messages.slice(-4).map((m) => (
                        <p class={m.direction === 'out' ? 'is-out' : ''}>
                          <small>{formatDateTime(m.created_at)}</small>
                          {m.body ?? `(${m.kind})`}
                        </p>
                      ))}
                    </div>
                    <span class="cp-actions">
                      <button class="btn btn--sm" type="button" disabled={!!busy} onClick={() => readChat(c)}>
                        {busy === `chat-${c.phone}` ? 'Reading …' : c.unread ? 'Read new messages with the assistant' : 'Read the latest messages again'}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {waiting.length > 0 && (
            <section class="cp-panel" style="margin-bottom:16px">
              <h3 class="cp-subhead">Waiting for you</h3>
              <ul class="cp-list">
                {waiting.map((d) => (
                  <li>
                    <button type="button" class="cp-row" onClick={() => open(d)}>
                      <span class="cp-row-top">
                        <strong>{d.result?.summary?.slice(0, 120) || d.input.slice(0, 120)}</strong>
                        <span class="badge">{d.source === 'whatsapp' ? 'WhatsApp' : 'Pasted'}</span>
                      </span>
                      <small>{formatDateTime(d.created_at)}{d.from_profile ? ` · from ${fromName(d.from_profile) ?? 'staff'}` : d.sender_phone ? ` · from ${d.sender_phone}` : ''} · {(d.result?.actions ?? []).length} suggestions</small>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <WhatsAppSetup />
        </>
      )}

      {draft && ref && (
        <>
          <section class="cp-panel as-summary">
            <p><strong>{result?.summary}</strong></p>
            <details>
              <summary>Show the message</summary>
              <p style="white-space:pre-wrap">{draft.input}</p>
            </details>
            {result?.pnr_removed && <p class="muted">A personal identity number was removed before the text was sent to the AI. Add it on the invoice yourself.</p>}
          </section>

          {cards.length === 0 && <p class="cp-panel cp-empty">The assistant found nothing to do in this message.</p>}
          <div class="as-cards">
            {cards.map((c) => (
              <Card card={c} refs={ref} jobs={jobs} onToggle={(v) => update(c.key, { include: v })} onChange={(patch) => setE(c.key, patch)} />
            ))}
          </div>

          <ErrorMsg error={error} />
          {done && <p class="msg msg--ok" role="status">{done} <a href="/admin/planering">Open the planner</a></p>}
          {!done && cards.length > 0 && (
            <div class="cp-actions as-footer">
              <button class="btn" type="button" disabled={!selected || busy === 'apply'} onClick={applyAll}>
                {busy === 'apply' ? 'Saving …' : `Save ${selected} ${selected === 1 ? 'suggestion' : 'suggestions'}`}
              </button>
              <button class="btn btn--ghost" type="button" disabled={busy === 'apply'} onClick={discard}>Discard all</button>
            </div>
          )}
          {!done && cards.length === 0 && (
            <div class="cp-actions"><button class="btn btn--ghost" type="button" onClick={discard}>Close</button></div>
          )}
        </>
      )}
    </>
  );
}

function Card({ card, refs, jobs, onToggle, onChange }) {
  const { action: a, e } = card;
  const kind = a.kind;
  const set = (key) => (ev) => onChange({ [key]: ev.currentTarget.value });
  const job = e.job_id ? jobs[e.job_id] : null;
  const staffName = (id) => refs.staff.find((p) => p.id === id)?.full_name ?? 'Unknown';
  const toggleIn = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const done = card.status === 'done';

  return (
    <article class={`cp-panel as-card${a.confidence === 'low' ? ' is-unsure' : ''}${done ? ' is-done' : ''}${card.status === 'error' ? ' is-error' : ''}`}>
      <header class="as-card-head">
        <label class="cp-check">
          <input type="checkbox" checked={card.include} disabled={done} onChange={(ev) => onToggle(ev.currentTarget.checked)} />
          <span class={`badge as-kind as-kind--${kind}`}>{KIND_LABEL[kind]}</span>
        </label>
        <strong>{a.title}</strong>
        {a.confidence !== 'high' && <span class="badge badge--ny">{a.confidence === 'low' ? 'Unsure' : 'Check'}</span>}
      </header>
      {a.questions?.length > 0 && (
        <ul class="as-questions">
          {a.questions.map((q) => <li>{q}</li>)}
        </ul>
      )}
      {a.source_quote && <p class="as-quote">"{a.source_quote}"</p>}

      {card.include && !done && (
        <div class="as-fields">
          {(kind === 'create_job' || kind === 'follow_up' || kind === 'create_invoice') && (
            <CustomerField e={e} customers={refs.customers} onChange={onChange} />
          )}

          {kind === 'create_job' && (
            <>
              <div class="form-3">
                <div class="field">
                  <label>Service</label>
                  <select value={e.service} onChange={set('service')}>
                    {Object.entries(SERVICE_LABELS).map(([k, v]) => <option value={k}>{v}</option>)}
                  </select>
                </div>
                <div class="field">
                  <label>Date {a.date_text && <small class="muted">("{a.date_text}")</small>}</label>
                  <input type="date" value={e.date} onInput={set('date')} />
                </div>
                <div class="field as-time">
                  <label>Start and hours</label>
                  <span>
                    <input type="time" step="900" value={e.start} onInput={set('start')} />
                    <input type="text" inputMode="decimal" aria-label="Hours" value={e.hours} onInput={set('hours')} />
                    <small>h</small>
                  </span>
                </div>
              </div>
              <div class="form-3">
                <div class="field">
                  <label>Address</label>
                  <input type="text" value={e.street} onInput={set('street')} />
                </div>
                <div class="field">
                  <label>Apartment</label>
                  <input type="text" value={e.apartment} onInput={set('apartment')} />
                </div>
                <div class="field">
                  <label>Postcode and city</label>
                  <span class="as-pair">
                    <input type="text" aria-label="Postcode" value={e.postal_code} onInput={set('postal_code')} />
                    <input type="text" aria-label="City" value={e.city} onInput={set('city')} />
                  </span>
                </div>
              </div>
              {['flytt', 'paket', 'pianoflytt'].includes(e.service) && (
                <div class="form-3">
                  <div class="field"><label>To address</label><input type="text" value={e.to_street} onInput={set('to_street')} /></div>
                  <div class="field"><label>Postcode</label><input type="text" value={e.to_postal_code} onInput={set('to_postal_code')} /></div>
                  <div class="field"><label>City</label><input type="text" value={e.to_city} onInput={set('to_city')} /></div>
                </div>
              )}
              <div class="form-3">
                <div class="field">
                  <label>Price (kr)</label>
                  <input type="text" inputMode="numeric" value={e.price} onInput={set('price')} />
                  <small class="hint">{e.price_basis || 'No price could be calculated. Write it yourself.'}</small>
                </div>
                <div class="field">
                  <label>Repeat</label>
                  <select value={e.repeat} onChange={set('repeat')}>
                    {REPEAT.map(([k, v]) => <option value={k}>{v}</option>)}
                  </select>
                </div>
                {e.repeat !== '0' && (
                  <div class="field">
                    <label>Until</label>
                    <input type="date" value={e.until} onInput={set('until')} />
                    {!e.until && <small class="hint">Empty means about three months</small>}
                  </div>
                )}
              </div>
              <StaffPicker label="Staff" staff={refs.staff} chosen={e.staff} onToggle={(id) => onChange({ staff: toggleIn(e.staff, id) })} />
              {e.entries.length > 0 && (
                <fieldset class="cp-fieldset">
                  <legend>Hours worked</legend>
                  <HoursRows e={e} staff={refs.staff} onChange={onChange} />
                  <small class="hint">{e.date && e.date < today() ? 'Saved with the job, and the job is marked as done.' : 'Saved with the job.'}</small>
                </fieldset>
              )}
              <Notes e={e} onChange={onChange} />
            </>
          )}

          {kind === 'update_job' && (
            <>
              <JobLine job={job} />
              <div class="form-3">
                <div class="field"><label>New date</label><input type="date" value={e.date} onInput={set('date')} /><small class="hint">{job ? `Now ${job.date}` : ''}</small></div>
                <div class="field"><label>New start</label><input type="time" step="900" value={e.start} onInput={set('start')} /><small class="hint">{job ? `Now ${job.startTime}` : ''}</small></div>
                <div class="field"><label>Hours</label><input type="text" inputMode="decimal" value={e.hours} onInput={set('hours')} /></div>
              </div>
              <StaffPicker label="Add staff" staff={refs.staff.filter((p) => !job?.staff.includes(p.id))} chosen={e.staff} onToggle={(id) => onChange({ staff: toggleIn(e.staff, id) })} />
              {job?.staff.length > 0 && (
                <StaffPicker label="Take off the job" staff={refs.staff.filter((p) => job.staff.includes(p.id))} chosen={e.remove_staff} onToggle={(id) => onChange({ remove_staff: toggleIn(e.remove_staff, id) })} />
              )}
              <Notes e={e} onChange={onChange} addTo />
            </>
          )}

          {kind === 'cancel_jobs' && (
            <fieldset class="cp-fieldset">
              <legend>Jobs to cancel</legend>
              {e.job_ids.length === 0 && Object.keys(jobs).length === 0 && <p class="muted">The assistant found no matching jobs. Cancel them in the planner.</p>}
              {[...new Set([...a.job_ids, ...e.job_ids])].map((id) => (
                <label class="cp-check">
                  <input type="checkbox" checked={e.job_ids.includes(id)} onChange={() => onChange({ job_ids: toggleIn(e.job_ids, id) })} />
                  {jobs[id] ? `${jobs[id].date} ${jobs[id].startTime} · ${jobLabel(jobs[id])}` : id}
                </label>
              ))}
            </fieldset>
          )}

          {kind === 'mark_done' && (
            <>
              <JobLine job={job} />
              <div class="field"><label>Internal note</label><input type="text" value={e.internal_note} onInput={set('internal_note')} /></div>
            </>
          )}

          {kind === 'report_hours' && (
            <>
              <JobLine job={job} empty="Not linked to a job" />
              <div class="field"><label>Date</label><input type="date" value={e.date} onInput={set('date')} /></div>
              <HoursRows e={e} staff={refs.staff} onChange={onChange} />
            </>
          )}

          {kind === 'add_absence' && (
            <div class="form-3">
              <div class="field">
                <label>Person</label>
                <select value={e.absence.profile_id} onChange={(ev) => onChange({ absence: { ...e.absence, profile_id: ev.currentTarget.value } })}>
                  <option value="">Choose person</option>
                  {refs.staff.map((p) => <option value={p.id}>{p.full_name}</option>)}
                </select>
              </div>
              <div class="field">
                <label>Type</label>
                <select value={e.absence.kind} onChange={(ev) => onChange({ absence: { ...e.absence, kind: ev.currentTarget.value } })}>
                  {Object.entries(ABSENCE_KIND).map(([k, v]) => <option value={k}>{v}</option>)}
                </select>
              </div>
              <div class="field">
                <label>From and to</label>
                <span class="as-pair">
                  <input type="date" aria-label="From" value={e.absence.from} onInput={(ev) => onChange({ absence: { ...e.absence, from: ev.currentTarget.value } })} />
                  <input type="date" aria-label="To" value={e.absence.to} onInput={(ev) => onChange({ absence: { ...e.absence, to: ev.currentTarget.value } })} />
                </span>
              </div>
            </div>
          )}

          {kind === 'create_invoice' && (
            <InvoiceFields e={e} job={job} products={refs.products} company={refs.customers.find((c) => c.id === e.customer_id)?.kind === 'company' || e.new_customer?.kind === 'company'} onChange={onChange} />
          )}

          {kind === 'follow_up' && (
            <div class="field">
              <label>To-do for the inbox</label>
              <input type="text" value={e.title} onInput={set('title')} />
              <small class="hint">Saved in the inbox with the questions above, so you can call or reply.</small>
            </div>
          )}
        </div>
      )}
      {card.message && (
        <p class={`msg ${card.status === 'done' ? 'msg--ok' : 'msg--error'}`}>
          {card.message} {card.link && <a href={card.link}>{card.linkText}</a>}
        </p>
      )}
      {done && kind === 'create_job' && e.staff.length > 0 && <small class="muted">Booked: {e.staff.map(staffName).join(', ')}</small>}
    </article>
  );
}

const toNum = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/** Fakturautkastet: rader med priser exklusive moms, RUT och summor. Sparas som utkast. */
function InvoiceFields({ e, job, products, company, onChange }) {
  const inv = e.invoice;
  const setInv = (patch) => onChange({ invoice: { ...inv, ...patch } });
  const setLine = (i, patch) => setInv({ lines: inv.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const addProduct = (id) => {
    const p = products.find((x) => x.id === id);
    if (p) setInv({ lines: [...inv.lines, { text: p.name, qty: '1', unit: p.unit, price: String(p.price), vat: Number(p.vat), rut: p.rut && !company }] });
  };
  const rutPersons = company ? 0 : Number(inv.rut_persons) || 0;
  const t = totals(inv.lines.map((l) => ({ qty: toNum(l.qty), price: toNum(l.price), vat: Number(l.vat ?? 25), rut: !company && l.rut })), rutPersons);
  return (
    <>
      {job && <JobLine job={job} />}
      <div class="form-3">
        <div class="field">
          <label>Work done (date)</label>
          <input type="date" value={inv.delivery_date} onInput={(ev) => setInv({ delivery_date: ev.currentTarget.value })} />
        </div>
        <div class="field">
          <label>Their reference</label>
          <input type="text" maxLength={100} value={inv.your_ref} onInput={(ev) => setInv({ your_ref: ev.currentTarget.value })} />
        </div>
        {!company && (
          <div class="field">
            <label>RUT deduction</label>
            <select value={inv.rut_persons} onChange={(ev) => setInv({ rut_persons: Number(ev.currentTarget.value) })}>
              <option value={0}>No RUT</option>
              <option value={1}>RUT for one person</option>
              <option value={2}>RUT for two people</option>
            </select>
          </div>
        )}
      </div>
      <fieldset class="cp-fieldset">
        <legend>Lines (prices excl. VAT)</legend>
        {inv.lines.map((l, i) => (
          <div class="as-inv-line">
            <input type="text" aria-label="Description" value={l.text} onInput={(ev) => setLine(i, { text: ev.currentTarget.value })} />
            <input type="text" inputMode="decimal" aria-label="Quantity" value={l.qty} onInput={(ev) => setLine(i, { qty: ev.currentTarget.value })} />
            <select aria-label="Unit" value={l.unit} onChange={(ev) => setLine(i, { unit: ev.currentTarget.value })}>
              {['st', 'tim', 'kvm', 'km'].map((u) => <option>{u}</option>)}
            </select>
            <input type="text" inputMode="decimal" aria-label="Unit price excl. VAT" value={l.price} onInput={(ev) => setLine(i, { price: ev.currentTarget.value })} />
            {!company && (
              <label class="cp-check">
                <input type="checkbox" checked={!!l.rut} onChange={(ev) => setLine(i, { rut: ev.currentTarget.checked })} /> RUT
              </label>
            )}
            <span class="as-inv-sum">{formatMoney(t.rows[i]?.net)}</span>
            <button class="st-link" type="button" aria-label="Remove the line" onClick={() => setInv({ lines: inv.lines.filter((_, j) => j !== i) })}>Remove</button>
          </div>
        ))}
        <div class="cp-actions">
          <button class="st-link" type="button" onClick={() => setInv({ lines: [...inv.lines, { text: '', qty: '1', unit: 'st', price: '', vat: 25, rut: false }] })}>Add line</button>
          {products.length > 0 && (
            <select aria-label="Add a product" value="" onChange={(ev) => addProduct(ev.currentTarget.value)}>
              <option value="">Add a product …</option>
              {products.map((p) => <option value={p.id}>{p.name} · {formatMoney(Number(p.price))}/{p.unit}</option>)}
            </select>
          )}
        </div>
        <p class="as-inv-total">
          Total {formatKrWhole(t.total)} incl. VAT{t.rut ? ` · RUT ${formatKrWhole(t.rut)}` : ''} · <strong>to pay {formatKrWhole(t.toPay)}</strong>
        </p>
      </fieldset>
      <div class="field">
        <label>Message on the invoice (Swedish, optional)</label>
        <input type="text" maxLength={500} value={inv.message} onInput={(ev) => setInv({ message: ev.currentTarget.value })} />
      </div>
      <small class="hint">Saved as a draft. You add personal identity numbers for RUT and send it from Invoices.</small>
    </>
  );
}

/** Timmar per person: en rad per person. */
function HoursRows({ e, staff, onChange }) {
  const setEntry = (i, patch) => onChange({ entries: e.entries.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <>
      {e.entries.map((entry, i) => (
        <div class="as-pair as-hours">
          <select aria-label="Person" value={entry.profile_id} onChange={(ev) => setEntry(i, { profile_id: ev.currentTarget.value })}>
            <option value="">Choose person</option>
            {staff.map((p) => <option value={p.id}>{p.full_name}</option>)}
          </select>
          <input type="text" inputMode="decimal" aria-label="Hours" value={entry.hours} onInput={(ev) => setEntry(i, { hours: ev.currentTarget.value })} />
          <small>h</small>
        </div>
      ))}
      <button class="st-link" type="button" onClick={() => onChange({ entries: [...e.entries, { profile_id: '', hours: '', note: '' }] })}>Add person</button>
    </>
  );
}

function CustomerField({ e, customers, onChange }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? customers.filter((c) => [c.name, c.phone, c.street].some((v) => v?.toLowerCase().includes(s))) : customers;
    // Listan visar högst 200 kunder; den valda kunden ska alltid finnas med.
    const top = list.slice(0, 200);
    const current = customers.find((c) => c.id === e.customer_id);
    return current && !top.includes(current) ? [current, ...top] : top;
  }, [q, customers, e.customer_id]);
  const isNew = !e.customer_id;
  return (
    <div class="form-2">
      <div class="field">
        <label>Customer</label>
        <input type="search" placeholder="Search customer" aria-label="Search customer" value={q} onInput={(ev) => setQ(ev.currentTarget.value)} />
        <select aria-label="Customer" value={e.customer_id} onChange={(ev) => onChange({ customer_id: ev.currentTarget.value })}>
          <option value="">{e.new_customer?.name ? `New customer: ${e.new_customer.name}` : 'No customer'}</option>
          {shown.map((c) => <option value={c.id}>{c.name}{c.street ? `, ${c.street}` : ''}</option>)}
        </select>
      </div>
      {isNew && (
        <div class="field">
          <label>New customer name</label>
          <input type="text" value={e.new_customer?.name ?? ''} onInput={(ev) => onChange({ new_customer: { kind: 'private', phone: null, email: null, contact_person: null, notes: null, ...(e.new_customer ?? {}), name: ev.currentTarget.value } })} placeholder="Leave empty for no customer" />
          {e.new_customer?.name && (
            <small class="hint">
              {e.new_customer.kind === 'company' ? 'Company' : 'Private'}
              {e.new_customer.phone ? ` · ${e.new_customer.phone}` : ''}
              {e.new_customer.contact_person ? ` · contact ${e.new_customer.contact_person}` : ''}. Created when you save.
            </small>
          )}
        </div>
      )}
    </div>
  );
}

function StaffPicker({ label, staff, chosen, onToggle }) {
  if (!staff.length) return null;
  return (
    <fieldset class="cp-fieldset">
      <legend>{label}</legend>
      <div class="cp-checks">
        {staff.map((p) => (
          <label class="cp-check">
            <input type="checkbox" checked={chosen.includes(p.id)} onChange={() => onToggle(p.id)} />
            <span class="dot" style={`background:${p.color}`} /> {p.full_name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Notes({ e, onChange, addTo = false }) {
  return (
    <div class="form-2">
      <div class="field">
        <label>{addTo ? 'Add to the note for staff' : 'Note for staff (Swedish)'}</label>
        <textarea rows={2} value={e.staff_note} onInput={(ev) => onChange({ staff_note: ev.currentTarget.value })} />
      </div>
      <div class="field">
        <label>{addTo ? 'Add to the internal note' : 'Internal note'}</label>
        <textarea rows={2} value={e.internal_note} onInput={(ev) => onChange({ internal_note: ev.currentTarget.value })} />
      </div>
    </div>
  );
}

function JobLine({ job, empty = 'No matching job found. Change it in the planner instead.' }) {
  if (!job) return <p class="muted">{empty}</p>;
  return (
    <p class="as-job">
      <strong>{job.date} {job.startTime} to {job.endTime}</strong> · {jobLabel(job)} · {SERVICE_LABELS[job.service]}
      {job.street ? ` · ${job.street}` : ''}{' '}
      <a href={`/admin/planering?jobb=${job.id}`} target="_blank" rel="noopener">Open</a>
    </p>
  );
}

function WhatsAppSetup() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  async function load(ev) {
    if (!ev.currentTarget.open || info) return;
    try {
      setInfo(await whatsappSetup());
    } catch (e) {
      setError(e.message);
    }
  }
  const copy = async (key, value) => setCopied((await copyText(value)) ? key : '');
  const yes = (v) => (v ? 'Added' : 'Missing');
  return (
    <details class="cp-panel as-setup" onToggle={load}>
      <summary><strong>WhatsApp and AI setup</strong></summary>
      <ErrorMsg error={error} />
      {!info && !error && <p class="muted">Loading …</p>}
      {info && (
        <dl class="cp-dl">
          <dt>AI key (ANTHROPIC_API_KEY)</dt><dd>{yes(info.ai_key)}</dd>
          <dt>Webhook URL (Meta)</dt>
          <dd><code>{info.webhook_url}</code> <button class="st-link" type="button" onClick={() => copy('url', info.webhook_url)}>{copied === 'url' ? 'Copied' : 'Copy'}</button></dd>
          <dt>Verify token</dt>
          <dd><code>{info.verify_token}</code> <button class="st-link" type="button" onClick={() => copy('token', info.verify_token)}>{copied === 'token' ? 'Copied' : 'Copy'}</button></dd>
          <dt>Webhook URL (provider without app secret)</dt>
          <dd><code style="word-break:break-all">{info.webhook_url_with_key}</code> <button class="st-link" type="button" onClick={() => copy('key', info.webhook_url_with_key)}>{copied === 'key' ? 'Copied' : 'Copy'}</button></dd>
          <dt>WHATSAPP_TOKEN</dt><dd>{yes(info.meta.token)}</dd>
          <dt>WHATSAPP_PHONE_NUMBER_ID</dt><dd>{yes(info.meta.phone_number_id)}</dd>
          <dt>WHATSAPP_APP_SECRET</dt><dd>{yes(info.meta.app_secret)}</dd>
          <dt>WHATSAPP_D360_KEY (360dialog)</dt><dd>{yes(info.provider_360dialog)}</dd>
          <dt>Messages received</dt><dd>{info.messages_received}</dd>
        </dl>
      )}
      <p class="muted">Staff and admins are recognised by the mobile number saved under Staff. Add everyone's number there in the form 07x xxx xx xx.</p>
    </details>
  );
}
