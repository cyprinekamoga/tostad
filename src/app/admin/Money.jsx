// Ekonomi: obetalt, förfallet, betalt och RUT som väntar, månad för månad. RUT följs upp på sidan RUT.
import { useEffect, useState } from 'preact/hooks';
import { today } from '../../lib/planner.js';
import { formatKrWhole } from '../../lib/money.js';
import { ErrorMsg } from '../ui.jsx';
import { loadInvoices, isOverdue, docUrl, companyFor } from './docs.js';
import { vouchers, sie, encodeCp437, invoiceCsv, voucherCsv, ACCOUNTS } from '../../lib/accounting.js';

const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthName = (m) => monthFmt.format(new Date(`${m}-15T12:00:00Z`));

function lastMonths(n) {
  const [y, m] = today().split('-').map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
}

export default function Money() {
  const [rows, setRows] = useState(null);
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
  }, []);

  const sent = (rows ?? []).filter((i) => i.status !== 'utkast');
  const sum = (list, key = 'to_pay') => list.reduce((s, i) => s + Number(i[key] ?? 0), 0);
  const unpaid = sent.filter((i) => i.status === 'skickad' && i.kind === 'faktura');
  const overdue = unpaid.filter(isOverdue);
  const thisMonth = today().slice(0, 7);
  const paidThisMonth = sent.filter((i) => i.paid_at?.startsWith(thisMonth));
  const rutWaiting = sent.filter((i) => ['ej_ansokt', 'ansokt'].includes(i.rut_status) && i.status !== 'krediterad' && i.kind === 'faktura' && Number(i.rut) > 0);
  const toApply = sent.filter((i) => i.status === 'betald' && i.kind === 'faktura' && i.rut_status === 'ej_ansokt' && Number(i.rut) > 0);

  const months = lastMonths(12).map((m) => {
    const issued = sent.filter((i) => i.issue_date?.startsWith(m));
    return { m, net: sum(issued, 'net'), vat: sum(issued, 'vat'), rut: sum(issued, 'rut'), paid: sum(sent.filter((i) => i.paid_at?.startsWith(m)), 'paid_amount'), count: issued.filter((i) => i.kind === 'faktura').length };
  });


  return (
    <>
      <div class="cp-head">
        <h2>Finances</h2>
        <a class="btn btn--ghost btn--sm" href="/admin/fakturor">Go to invoices</a>
      </div>
      <ErrorMsg error={error} />
      <div class="cp-stats">
        <a class="cp-panel cp-stat" href="/admin/fakturor">
          <strong>{rows ? formatKrWhole(sum(unpaid)) : '…'}</strong>
          <span>Unpaid ({unpaid.length} {unpaid.length === 1 ? 'invoice' : 'invoices'})</span>
        </a>
        <a class="cp-panel cp-stat" href="/admin/fakturor">
          <strong style={overdue.length ? 'color:var(--danger)' : ''}>{rows ? formatKrWhole(sum(overdue)) : '…'}</strong>
          <span>Overdue ({overdue.length})</span>
        </a>
        <div class="cp-panel cp-stat">
          <strong>{rows ? formatKrWhole(sum(paidThisMonth, 'paid_amount')) : '…'}</strong>
          <span>Paid this month</span>
        </div>
        <a class="cp-panel cp-stat" href="/admin/rut">
          <strong>{rows ? formatKrWhole(sum(rutWaiting, 'rut')) : '…'}</strong>
          <span>RUT waiting from Skatteverket</span>
        </a>
      </div>

      {toApply.length > 0 && (
        <a class="msg msg--ok" href="/admin/rut" style="display:block;margin-bottom:16px">
          {toApply.length === 1 ? '1 paid invoice' : `${toApply.length} paid invoices`} with {formatKrWhole(sum(toApply, 'rut'))} in RUT to apply for. Open the RUT tracker.
        </a>
      )}

      <section class="cp-panel">
        <h3 class="cp-subhead">Month by month</h3>
        <div class="cp-scroll">
          <table class="cp-table">
            <thead>
              <tr><th>Month</th><th>Invoices</th><th>Invoiced excl. VAT</th><th>VAT</th><th>RUT</th><th>Paid</th></tr>
            </thead>
            <tbody>
              {months.map((r) => (
                <tr>
                  <td>{monthName(r.m)}</td>
                  <td>{r.count}</td>
                  <td>{formatKrWhole(r.net)}</td>
                  <td>{formatKrWhole(r.vat)}</td>
                  <td>{formatKrWhole(r.rut)}</td>
                  <td>{formatKrWhole(r.paid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p class="muted" style="margin:10px 0 0">Credit notes count as minus in the month they were sent. The bookkeeping is handled by your accountant.</p>
      </section>

      {rows && <AccountantExport invoices={rows} />}
    </>
  );
}

const lastDay = (month) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

function periodFor(preset) {
  const now = today();
  const [y, m] = now.split('-').map(Number);
  const month = (offset) => new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 7);
  if (preset === 'this_month') return [`${month(0)}-01`, lastDay(month(0))];
  if (preset === 'quarter') {
    const q = Math.floor((m - 1) / 3) * 3;
    const start = new Date(Date.UTC(y, q, 1)).toISOString().slice(0, 7);
    return [`${start}-01`, lastDay(new Date(Date.UTC(y, q + 2, 1)).toISOString().slice(0, 7))];
  }
  if (preset === 'last_quarter') {
    const q = Math.floor((m - 1) / 3) * 3 - 3;
    return [new Date(Date.UTC(y, q, 1)).toISOString().slice(0, 10), lastDay(new Date(Date.UTC(y, q + 2, 1)).toISOString().slice(0, 7))];
  }
  if (preset === 'year') return [`${y}-01-01`, `${y}-12-31`];
  return [`${month(-1)}-01`, lastDay(month(-1))];
}

// Export till redovisningskonsulten: SIE-fil och Excel-listor för en period.
function AccountantExport({ invoices }) {
  const [preset, setPreset] = useState('last_month');
  const [range, setRange] = useState(() => periodFor('last_month'));
  const [from, to] = range;
  const list = from && to && from <= to ? vouchers(invoices, from, to) : [];
  const count = (kind) => list.filter((v) => v.kind === kind).length;
  const name = `tostad-${from}-${to}`;

  function download(data, filename, type) {
    const blob = new Blob([data], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const choose = (p) => {
    setPreset(p);
    if (p !== 'custom') setRange(periodFor(p));
  };

  return (
    <section class="cp-panel" style="margin-top:16px">
      <h3 class="cp-subhead">Export for the accountant</h3>
      <p class="muted">
        Invoices and credit notes on their invoice date, payments on the day they were paid, and RUT from Skatteverket on the day it was paid out. The SIE file can be
        imported into Fortnox, Visma and most accounting programs. The Excel list has a link to every invoice.
      </p>
      <div class="form-3">
        <div class="field">
          <label for="ex-period">Period</label>
          <select id="ex-period" value={preset} onChange={(e) => choose(e.currentTarget.value)}>
            <option value="last_month">Last month</option>
            <option value="this_month">This month</option>
            <option value="last_quarter">Last quarter</option>
            <option value="quarter">This quarter</option>
            <option value="year">This year</option>
            <option value="custom">Choose dates</option>
          </select>
        </div>
        <div class="field">
          <label for="ex-from">From</label>
          <input id="ex-from" type="date" value={from} onInput={(e) => { setPreset('custom'); setRange([e.currentTarget.value, to]); }} />
        </div>
        <div class="field">
          <label for="ex-to">To</label>
          <input id="ex-to" type="date" value={to} onInput={(e) => { setPreset('custom'); setRange([from, e.currentTarget.value]); }} />
        </div>
      </div>
      <p>
        {count('faktura')} invoices and credit notes, {count('betalning')} payments, {count('rut')} RUT payouts.
      </p>
      <div class="cp-actions">
        <button class="btn btn--sm" type="button" disabled={!list.length} onClick={() => download(encodeCp437(sie(list, { company: companyFor(null), from, to, generated: today() })), `${name}.se`, 'application/octet-stream')}>
          Download SIE file
        </button>
        <button class="btn btn--ghost btn--sm" type="button" disabled={!list.length} onClick={() => download(invoiceCsv(invoices, from, to, docUrl), `${name}-fakturor.csv`, 'text/csv;charset=utf-8')}>
          Invoices (Excel)
        </button>
        <button class="btn btn--ghost btn--sm" type="button" disabled={!list.length} onClick={() => download(voucherCsv(list), `${name}-verifikationer.csv`, 'text/csv;charset=utf-8')}>
          Vouchers (Excel)
        </button>
      </div>
      <details style="margin-top:12px">
        <summary>Accounts used (BAS)</summary>
        <ul>
          {[ACCOUNTS.receivable, ACCOUNTS.rutReceivable, ACCOUNTS.bank, ACCOUNTS.rounding, ...Object.values(ACCOUNTS.sales), ...Object.values(ACCOUNTS.vat)].map(([n, label]) => (
            <li>{n} {label}</li>
          ))}
        </ul>
        <p class="muted">If your accountant uses other accounts, they can change them when importing.</p>
      </details>
    </section>
  );
}
