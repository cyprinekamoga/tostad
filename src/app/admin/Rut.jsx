// RUT: vilka fakturor som ska ansökas om hos Skatteverket, vilka som är ansökta och vad som har betalats ut.
import { useEffect, useState } from 'preact/hooks';
import { today } from '../../lib/planner.js';
import { formatKrWhole, formatMoney, maskPnr, totals } from '../../lib/money.js';
import { searchInvoices, ocrQuery, formatOcr } from '../../lib/invoiceSearch.js';
import { ErrorMsg, Modal } from '../ui.jsx';
import { RUT_STATUS, loadInvoices, invoiceByOcr, updateInvoice, revealPnr, docUrl } from './docs.js';

// Fakturor med RUT-avdrag. Krediterade fakturor och kreditfakturor räknas inte.
const hasRut = (i) => i.kind === 'faktura' && i.status !== 'utkast' && i.status !== 'krediterad' && Number(i.rut) > 0 && i.rut_status !== 'ej_aktuell';

const FILTERS = [
  ['apply', 'To apply for', (i) => i.rut_status === 'ej_ansokt' && i.status === 'betald'],
  ['unpaid', 'Waiting for the customer to pay', (i) => i.rut_status === 'ej_ansokt' && i.status === 'skickad'],
  ['applied', 'Applied', (i) => i.rut_status === 'ansokt'],
  ['paidout', 'Paid out', (i) => i.rut_status === 'utbetald'],
  ['rejected', 'Rejected', (i) => i.rut_status === 'nekad'],
  ['all', 'All', () => true],
];
const BADGE = { ej_ansokt: 'badge--ny', ansokt: '', utbetald: 'badge--muted', nekad: 'badge--skadeanmalan' };

