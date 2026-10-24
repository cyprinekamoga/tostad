// Fakturor: utkast, skicka med nummer och OCR, betalningar, påminnelser, kreditfakturor och RUT-status.
import { useEffect, useState } from 'preact/hooks';
import { formatDateTime } from '../../lib/supabase.js';
import { today } from '../../lib/planner.js';
import { formatKrWhole, formatMoney } from '../../lib/money.js';
import { searchInvoices, ocrQuery, formatOcr } from '../../lib/invoiceSearch.js';
import { ErrorMsg, Modal } from '../ui.jsx';
import {
  INVOICE_STATUS,
  RUT_STATUS,
  loadInvoices,
  invoiceByOcr,
  saveInvoice,
  finalizeInvoice,
  creditInvoice,
  updateInvoice,
  deleteDraft,
  loadSettings,
  loadCustomers,
  companyFor,
  docUrl,
  messageFor,
  isOverdue,
  invoiceFromJob,
  invoiceFromQuote,
} from './docs.js';
import { supabase } from '../../lib/supabase.js';
import DocEditor from './DocEditor.jsx';
import SendBox from './SendBox.jsx';

const FILTERS = [
  ['obetalda', 'Unpaid'],
  ['forfallna', 'Overdue'],
  ['utkast', 'Drafts'],
  ['betalda', 'Paid'],
  ['alla', 'All'],
];

const match = {
  obetalda: (i) => i.status === 'skickad' && i.kind === 'faktura',
  forfallna: (i) => isOverdue(i),
  utkast: (i) => i.status === 'utkast',
  betalda: (i) => i.status === 'betald',
  alla: () => true,
};

