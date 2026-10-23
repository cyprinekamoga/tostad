// Offerter: skapa, skicka länk, se när kunden har öppnat och svarat, och gör faktura av accepterade.
import { useEffect, useState } from 'preact/hooks';
import { supabase, formatDateTime } from '../../lib/supabase.js';
import { formatKrWhole } from '../../lib/money.js';
import { ErrorMsg, Modal } from '../ui.jsx';
import { SERVICE_LABELS } from './jobs.js';
import { QUOTE_STATUS, loadQuotes, saveQuote, sendQuote, deleteDraft, loadSettings, loadCustomers, companyFor, docUrl, messageFor, quoteFromSubmission } from './docs.js';
import DocEditor from './DocEditor.jsx';
import SendBox from './SendBox.jsx';

const FILTERS = [
  ['aktiva', 'Active'],
  ['accepterad', 'Accepted'],
  ['alla', 'All'],
];
const BADGE = { utkast: 'badge--muted', skickad: '', oppnad: 'badge--ny', accepterad: '', avbojd: 'badge--skadeanmalan' };

export default function Quotes() {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('aktiva');
  const [customers, setCustomers] = useState([]);
  const [settings, setSettings] = useState(null);
  const [editing, setEditing] = useState(null);
  const [sending, setSending] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      setRows(await loadQuotes());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
    loadCustomers().then(setCustomers);
    loadSettings().then(setSettings);
    const from = new URLSearchParams(window.location.search).get('fran');
    if (from) {
      supabase()
        .from('submissions')
        .select('id, kind, name, email, phone, data, customer_id')
        .eq('id', from)
        .maybeSingle()
        .then(({ data }) => data && setEditing(quoteFromSubmission(data)));
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  async function save(values) {
    const saved = await saveQuote(values);
    setEditing(null);
    await load();
    return saved;
  }

  async function send(q) {
    setError('');
    try {
      const sent = await sendQuote(q, settings?.quote_days ?? 30);
      setSending(sent);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(q) {
    if (!window.confirm(`Remove the draft of quote ${q.number}?`)) return;
    try {
      await deleteDraft('quotes', q.id);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  const shown = (rows ?? []).filter((q) => (filter === 'alla' ? true : filter === 'accepterad' ? q.status === 'accepterad' : ['utkast', 'skickad', 'oppnad'].includes(q.status)));

  return (
    <>
      <div class="cp-head">
        <h2>Quotes</h2>
        <button class="btn btn--sm" type="button" onClick={() => setEditing({ service: 'hemstadning', rut_persons: 1, buyer: {}, lines: [] })}>New quote</button>
      </div>
      <div class="cp-tabs" role="group" aria-label="Filter" style="margin-bottom:14px">
        {FILTERS.map(([k, l]) => <button type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      <ErrorMsg error={error} />
      <div class="cp-panel">
        {rows === null && <p class="muted">Loading …</p>}
        {rows && shown.length === 0 && <p class="cp-empty">No quotes here.</p>}
        <ul class="cp-list">
          {shown.map((q) => (
            <li class="cp-row cp-row--static">
              <span class="cp-row-top">
                <strong>Quote {q.number} · {q.buyer?.name || 'No name'}</strong>
                <span class={`badge ${BADGE[q.status]}`}>{QUOTE_STATUS[q.status]}</span>
              </span>
              <p>
                {SERVICE_LABELS[q.service]} · {formatKrWhole(q.to_pay)}
                {Number(q.rut) !== 0 && ' after RUT'}
                {q.wanted_date && ` · wanted ${q.wanted_date}`}
              </p>
              <small>
                {q.sent_at ? `Sent ${formatDateTime(q.sent_at)}` : `Created ${formatDateTime(q.created_at)}`}
                {q.opened_at && ` · opened ${formatDateTime(q.opened_at)}`}
                {q.decided_at && ` · ${q.status === 'accepterad' ? 'accepted' : 'declined'} ${formatDateTime(q.decided_at)}${q.decided_name ? ` by ${q.decided_name}` : ''}`}
                {q.valid_until && q.status !== 'accepterad' && ` · valid until ${q.valid_until}`}
              </small>
              <span class="cp-actions">
                {q.status !== 'accepterad' && <button class="btn btn--ghost btn--sm" type="button" onClick={() => setEditing(q)}>Edit</button>}
                {['utkast', 'skickad', 'oppnad'].includes(q.status) && (
                  <button class="btn btn--sm" type="button" onClick={() => send(q)}>{q.status === 'utkast' ? 'Send' : 'Send again'}</button>
                )}
                {q.status !== 'utkast' && <a class="btn btn--ghost btn--sm" href={docUrl(q.token)} target="_blank" rel="noopener">View</a>}
                {q.status === 'accepterad' && <a class="btn btn--sm" href={`/admin/fakturor?offert=${q.id}`}>Create invoice</a>}
                {q.status === 'accepterad' && <a class="btn btn--ghost btn--sm" href="/admin/inkorg">The booking in the inbox</a>}
                {q.status === 'utkast' && <button class="btn btn--danger btn--sm" type="button" onClick={() => remove(q)}>Remove</button>}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p class="muted" style="margin-top:12px">When the customer accepts a quote, it lands as a booking in the inbox, where you turn it into a job with one click. Quotes are sent to customers in Swedish.</p>

      <Modal open={!!editing} label="Quote" onClose={() => setEditing(null)}>
        {editing && <DocEditor type="offert" value={editing} customers={customers} company={companyFor(settings)} onSave={save} onCancel={() => setEditing(null)} />}
      </Modal>
      <Modal open={!!sending} label="Send the quote" onClose={() => setSending(null)}>
        {sending && (
          <SendBox
            title={`Quote ${sending.number} is ready to send`}
            intro="Send the link to the customer. There the customer can read the quote, save it as a PDF and accept it right away. You see here when it has been opened."
            url={docUrl(sending.token)}
            text={messageFor('offert', sending, docUrl(sending.token))}
            subject={`Offert ${sending.number} från TO Städ & Flytt`}
            email={sending.buyer?.email}
            phone={sending.buyer?.phone}
            onClose={() => setSending(null)}
          />
        )}
      </Modal>
    </>
  );
}
