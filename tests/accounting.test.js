import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vatBreakdown, vouchers, sie, encodeCp437, invoiceCsv, voucherCsv } from '../src/lib/accounting.js';
import { totals } from '../src/lib/money.js';

// En faktura byggd med samma uträkning som fakturorna i systemet.
function invoice(number, lines, extra = {}) {
  const t = totals(lines, extra.rut_persons ?? 0);
  return { number, kind: 'faktura', status: 'skickad', issue_date: '2026-10-05', due_date: '2026-10-15', buyer: { name: 'Anna Ek' }, lines, net: t.net, vat: t.vat, total: t.total, rut: t.rut, rounding: t.rounding, to_pay: t.toPay, ocr: '100143', token: 'tok', ...extra };
}
const sum = (rows) => Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;

test('moms per momssats', () => {
  const b = vatBreakdown([{ qty: 2, price: 100, vat: 25 }, { qty: 1, price: 50, vat: 0 }, { qty: 1, price: 33.33, vat: 25 }]);
  assert.deepEqual(b[25], { net: 233.33, vat: 58.33 });
  assert.deepEqual(b[0], { net: 50, vat: 0 });
});

test('faktura med RUT och öresavrundning balanserar', () => {
  const inv = invoice(1001, [{ text: 'Hemstädning', qty: 3, unit: 'h', price: 319.2, vat: 25, rut: true }, { text: 'Material', qty: 1, price: 79.99, vat: 25 }], { rut_persons: 1 });
  const [v] = vouchers([inv], '2026-10-01', '2026-10-31');
  assert.equal(sum(v.rows), 0);
  const by = Object.fromEntries(v.rows.map((r) => [r.account, r.amount]));
  assert.equal(by[1510], inv.to_pay);
  assert.equal(by[1513], inv.rut);
  assert.equal(by[3001], -inv.net);
  assert.equal(by[2611], -inv.vat);
  assert.equal(by[3740] ?? 0, -inv.rounding);
});

test('betalning, RUT-utbetalning och kreditfaktura', () => {
  const paid = invoice(1002, [{ qty: 1, price: 1000, vat: 25 }], { status: 'betald', paid_at: '2026-10-20', paid_amount: 1250, rut_paid_at: '2026-11-02', rut_paid_amount: 500 });
  const credit = invoice(1003, [{ qty: -1, price: 1000, vat: 25 }], { kind: 'kredit', issue_date: '2026-10-21' });
  const draft = invoice(null, [{ qty: 1, price: 1, vat: 25 }], { status: 'utkast' });
  const list = vouchers([paid, credit, draft], '2026-10-01', '2026-10-31');
  assert.deepEqual(list.map((v) => v.kind), ['faktura', 'betalning', 'faktura']);
  assert.ok(list.every((v) => sum(v.rows) === 0));
  assert.equal(list[2].text, 'Kreditfaktura 1003 Anna Ek');
  assert.equal(list[2].rows.find((r) => r.account === 1510).amount, -1250);
  const nov = vouchers([paid], '2026-11-01', '2026-11-30');
  assert.deepEqual(nov[0].rows, [{ account: 1930, amount: 500 }, { account: 1513, amount: -500 }]);
});

test('SIE-fil och kodning', () => {
  const list = vouchers([invoice(1004, [{ qty: 1, price: 800, vat: 25 }], { buyer: { name: 'Åsa "Ö" Lind' } })], '2026-10-01', '2026-10-31');
  const text = sie(list, { company: { legalName: 'TO Städ och Flytt AB', orgNr: '559470-3398' }, from: '2026-10-01', to: '2026-10-31', generated: '2026-10-25' });
  assert.match(text, /^#FLAGGA 0\r\n#FORMAT PC8\r\n#SIETYP 4\r\n/);
  assert.match(text, /#RAR 0 20260101 20261231/);
  assert.match(text, /#KONTO 1510 "Kundfordringar"/);
  assert.match(text, /#VER "A" 1 20261005 "Faktura 1004 Åsa \\"Ö\\" Lind"\r\n\{\r\n   #TRANS 1510 \{\} 1000\.00\r\n/);
  const bytes = encodeCp437('Städ Åsa ö €');
  assert.deepEqual([...bytes.slice(2, 3), bytes[5], bytes[9], bytes[11]], [132, 143, 148, 63]);
});

test('Excel-listor med decimalkomma', () => {
  const inv = invoice(1005, [{ qty: 1, price: 999.5, vat: 25 }]);
  const csv = invoiceCsv([inv], '2026-10-01', '2026-10-31', (t) => `https://x/dokument?t=${t}`);
  assert.match(csv, /^﻿"Nummer";"Typ"/);
  assert.match(csv, /"1005";"Faktura";"2026-10-05";"2026-10-15";"Anna Ek";"999,50";"249,88"/);
  assert.match(csv, /"https:\/\/x\/dokument\?t=tok"/);
  const vcsv = voucherCsv(vouchers([inv], '2026-10-01', '2026-10-31'));
  assert.match(vcsv, /"1";"2026-10-05";"Faktura 1005 Anna Ek";"1510";"Kundfordringar";"1249,00";""/);
});

test('påminnelseavgift bokförs momsfritt på 3930', () => {
  const late = invoice(1004, [{ qty: 1, price: 1000, vat: 25 }], { reminder_fee: 60, reminder_fee_at: '2026-10-25', status: 'betald', paid_at: '2026-10-28', paid_amount: 1310 });
  const list = vouchers([late], '2026-10-01', '2026-10-31');
  const fee = list.find((v) => v.kind === 'avgift');
  assert.equal(fee.text, 'Påminnelseavgift Faktura 1004 Anna Ek');
  assert.deepEqual(fee.rows, [{ account: 1510, amount: 60 }, { account: 3930, amount: -60 }]);
  // Fordran går jämnt ut när kunden betalar faktura och avgift.
  assert.equal(list.flatMap((v) => v.rows).filter((r) => r.account === 1510).reduce((s, r) => s + r.amount, 0), 0);
});
