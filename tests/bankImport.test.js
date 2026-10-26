import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePayments, parseBgMax, parseStatement, matchPayments, isBgMax } from '../src/lib/bankImport.js';

const pad = (s, n) => String(s).padEnd(n, ' ');
const num = (n, len) => String(n).padStart(len, '0');
// En BgMax-fil med två betalningar i en insättning.
const bgmax = [
  pad('01BGMAX               0120261026101010123456P', 80),
  pad(`05${num(1234567, 10)}${pad('', 10)}SEK`, 80),
  pad(`20${num(9912345, 10)}${pad('100574', 25)}${num(245000, 18)}3`, 80),
  pad('26Eva Ek', 80),
  pad(`20${num(9900000, 10)}${pad('100582', 25)}${num(100000, 18)}3`, 80),
  pad(`15${pad('55551234567', 35)}20261026${num(1, 5)}${num(345000, 18)}SEK${num(2, 8)}`, 80),
  pad('70', 80),
].join('\r\n');

test('BgMax: belopp i öre, datum från insättningen och namn', () => {
  assert.ok(isBgMax(bgmax));
  const p = parseBgMax(bgmax);
  assert.equal(p.length, 2);
  assert.deepEqual([p[0].date, p[0].amount, p[0].ocr, p[0].name], ['2026-10-26', 2450, '100574', 'Eva Ek']);
  assert.equal(p[1].amount, 1000);
});

test('kontoutdrag som CSV med decimalkomma och saldo', () => {
  const csv = [
    'Bokföringsdag;Valutadag;Text;Belopp;Saldo',
    '2026-10-24;2026-10-24;BG 123-4567 OCR 1005 74;2 450,00;15 300,00',
    '2026-10-24;2026-10-24;KORTKÖP ICA;-245,50;12 850,00',
    '2026-10-25;2026-10-25;Swish från Anna Ek;1 310,00;14 160,00',
  ].join('\n');
  const p = parseStatement(csv);
  assert.equal(p.length, 2);
  assert.deepEqual([p[0].date, p[0].amount], ['2026-10-24', 2450]);
  assert.equal(p[1].amount, 1310);
  assert.match(p[0].reference, /OCR 1005 74/);
});

test('matchning: OCR först, sedan unikt belopp, aldrig samma faktura två gånger', () => {
  const inv = (number, ocr, to_pay, extra = {}) => ({ id: `i${number}`, number, ocr, to_pay, kind: 'faktura', status: 'skickad', reminder_fee: 0, ...extra });
  const invoices = [inv(1005, '100574', 2450), inv(1006, '100582', 1250, { reminder_fee: 60 }), inv(1007, '100590', 999), inv(1008, '100608', 500, { status: 'betald' })];
  const rows = matchPayments(
    [
      { date: '2026-10-24', amount: 2450, reference: 'OCR 1005 74', ocr: null },
      { date: '2026-10-24', amount: 1250, reference: '', ocr: '100582' },
      { date: '2026-10-25', amount: 999, reference: 'Swish Bo', ocr: null },
      { date: '2026-10-25', amount: 2450, reference: 'OCR 100574', ocr: null },
      { date: '2026-10-25', amount: 500, reference: '100608', ocr: null },
    ],
    invoices,
  );
  assert.deepEqual(rows.map((r) => [r.invoice?.number ?? null, r.how, r.pick]), [
    [1005, 'ocr', true],
    [1006, 'ocr', false],
    [1007, 'amount', false],
    [null, null, false],
    [null, null, false],
  ]);
  assert.equal(rows[1].note, '60 kr too little');
});

test('okänt format ger inga inbetalningar', () => {
  assert.deepEqual(parsePayments('hej\nhopp'), []);
});
