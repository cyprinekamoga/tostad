import { test } from 'node:test';
import assert from 'node:assert/strict';
import { totals, ocrFor, validOcr, luhnDigit, normalizePnr, exVat, incVat } from '../src/lib/money.js';

test('moms, RUT och öresavrundning', () => {
  // Hemstädning 3 timmar à 476 kr exkl. moms = 1 785 kr inkl. moms, RUT 892 kr.
  const t = totals([{ text: 'Hemstädning', qty: 3, price: 476, vat: 25, rut: true }], 1);
  assert.equal(t.net, 1428);
  assert.equal(t.vat, 357);
  assert.equal(t.total, 1785);
  assert.equal(t.rut, 892);
  assert.equal(t.toPay, 893);
  assert.equal(t.rounding, 0);
});

test('material ger inget RUT, och avrundning till hela kronor', () => {
  const t = totals([
    { qty: 1, price: 1000, vat: 25, rut: true },
    { qty: 1, price: 99.9, vat: 25, rut: false },
  ], 1);
  assert.equal(t.total, 1374.88);
  assert.equal(t.labour, 1250);
  assert.equal(t.rut, 625);
  assert.equal(t.toPay, 750);
  assert.equal(t.rounding, 0.12);
});

test('utan personer blir det inget RUT, och taket gäller', () => {
  assert.equal(totals([{ qty: 1, price: 1000, rut: true }], 0).rut, 0);
  assert.equal(totals([{ qty: 1, price: 200000, rut: true }], 1).rut, 75000);
  assert.equal(totals([{ qty: 1, price: 200000, rut: true }], 2).rut, 125000);
});

test('kreditfaktura ger negativa belopp', () => {
  const t = totals([{ qty: -3, price: 476, vat: 25, rut: true }], 1);
  assert.equal(t.total, -1785);
  assert.equal(t.rut, -892);
  assert.equal(t.toPay, -893);
});

test('OCR med längd- och kontrollsiffra', () => {
  assert.equal(luhnDigit('7992739871'), '3');
  assert.equal(ocrFor(1001), '100164'); // 1001 + längd 6, Luhn över 10016 ger 4
  assert.ok(validOcr(ocrFor(1001)));
  assert.ok(validOcr(ocrFor(123456)));
  assert.ok(!validOcr('100165'));
  assert.ok(!validOcr('10014'));
});

test('personnummer', () => {
  assert.equal(normalizePnr('19811218-9876'), '198112189876');
  assert.equal(normalizePnr('811218-9876'), '198112189876');
  assert.equal(normalizePnr('811218-9875'), null);
  assert.equal(normalizePnr('abc'), null);
});

test('moms fram och tillbaka', () => {
  assert.equal(exVat(1785), 1428);
  assert.equal(incVat(476), 595);
});
