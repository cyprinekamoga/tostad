// Fakturor: utkast, skicka med nummer och OCR, betalningar, påminnelser, kreditfakturor och RUT-status.
import { useEffect, useState } from 'preact/hooks';
import { formatDateTime } from '../../lib/supabase.js';
import { today } from '../../lib/planner.js';
import { formatKrWhole, formatMoney } from '../../lib/money.js';
import { ErrorMsg, Modal } from '../ui.jsx';
import {
  INVOICE_STATUS,
  RUT_STATUS,
  loadInvoices,
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
  ['obetalda', 'Obetalda'],
  ['forfallna', 'Förfallna'],
  ['utkast', 'Utkast'],
  ['betalda', 'Betalda'],
  ['alla', 'Alla'],
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
      if (!settings?.bankgiro) throw new Error('Lägg in bankgironumret under Inställningar innan du skickar fakturor.');
      if (!window.confirm('När fakturan skickas får den nummer och OCR och kan inte längre ändras. Fortsätta?')) return;
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
    const reason = window.prompt(`Kreditera hela faktura ${inv.number}? Skriv gärna orsaken (visas på kreditfakturan).`, '');
    if (reason === null) return;
    run(inv.id, async () => {
      await creditInvoice(inv.id, reason);
    });
  };

  const unpay = (inv) => run(inv.id, () => updateInvoice(inv.id, { status: 'skickad', paid_at: null, paid_amount: null }));
  const setRut = (inv, rut_status) => run(inv.id, () => updateInvoice(inv.id, { rut_status }));

  const shown = (rows ?? []).filter(match[filter]);
  const sum = shown.filter((i) => i.status !== 'utkast').reduce((s, i) => s + Number(i.to_pay), 0);

  return (
    <>
      <div class="cp-head">
        <h2>Fakturor</h2>
        <button class="btn btn--sm" type="button" onClick={() => setEditing({ buyer: {}, lines: [], rut_persons: 1, delivery_date: today() })}>Ny faktura</button>
      </div>
      {settings && !settings.bankgiro && (
        <p class="msg msg--error">Bankgironumret saknas. <a href="/admin/installningar">Lägg in det under Inställningar</a> innan du skickar den första fakturan.</p>
      )}
      <div class="cp-tabs" role="group" aria-label="Filter" style="margin-bottom:14px">
        {FILTERS.map(([k, l]) => (
          <button type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {l}
            {k === 'forfallna' && rows && rows.filter(isOverdue).length > 0 && <span class="count" style="margin-left:6px">{rows.filter(isOverdue).length}</span>}
          </button>
        ))}
      </div>
      <ErrorMsg error={error} />
      <div class="cp-panel">
        {rows === null && <p class="muted">Laddar …</p>}
        {rows && shown.length === 0 && <p class="cp-empty">Inga fakturor här.</p>}
        <ul class="cp-list">
          {shown.map((inv) => {
            const overdue = isOverdue(inv);
            const kredit = inv.kind === 'kredit';
            return (
              <li class="cp-row cp-row--static">
                <span class="cp-row-top">
                  <strong>
                    {kredit ? 'Kreditfaktura' : 'Faktura'} {inv.number ?? '(utkast)'} · {inv.buyer?.name || 'Utan namn'}
                  </strong>
                  <span>
                    {overdue && <span class="badge badge--skadeanmalan">Förfallen</span>}{' '}
                    <span class={`badge ${inv.status === 'utkast' || inv.status === 'krediterad' ? 'badge--muted' : inv.status === 'skickad' ? 'badge--ny' : ''}`}>
                      {kredit && inv.status === 'skickad' ? 'Skickad' : INVOICE_STATUS[inv.status]}
                    </span>
                  </span>
                </span>
                <p>
                  <strong>{formatKrWhole(inv.to_pay)}</strong>
                  {Number(inv.rut) !== 0 && ` (RUT ${formatMoney(inv.rut)})`}
                  {inv.due_date && !kredit && ` · förfaller ${inv.due_date}`}
                  {inv.ocr && ` · OCR ${inv.ocr}`}
                </p>
                <small>
                  {inv.sent_at ? `Skickad ${formatDateTime(inv.sent_at)}` : `Skapad ${formatDateTime(inv.created_at)}`}
                  {inv.paid_at && ` · betald ${inv.paid_at}${inv.paid_amount != null && Number(inv.paid_amount) !== Number(inv.to_pay) ? ` (${formatKrWhole(inv.paid_amount)})` : ''}`}
                  {inv.reminder_count > 0 && ` · ${inv.reminder_count} påminnelse${inv.reminder_count > 1 ? 'r' : ''}, senast ${formatDateTime(inv.last_reminder_at)}`}
                </small>
                <span class="cp-actions">
                  {inv.status === 'utkast' && (
                    <>
                      <button class="btn btn--ghost btn--sm" type="button" onClick={() => setEditing(inv)}>Ändra</button>
                      <button class="btn btn--sm" type="button" disabled={busy === inv.id} onClick={() => send(inv)}>Skicka</button>
                      <button class="btn btn--danger btn--sm" type="button" disabled={busy === inv.id} onClick={() => window.confirm('Ta bort utkastet?') && run(inv.id, () => deleteDraft('invoices', inv.id))}>Ta bort</button>
                    </>
                  )}
                  {inv.status !== 'utkast' && <a class="btn btn--ghost btn--sm" href={docUrl(inv.token)} target="_blank" rel="noopener">Visa</a>}
                  {inv.status === 'skickad' && !kredit && (
                    <>
                      <button class="btn btn--sm" type="button" onClick={() => setPaying(inv)}>Markera betald</button>
                      <button class="btn btn--ghost btn--sm" type="button" onClick={() => setSending({ inv, reminder: false })}>Skicka igen</button>
                      {overdue && <button class="btn btn--ghost btn--sm" type="button" disabled={busy === inv.id} onClick={() => remind(inv)}>Påminnelse</button>}
                    </>
                  )}
                  {inv.status === 'betald' && <button class="btn btn--ghost btn--sm" type="button" disabled={busy === inv.id} onClick={() => unpay(inv)}>Ångra betald</button>}
                  {['skickad', 'betald'].includes(inv.status) && !kredit && (
                    <button class="btn btn--ghost btn--sm" type="button" disabled={busy === inv.id} onClick={() => credit(inv)}>Kreditera</button>
                  )}
                  {kredit && inv.status === 'skickad' && <button class="btn btn--ghost btn--sm" type="button" onClick={() => setSending({ inv, reminder: false })}>Skicka</button>}
                  {inv.status !== 'utkast' && inv.rut_status !== 'ej_aktuell' && (
                    <select aria-label="RUT-status" value={inv.rut_status} disabled={busy === inv.id} onChange={(e) => setRut(inv, e.currentTarget.value)}>
                      {Object.entries(RUT_STATUS).filter(([k]) => k !== 'ej_aktuell').map(([k, v]) => <option value={k}>RUT: {v}</option>)}
                    </select>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {shown.length > 0 && filter !== 'utkast' && <p class="muted" style="margin:12px 0 0">Summa att betala: <strong>{formatKrWhole(sum)}</strong></p>}
      </div>

      <Modal open={!!editing} label="Faktura" onClose={() => setEditing(null)}>
        {editing && <DocEditor type="faktura" value={editing} customers={customers} company={companyFor(settings)} onSave={save} onCancel={() => setEditing(null)} />}
      </Modal>
      <Modal open={!!sending} label="Skicka fakturan" onClose={() => setSending(null)}>
        {sending && (
          <SendBox
            title={sending.reminder ? `Påminnelse för faktura ${sending.inv.number}` : `${sending.inv.kind === 'kredit' ? 'Kreditfaktura' : 'Faktura'} ${sending.inv.number} är skickad`}
            intro={sending.reminder ? 'Ingen påminnelseavgift tas ut. Skicka texten till kunden.' : 'Fakturan har fått nummer och OCR. Skicka länken till kunden; där finns fakturan som PDF.'}
            url={docUrl(sending.inv.token)}
            text={messageFor('faktura', sending.inv, docUrl(sending.inv.token), sending.reminder)}
            subject={`${sending.reminder ? 'Påminnelse: faktura' : 'Faktura'} ${sending.inv.number} från TO Städ & Flytt`}
            email={sending.inv.buyer?.email}
            phone={sending.inv.buyer?.phone}
            onClose={() => setSending(null)}
          />
        )}
      </Modal>
      <Modal open={!!paying} label="Betalning" onClose={() => setPaying(null)}>
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
      <h3>Betalning för faktura {inv.number}</h3>
      <div class="form-2">
        <div class="field">
          <label for="p-date">Betalningsdag</label>
          <input id="p-date" type="date" required value={date} onInput={(e) => setDate(e.currentTarget.value)} />
        </div>
        <div class="field">
          <label for="p-amount">Belopp (kr)</label>
          <input id="p-amount" type="text" inputmode="decimal" required value={amount} onInput={(e) => setAmount(e.currentTarget.value)} />
        </div>
      </div>
      {Number(inv.rut) !== 0 && <p class="muted">När kunden har betalat kan du ansöka om RUT-utbetalningen hos Skatteverket. Ändra sedan RUT-status på fakturan.</p>}
      <ErrorMsg error={error} />
      <div class="cp-actions">
        <button class="btn" type="submit">Spara</button>
        <button class="btn btn--ghost" type="button" onClick={onDone}>Avbryt</button>
      </div>
    </form>
  );
}
