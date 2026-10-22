// Ekonomi: obetalt, förfallet, betalt och RUT som väntar, månad för månad.
import { useEffect, useState } from 'preact/hooks';
import { today } from '../../lib/planner.js';
import { formatKrWhole, formatMoney, maskPnr } from '../../lib/money.js';
import { ErrorMsg } from '../ui.jsx';
import { loadInvoices, isOverdue, updateInvoice, revealPnr } from './docs.js';

const monthFmt = new Intl.DateTimeFormat('sv-SE', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthName = (m) => monthFmt.format(new Date(`${m}-15T12:00:00Z`));

function lastMonths(n) {
  const [y, m] = today().split('-').map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
}

export default function Money() {
  const [rows, setRows] = useState(null);
  const [shownPnr, setShownPnr] = useState({});
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
  const rutWaiting = sent.filter((i) => ['ej_ansokt', 'ansokt'].includes(i.rut_status) && i.status !== 'krediterad' && !(i.kind === 'kredit'));
  const toApply = sent.filter((i) => i.status === 'betald' && i.rut_status === 'ej_ansokt');

  const months = lastMonths(12).map((m) => {
    const issued = sent.filter((i) => i.issue_date?.startsWith(m));
    return { m, net: sum(issued, 'net'), vat: sum(issued, 'vat'), rut: sum(issued, 'rut'), paid: sum(sent.filter((i) => i.paid_at?.startsWith(m)), 'paid_amount'), count: issued.filter((i) => i.kind === 'faktura').length };
  });

  async function show(person) {
    try {
      const pnr = await revealPnr(person.id);
      setShownPnr({ ...shownPnr, [person.id]: pnr });
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <>
      <div class="cp-head">
        <h2>Ekonomi</h2>
        <a class="btn btn--ghost btn--sm" href="/admin/fakturor">Till fakturorna</a>
      </div>
      <ErrorMsg error={error} />
      <div class="cp-stats">
        <a class="cp-panel cp-stat" href="/admin/fakturor">
          <strong>{rows ? formatKrWhole(sum(unpaid)) : '…'}</strong>
          <span>Obetalt ({unpaid.length} fakturor)</span>
        </a>
        <a class="cp-panel cp-stat" href="/admin/fakturor">
          <strong style={overdue.length ? 'color:var(--danger)' : ''}>{rows ? formatKrWhole(sum(overdue)) : '…'}</strong>
          <span>Förfallet ({overdue.length})</span>
        </a>
        <div class="cp-panel cp-stat">
          <strong>{rows ? formatKrWhole(sum(paidThisMonth, 'paid_amount')) : '…'}</strong>
          <span>Betalt denna månad</span>
        </div>
        <div class="cp-panel cp-stat">
          <strong>{rows ? formatKrWhole(sum(rutWaiting, 'rut')) : '…'}</strong>
          <span>RUT som väntar från Skatteverket</span>
        </div>
      </div>

      {toApply.length > 0 && (
        <section class="cp-panel" style="margin-bottom:16px">
          <h3 class="cp-subhead">Betalda fakturor att ansöka om RUT för</h3>
          <p class="muted">Ansök hos Skatteverket (e-tjänsten Rot och rut, företag). Markera sedan fakturan som ansökt.</p>
          <ul class="cp-list">
            {toApply.map((inv) => (
              <li class="cp-row cp-row--static">
                <span class="cp-row-top">
                  <strong>Faktura {inv.number} · {inv.buyer?.name}</strong>
                  <span>RUT {formatMoney(inv.rut)}</span>
                </span>
                <p>
                  Betald {inv.paid_at} · arbetskostnad och betalt belopp finns på fakturan
                </p>
                {inv.rut_people.map((p) => (
                  <small>
                    {p.name}: {shownPnr[p.id] ? `${shownPnr[p.id].slice(0, 8)}-${shownPnr[p.id].slice(8)}` : maskPnr(p.pnr_last4)}{' '}
                    {!shownPnr[p.id] && <button class="st-link" type="button" onClick={() => show(p)}>Visa personnummer</button>}
                  </small>
                ))}
                <span class="cp-actions">
                  <button class="btn btn--sm" type="button" onClick={async () => { await updateInvoice(inv.id, { rut_status: 'ansokt' }); load(); }}>Markera som ansökt</button>
                </span>
              </li>
            ))}
          </ul>
          <small class="muted">Varje gång ett personnummer visas sparas det i ändringsloggen.</small>
        </section>
      )}

      <section class="cp-panel">
        <h3 class="cp-subhead">Månad för månad</h3>
        <div class="cp-scroll">
          <table class="cp-table">
            <thead>
              <tr><th>Månad</th><th>Fakturor</th><th>Fakturerat exkl. moms</th><th>Moms</th><th>RUT</th><th>Betalt</th></tr>
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
        <p class="muted" style="margin:10px 0 0">Kreditfakturor räknas med minus i den månad de skickades. Bokföringen sköts av er redovisningskonsult.</p>
      </section>
    </>
  );
}
