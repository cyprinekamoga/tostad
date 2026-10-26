// Läs in betalningar från banken (BgMax-fil eller kontoutdrag) och markera fakturorna som betalda.
import { useState } from 'preact/hooks';
import { callFunction } from '../../lib/supabase.js';
import { formatKrWhole } from '../../lib/money.js';
import { parsePayments, matchPayments } from '../../lib/bankImport.js';
import { formatOcr } from '../../lib/invoiceSearch.js';
import { ErrorMsg } from '../ui.jsx';
import { updateInvoice } from './docs.js';

/** Bankfiler är ofta i Windows-teckenkodning. Försök med UTF-8 först. */
async function readText(file) {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

const HOW = { ocr: 'OCR match', amount: 'Amount only' };

export default function BankImport({ invoices, onDone, onClose }) {
  const [rows, setRows] = useState(null);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  function read(text) {
    setError('');
    const payments = parsePayments(text);
    if (!payments.length) return setError('No payments found. Use the BgMax file from Bankgirot, or export the account statement from your internet bank as CSV.');
    setRows(matchPayments(payments, invoices));
  }

  async function onFile(e) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setError('The file is too big.');
    read(await readText(file));
  }

  const toggle = (i) => setRows(rows.map((r, j) => (j === i ? { ...r, pick: !r.pick } : r)));
  const picked = (rows ?? []).filter((r) => r.pick && r.invoice);

  async function save() {
    setBusy(true);
    setError('');
    let ok = 0;
    try {
      for (const r of picked) {
        await updateInvoice(r.invoice.id, { status: 'betald', paid_at: r.payment.date, paid_amount: r.payment.amount });
        ok++;
      }
      // Frågan om ett omdöme på Google skickas direkt (bara när mejl är påslaget).
      callFunction('email', { action: 'run_now' }).catch(() => {});
      setResult(ok === 1 ? '1 invoice is marked as paid.' : `${ok} invoices are marked as paid.`);
      setRows(null);
      onDone();
    } catch (err) {
      setError(`${ok} saved, then: ${err.message}`);
      onDone();
    }
    setBusy(false);
  }

  return (
    <div class="bank-import cp-modal-body">
      <h3>Import payments from the bank</h3>
      {result && <p class="msg msg--ok">{result}</p>}
      {!rows && (
        <>
          <p class="muted">
            Choose the <strong>BgMax file</strong> from Bankgirot, or export the <strong>account statement as CSV</strong> from your internet bank. Payments are matched to unpaid
            invoices by OCR number. Nothing is saved until you confirm.
          </p>
          <div class="field">
            <label for="bi-file">File</label>
            <input id="bi-file" type="file" accept=".txt,.csv,.tsv,.dat,text/plain,text/csv" onChange={onFile} />
          </div>
          <div class="field">
            <label for="bi-paste">Or paste the rows from the statement</label>
            <textarea id="bi-paste" rows={4} value={paste} onInput={(e) => setPaste(e.currentTarget.value)} placeholder="2026-10-24;BG OCR 1005 74;2 450,00" />
          </div>
          <ErrorMsg error={error} />
          <div class="cp-actions">
            <button class="btn" type="button" disabled={!paste.trim()} onClick={() => read(paste)}>Read the rows</button>
            <button class="btn btn--ghost" type="button" onClick={onClose}>Close</button>
          </div>
        </>
      )}
      {rows && (
        <>
          <p class="muted">
            {rows.length === 1 ? '1 payment' : `${rows.length} payments`}, {rows.filter((r) => r.invoice).length} matched to an invoice. Tick the ones to mark as paid.
          </p>
          <ul class="cp-list bank-rows">
            {rows.map((r, i) => (
              <li class={`cp-row cp-row--static${r.invoice ? '' : ' is-muted'}`}>
                <label class="bank-row">
                  <input type="checkbox" checked={r.pick} disabled={!r.invoice} onChange={() => toggle(i)} />
                  <span>
                    <strong>
                      {r.payment.date} · {formatKrWhole(r.payment.amount)}
                    </strong>
                    <small>{r.payment.name || r.payment.reference || r.payment.text}</small>
                    {r.invoice ? (
                      <small>
                        → Invoice {r.invoice.number} · {r.invoice.buyer?.name || 'No name'} · OCR {formatOcr(r.invoice.ocr)} · {HOW[r.how]}
                        {r.note && <strong class="bank-note"> · {r.note}</strong>}
                      </small>
                    ) : (
                      <small class="muted">No unpaid invoice matches. Search for it in the list if it is one of yours.</small>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <ErrorMsg error={error} />
          <div class="cp-actions">
            <button class="btn" type="button" disabled={busy || !picked.length} onClick={save}>
              {picked.length === 1 ? 'Mark 1 invoice as paid' : `Mark ${picked.length} invoices as paid`}
            </button>
            <button class="btn btn--ghost" type="button" disabled={busy} onClick={() => setRows(null)}>Another file</button>
            <button class="btn btn--ghost" type="button" disabled={busy} onClick={onClose}>Close</button>
          </div>
        </>
      )}
    </div>
  );
}
