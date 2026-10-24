// Ekonomi: obetalt, förfallet, betalt och RUT som väntar, månad för månad. RUT följs upp på sidan RUT.
import { useEffect, useState } from 'preact/hooks';
import { today } from '../../lib/planner.js';
import { formatKrWhole } from '../../lib/money.js';
import { ErrorMsg } from '../ui.jsx';
import { loadInvoices, isOverdue } from './docs.js';

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
    </>
  );
}