export default function Rut({ onInboxChange }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('apply');
  const [query, setQuery] = useState('');
  const [extra, setExtra] = useState(null);
  const [picked, setPicked] = useState([]);
  const [shownPnr, setShownPnr] = useState({});
  const [payout, setPayout] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function load() {
    try {
      setRows((await loadInvoices()).filter(hasRut));
      onInboxChange?.();
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) {
      setQuery(q);
      setFilter('all');
      window.history.replaceState(null, '', window.location.pathname);
    }
    load();
  }, []);

  const all = rows ?? [];
  const searching = !!query.trim();
  const base = searching ? all : all.filter(FILTERS.find(([k]) => k === filter)[2]);
  const shown = searchInvoices(base, query);

  // Hittas inte OCR-numret bland de hämtade fakturorna, fråga databasen.
  useEffect(() => {
    setExtra(null);
    const ocr = ocrQuery(query);
    if (!ocr || !rows || shown.length) return;
    invoiceByOcr(ocr).then((inv) => setExtra(inv ?? false));
  }, [query, rows]);

  const sum = (list, key = 'rut') => list.reduce((s, i) => s + Number(i[key] ?? 0), 0);
  const year = today().slice(0, 4);
  const count = (k) => all.filter(FILTERS.find(([key]) => key === k)[2]).length;
  const toApply = all.filter(FILTERS[0][2]);
  const applied = all.filter(FILTERS[2][2]);
  const paidThisYear = all.filter((i) => i.rut_status === 'utbetald' && i.rut_paid_at?.startsWith(year));

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

  const markApplied = (list) =>
    run('many', async () => {
      for (const inv of list) await updateInvoice(inv.id, { rut_status: 'ansokt', rut_applied_at: today() });
      setPicked([]);
    }, list.length === 1 ? `Invoice ${list[0].number} is marked as applied.` : `${list.length} invoices are marked as applied.`);

  const setStatus = (inv, values, done) => run(inv.id, () => updateInvoice(inv.id, values), done);

  function reject(inv) {
    const note = window.prompt(`Why did Skatteverket reject invoice ${inv.number}? (optional)`, inv.rut_note ?? '');
    if (note === null) return;
    setStatus(inv, { rut_status: 'nekad', rut_note: note.trim() || null }, `Invoice ${inv.number} is marked as rejected.`);
  }

  function editNote(inv) {
    const note = window.prompt(`Note for invoice ${inv.number}`, inv.rut_note ?? '');
    if (note === null) return;
    setStatus(inv, { rut_note: note.trim() || null });
  }

  async function show(person) {
    try {
      const pnr = await revealPnr(person.id);
      setShownPnr({ ...shownPnr, [person.id]: pnr });
    } catch (e) {
      setError(e.message);
    }
  }

  function exportCsv() {
    const clean = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const money = (n) => (n == null ? '' : (Math.round(Number(n) * 100) / 100).toFixed(2));
    const lines = [['Invoice', 'OCR', 'Buyer', 'RUT buyers', 'Work done', 'Customer paid', 'Paid amount', 'Labour cost incl. VAT', 'RUT requested', 'Status', 'Applied', 'Paid out', 'Paid out amount', 'Note'].join(';')];
    for (const i of shown) {
      lines.push(
        [i.number, i.ocr, clean(i.buyer?.name), clean(i.rut_people.map((p) => p.name).join(', ')), i.delivery_date ?? '', i.paid_at ?? '', money(i.paid_amount), money(totals(i.lines, i.rut_persons).labour), money(i.rut), RUT_STATUS[i.rut_status], i.rut_applied_at ?? '', i.rut_paid_at ?? '', money(i.rut_paid_amount), clean(i.rut_note)].join(';'),
      );
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rut-${filter}-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const list = extra ? [...shown, extra] : shown;
  const pickable = list.filter(FILTERS[0][2]);

  return (
    <>
      <div class="cp-head">
        <h2>RUT</h2>
      </div>
      <div class="cp-stats">
        <button type="button" class="cp-panel cp-stat" onClick={() => { setQuery(''); setFilter('apply'); }}>
          <strong>{rows ? formatKrWhole(sum(toApply)) : '…'}</strong>
          <span>To apply for ({toApply.length})</span>
        </button>
        <button type="button" class="cp-panel cp-stat" onClick={() => { setQuery(''); setFilter('applied'); }}>
          <strong>{rows ? formatKrWhole(sum(applied)) : '…'}</strong>
          <span>Applied, waiting for payout ({applied.length})</span>
        </button>
        <button type="button" class="cp-panel cp-stat" onClick={() => { setQuery(''); setFilter('paidout'); }}>
          <strong>{rows ? formatKrWhole(sum(paidThisYear, 'rut_paid_amount')) : '…'}</strong>
          <span>Paid out in {year}</span>
        </button>
        <button type="button" class="cp-panel cp-stat" onClick={() => { setQuery(''); setFilter('unpaid'); }}>
          <strong>{rows ? formatKrWhole(sum(all.filter(FILTERS[1][2]))) : '…'}</strong>
          <span>Waiting for the customer to pay first ({count('unpaid')})</span>
        </button>
      </div>

      <div class="cp-panel rut-tools">
        <label class="visually-hidden" for="rut-search">Search</label>
        <input id="rut-search" type="search" placeholder="Search by OCR, invoice number, amount or name" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
        {!searching && (
          <div class="cp-tabs" role="group" aria-label="Filter">
            {FILTERS.map(([k, label]) => (
              <button type="button" aria-pressed={filter === k} onClick={() => { setFilter(k); setPicked([]); }}>
                {label}
                {['apply', 'applied'].includes(k) && rows && count(k) > 0 && <span class="count" style="margin-left:6px">{count(k)}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <ErrorMsg error={error} />
      {info && <p class="msg msg--ok" role="status">{info}</p>}

      <div class="cp-panel">
        {rows === null && <p class="muted">Loading …</p>}
        {rows && list.length === 0 && (
          <p class="cp-empty">{searching ? (extra === false ? 'No invoice has that OCR number.' : 'No RUT invoice matches the search.') : filter === 'apply' ? 'Nothing to apply for right now.' : 'No invoices here.'}</p>
        )}
        {extra && !hasRut(extra) && <p class="muted">Invoice {extra.number} has this OCR number but no RUT to apply for. <a href={`/admin/fakturor?q=${extra.ocr}`}>Open it under Invoices</a>.</p>}
        {pickable.length > 1 && (
          <div class="cp-actions" style="margin-bottom:10px">
            <label class="cp-check">
              <input type="checkbox" checked={picked.length === pickable.length} onChange={(e) => setPicked(e.currentTarget.checked ? pickable.map((i) => i.id) : [])} />
              Select all {pickable.length}
            </label>
            <button class="btn btn--sm" type="button" disabled={!picked.length || busy === 'many'} onClick={() => markApplied(pickable.filter((i) => picked.includes(i.id)))}>
              Mark {picked.length || ''} as applied
            </button>
          </div>
        )}
        <ul class="cp-list">
          {list.filter(hasRut).map((inv) => {
            const t = totals(inv.lines, inv.rut_persons);
            const canApply = FILTERS[0][2](inv);
            const partial = inv.rut_status === 'utbetald' && inv.rut_paid_amount != null && Number(inv.rut_paid_amount) !== Number(inv.rut);
            return (
              <li class="cp-row cp-row--static rut-row">
                <span class="cp-row-top">
                  <strong>
                    {canApply && pickable.length > 1 && (
                      <input
                        type="checkbox"
                        aria-label={`Select invoice ${inv.number}`}
                        checked={picked.includes(inv.id)}
                        onChange={() => setPicked(picked.includes(inv.id) ? picked.filter((x) => x !== inv.id) : [...picked, inv.id])}
                        style="margin-right:8px;vertical-align:middle"
                      />
                    )}
                    Invoice {inv.number} · {inv.buyer?.name || 'No name'}
                  </strong>
                  <span class={`badge ${inv.status === 'skickad' && inv.rut_status === 'ej_ansokt' ? 'badge--muted' : BADGE[inv.rut_status]}`}>
                    {inv.status === 'skickad' && inv.rut_status === 'ej_ansokt' ? 'Customer has not paid' : RUT_STATUS[inv.rut_status]}
                  </span>
                </span>
                <dl class="rut-facts">
                  <div><dt>RUT</dt><dd><strong>{formatMoney(inv.rut)}</strong></dd></div>
                  <div><dt>Labour cost incl. VAT</dt><dd>{formatMoney(t.labour)}</dd></div>
                  <div><dt>Work done</dt><dd>{inv.delivery_date ?? '–'}</dd></div>
                  <div><dt>Customer paid</dt><dd>{inv.paid_at ? `${inv.paid_at} · ${formatKrWhole(inv.paid_amount ?? inv.to_pay)}` : `Not yet (${formatKrWhole(inv.to_pay)}, due ${inv.due_date})`}</dd></div>
                  <div><dt>OCR</dt><dd>{formatOcr(inv.ocr)}</dd></div>
                  {inv.rut_applied_at && <div><dt>Applied</dt><dd>{inv.rut_applied_at}</dd></div>}
                  {inv.rut_status === 'utbetald' && (
                    <div><dt>Paid out</dt><dd class={partial ? 'cp-warn-text' : ''}>{inv.rut_paid_at ?? ''} · {formatMoney(inv.rut_paid_amount ?? inv.rut)}{partial ? ' (not the full amount)' : ''}</dd></div>
                  )}
                </dl>
                {inv.rut_people.map((p) => (
                  <small>
                    {p.name}: {shownPnr[p.id] ? `${shownPnr[p.id].slice(0, 8)}-${shownPnr[p.id].slice(8)}` : maskPnr(p.pnr_last4).replace('ÅÅÅÅMMDD', 'YYYYMMDD')}{' '}
                    {!shownPnr[p.id] && <button class="st-link" type="button" onClick={() => show(p)}>Show personal identity number</button>}
                  </small>
                ))}
                {inv.rut_note && <p class="muted">Note: {inv.rut_note}</p>}
                <span class="cp-actions">
                  {canApply && <button class="btn btn--sm" type="button" disabled={!!busy} onClick={() => markApplied([inv])}>Mark as applied</button>}
                  {inv.rut_status === 'ansokt' && (
                    <>
                      <button class="btn btn--sm" type="button" disabled={!!busy} onClick={() => setPayout(inv)}>Mark as paid out</button>
                      <button class="btn btn--ghost btn--sm" type="button" disabled={!!busy} onClick={() => reject(inv)}>Rejected</button>
                      <button class="btn btn--ghost btn--sm" type="button" disabled={!!busy} onClick={() => setStatus(inv, { rut_status: 'ej_ansokt', rut_applied_at: null }, `Invoice ${inv.number} is back under "To apply for".`)}>Undo applied</button>
                    </>
                  )}
                  {inv.rut_status === 'utbetald' && (
                    <button class="btn btn--ghost btn--sm" type="button" disabled={!!busy} onClick={() => setStatus(inv, { rut_status: 'ansokt', rut_paid_at: null, rut_paid_amount: null })}>Undo paid out</button>
                  )}
                  {inv.rut_status === 'nekad' && (
                    <button class="btn btn--ghost btn--sm" type="button" disabled={!!busy} onClick={() => setStatus(inv, { rut_status: 'ej_ansokt', rut_applied_at: null }, `Invoice ${inv.number} is back under "To apply for".`)}>Apply again</button>
                  )}
                  <button class="btn btn--ghost btn--sm" type="button" disabled={!!busy} onClick={() => editNote(inv)}>{inv.rut_note ? 'Edit note' : 'Add note'}</button>
                  <a class="btn btn--ghost btn--sm" href={docUrl(inv.token)} target="_blank" rel="noopener">View invoice</a>
                </span>
              </li>
            );
          })}
        </ul>
        {list.length > 0 && (
          <div class="cp-actions" style="margin-top:12px">
            <button class="btn btn--ghost btn--sm" type="button" onClick={exportCsv}>Export this list (CSV)</button>
          </div>
        )}
      </div>
      <p class="muted" style="margin-top:12px">
        Apply for RUT after the customer has paid, in Skatteverket's e-service "Rot och rut, företag". There you need the buyer's personal identity number, the labour cost, the amount the customer paid and the date. Every time a personal identity number is shown, it is saved in the change log.
      </p>

      <Modal open={!!payout} label="RUT paid out" onClose={() => setPayout(null)}>
        {payout && <PayoutForm inv={payout} onDone={(msg) => { setPayout(null); setInfo(msg ?? ''); load(); }} />}
      </Modal>
    </>
  );
}

function PayoutForm({ inv, onDone }) {
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState(String(Math.round(Number(inv.rut))));
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    const value = Number(amount.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(value) || value < 0) return setError('Write the amount Skatteverket paid out.');
    try {
      await updateInvoice(inv.id, { rut_status: 'utbetald', rut_paid_at: date, rut_paid_amount: value });
      onDone(`RUT for invoice ${inv.number} is marked as paid out.`);
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <form onSubmit={submit}>
      <h3>RUT paid out for invoice {inv.number}</h3>
      <div class="form-2">
        <div class="field">
          <label for="ro-date">Payout date</label>
          <input id="ro-date" type="date" required value={date} onInput={(e) => setDate(e.currentTarget.value)} />
        </div>
        <div class="field">
          <label for="ro-amount">Amount from Skatteverket (kr)</label>
          <input id="ro-amount" type="text" inputmode="decimal" required value={amount} onInput={(e) => setAmount(e.currentTarget.value)} />
        </div>
      </div>
      <p class="muted">Requested: {formatMoney(inv.rut)}. If Skatteverket paid less, write the amount you got and add a note about why.</p>
      <ErrorMsg error={error} />
      <div class="cp-actions">
        <button class="btn" type="submit">Save</button>
        <button class="btn btn--ghost" type="button" onClick={() => onDone()}>Cancel</button>
      </div>
    </form>
  );
}