export default function Invoices() {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('obetalda');
  const [query, setQuery] = useState('');
  const [extra, setExtra] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [settings, setSettings] = useState(null);
  const [editing, setEditing] = useState(null);
  const [sending, setSending] = useState(null);
  const [paying, setPaying] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      setRows(await loadInvoices());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
    loadCustomers().then(setCustomers);
    loadSettings().then(setSettings);
    const params = new URLSearchParams(window.location.search);
    if (params.get('q')) setQuery(params.get('q'));
    if (params.get('jobb')) invoiceFromJob(params.get('jobb')).then((draft) => draft && setEditing(draft));
    if (params.get('offert'))
      supabase().from('quotes').select('*').eq('id', params.get('offert')).maybeSingle().then(({ data }) => data && setEditing(invoiceFromQuote(data)));
    if (params.toString()) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  async function run(key, fn) {
    setBusy(key);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    }
    setBusy('');
  }

  async function save(values, people) {
    await saveInvoice(values, people);
    setEditing(null);
    setFilter('utkast');
    await load();
  }

  const send = (inv) =>
    run(inv.id, async () => {
      if (!settings?.bankgiro) throw new Error('Add the bankgiro number under Settings before you send invoices.');
      if (!window.confirm('When the invoice is sent it gets a number and OCR and can no longer be changed. Continue?')) return;
      const sent = await finalizeInvoice(inv.id);
      setSending({ inv: sent, reminder: false });
      setFilter('obetalda');
    });

  const remind = (inv) =>
    run(inv.id, async () => {
      const updated = await updateInvoice(inv.id, { reminder_count: inv.reminder_count + 1, last_reminder_at: new Date().toISOString() });
      setSending({ inv: updated, reminder: true });
    });

  const credit = (inv) => {
    const reason = window.prompt(`Credit the whole invoice ${inv.number}? Write the reason if you like (shown on the credit note, in Swedish).`, '');
    if (reason === null) return;
    run(inv.id, async () => {
      await creditInvoice(inv.id, reason);
    });
  };

  const unpay = (inv) => run(inv.id, () => updateInvoice(inv.id, { status: 'skickad', paid_at: null, paid_amount: null }));

  // Sökningen gäller alla fakturor, oavsett filter. Bästa träffen först.
  const searching = !!query.trim();
  const found = searchInvoices(searching ? rows ?? [] : (rows ?? []).filter(match[filter]), query);
  const shown = extra ? [...found, extra] : found;

  // Ett OCR-nummer som inte finns bland de hämtade fakturorna slås upp i databasen.
  useEffect(() => {
    setExtra(null);
    const ocr = ocrQuery(query);
    if (!ocr || !rows || found.length) return;
    invoiceByOcr(ocr).then((inv) => setExtra(inv ?? false));
  }, [query, rows]);
  const sum = shown.filter((i) => i.status !== 'utkast').reduce((s, i) => s + Number(i.to_pay), 0);

  return (
    <>
      <div class="cp-head">
        <h2>Invoices</h2>
        <button class="btn btn--sm" type="button" onClick={() => setEditing({ buyer: {}, lines: [], rut_persons: 1, delivery_date: today() })}>New invoice</button>
      </div>
      {settings && !settings.bankgiro && (
        <p class="msg msg--error">The bankgiro number is missing. <a href="/admin/installningar">Add it under Settings</a> before you send the first invoice.</p>
      )}
      <div class="inv-tools">
        <label class="visually-hidden" for="inv-search">Search invoices</label>
        <input id="inv-search" type="search" placeholder="Search by OCR number, invoice number, amount or name" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
      </div>
      <div class="cp-tabs" role="group" aria-label="Filter" style="margin-bottom:14px" hidden={searching}>
        {FILTERS.map(([k, l]) => (
          <button type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {l}
            {k === 'forfallna' && rows && rows.filter(isOverdue).length > 0 && <span class="count" style="margin-left:6px">{rows.filter(isOverdue).length}</span>}
          </button>
        ))}
      </div>
      <ErrorMsg error={error} />
      <div class="cp-panel">
        {rows === null && <p class="muted">Loading …</p>}
        {rows && shown.length === 0 && <p class="cp-empty">{searching ? (extra === false ? 'No invoice has that OCR number.' : 'No invoice matches the search.') : 'No invoices here.'}</p>}
        {searching && shown.length > 0 && <p class="muted" style="margin-top:0">{shown.length === 1 ? '1 invoice found' : `${shown.length} invoices found`}, searched among all invoices.</p>}
        <ul class="cp-list">
          {shown.map((inv) => {
            const overdue = isOverdue(inv);
            const kredit = inv.kind === 'kredit';
            return (
              <li class={`cp-row cp-row--static${searching && inv.ocr && inv.ocr === ocrQuery(query) ? ' inv-hit' : ''}`}>
                <span class="cp-row-top">
                  <strong>
                    {kredit ? 'Credit note' : 'Invoice'} {inv.number ?? '(draft)'} · {inv.buyer?.name || 'No name'}
                  </strong>
                  <span>
                    {overdue && <span class="badge badge--skadeanmalan">Overdue</span>}{' '}
                    <span class={`badge ${inv.status === 'utkast' || inv.status === 'krediterad' ? 'badge--muted' : inv.status === 'skickad' ? 'badge--ny' : ''}`}>
                      {kredit && inv.status === 'skickad' ? 'Sent' : INVOICE_STATUS[inv.status]}
                    </span>
                  </span>
                </span>
                <p>
                  <strong>{formatKrWhole(inv.to_pay)}</strong>
                  {Number(inv.rut) !== 0 && ` (RUT ${formatMoney(inv.rut)})`}
                  {inv.due_date && !kredit && ` · due ${inv.due_date}`}
                  {inv.ocr && <> · OCR <strong class="inv-ocr">{formatOcr(inv.ocr)}</strong></>}
                </p>
                <small>
                  {inv.sent_at ? `Sent ${formatDateTime(inv.sent_at)}` : `Created ${formatDateTime(inv.created_at)}`}
                  {inv.paid_at && ` · paid ${inv.paid_at}${inv.paid_amount != null && Number(inv.paid_amount) !== Number(inv.to_pay) ? ` (${formatKrWhole(inv.paid_amount)})` : ''}`}
                  {inv.reminder_count > 0 && ` · ${inv.reminder_count} reminder${inv.reminder_count > 1 ? 's' : ''}, latest ${formatDateTime(inv.last_reminder_at)}`}
                </small>
                <span class="cp-actions">
                  {inv.status === 'utkast' && (
                    <>
                      <button class="btn btn--ghost btn--sm" type="button" onClick={() => setEditing(inv)}>Edit</button>
                      <button class="btn btn--sm" type="button" disabled={busy === inv.id} onClick={() => send(inv)}>Send</button>
                      <button class="btn btn--danger btn--sm" type="button" disabled={busy === inv.id} onClick={() => window.confirm('Remove the draft?') && run(inv.id, () => deleteDraft('invoices', inv.id))}>Remove</button>
                    </>
                  )}
                  {inv.status !== 'utkast' && <a class="btn btn--ghost btn--sm" href={docUrl(inv.token)} target="_blank" rel="noopener">View</a>}
                  {inv.status === 'skickad' && !kredit && (
                    <>
                      <button class="btn btn--sm" type="button" onClick={() => setPaying(inv)}>Mark as paid</button>
                      <button class="btn btn--ghost btn--sm" type="button" onClick={() => setSending({ inv, reminder: false })}>Send again</button>
                      {overdue && <button class="btn btn--ghost btn--sm" type="button" disabled={busy === inv.id} onClick={() => remind(inv)}>Reminder</button>}
                    </>
                  )}
                  {inv.status === 'betald' && <button class="btn btn--ghost btn--sm" type="button" disabled={busy === inv.id} onClick={() => unpay(inv)}>Undo paid</button>}
                  {['skickad', 'betald'].includes(inv.status) && !kredit && (
                    <button class="btn btn--ghost btn--sm" type="button" disabled={busy === inv.id} onClick={() => credit(inv)}>Credit</button>
                  )}
                  {kredit && inv.status === 'skickad' && <button class="btn btn--ghost btn--sm" type="button" onClick={() => setSending({ inv, reminder: false })}>Send</button>}
                  {inv.status !== 'utkast' && !kredit && inv.rut_status !== 'ej_aktuell' && Number(inv.rut) > 0 && (
                    <a class={`badge ${inv.rut_status === 'ej_ansokt' && inv.status === 'betald' ? 'badge--ny' : ''}`} href={`/admin/rut?q=${inv.number}`} title="Open in the RUT tracker">
                      RUT: {RUT_STATUS[inv.rut_status]}
                    </a>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {shown.length > 0 && filter !== 'utkast' && <p class="muted" style="margin:12px 0 0">Total to pay: <strong>{formatKrWhole(sum)}</strong></p>}
      </div>

      <Modal open={!!editing} label="Invoice" onClose={() => setEditing(null)}>
        {editing && <DocEditor type="faktura" value={editing} customers={customers} company={companyFor(settings)} onSave={save} onCancel={() => setEditing(null)} />}
      </Modal>
      <Modal open={!!sending} label="Send the invoice" onClose={() => setSending(null)}>
        {sending && (
          <SendBox
            title={sending.reminder ? `Reminder for invoice ${sending.inv.number}` : `${sending.inv.kind === 'kredit' ? 'Credit note' : 'Invoice'} ${sending.inv.number} is sent`}
            intro={sending.reminder ? 'No reminder fee is charged. Send the text to the customer.' : 'The invoice has a number and OCR. Send the link to the customer; the invoice is there as a PDF.'}
            url={docUrl(sending.inv.token)}
            text={messageFor('faktura', sending.inv, docUrl(sending.inv.token), sending.reminder)}
            subject={`${sending.reminder ? 'Påminnelse: faktura' : 'Faktura'} ${sending.inv.number} från TO Städ & Flytt`}
            email={sending.inv.buyer?.email}
            phone={sending.inv.buyer?.phone}
            onClose={() => setSending(null)}
          />
        )}
      </Modal>
      <Modal open={!!paying} label="Payment" onClose={() => setPaying(null)}>
        {paying && <PayForm inv={paying} onDone={() => { setPaying(null); load(); }} />}
      </Modal>
    </>
  );
}

function PayForm({ inv, onDone }) {
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState(String(Math.round(Number(inv.to_pay))));
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    try {
      await updateInvoice(inv.id, { status: 'betald', paid_at: date, paid_amount: Number(amount.replace(/\s/g, '').replace(',', '.')) || 0 });
      onDone();
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <form onSubmit={submit}>
      <h3>Payment for invoice {inv.number}</h3>
      <div class="form-2">
        <div class="field">
          <label for="p-date">Payment date</label>
          <input id="p-date" type="date" required value={date} onInput={(e) => setDate(e.currentTarget.value)} />
        </div>
        <div class="field">
          <label for="p-amount">Amount (kr)</label>
          <input id="p-amount" type="text" inputmode="decimal" required value={amount} onInput={(e) => setAmount(e.currentTarget.value)} />
        </div>
      </div>
      {Number(inv.rut) !== 0 && <p class="muted">When the customer has paid, you can apply for the RUT payout from Skatteverket. Then change the RUT status on the invoice.</p>}
      <ErrorMsg error={error} />
      <div class="cp-actions">
        <button class="btn" type="submit">Save</button>
        <button class="btn btn--ghost" type="button" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}
