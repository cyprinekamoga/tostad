import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invoiceMatch, searchInvoices, ocrQuery, formatOcr } from '../src/lib/invoiceSearch.js';

const a = { number: 1001, ocr: '100161', to_pay: 1450, rut: 1450, buyer: { name: 'Anna Andersson', email: 'anna@example.se', phone: '070-123 45 67' } };
const b = { number: 1002, ocr: '100269', to_pay: 2900, paid_amount: 2900, rut: 0, buyer: { name: 'Bo Berg AB' } };

test('OCR med mellanslag och bindestreck hittar fakturan', () => {
  assert.equal(invoiceMatch(a, '1001 61'), 3);
  assert.equal(invoiceMatch(a, '100-161'), 3);
  assert.deepEqual(searchInvoices([b, a], ' 100161 '), [a]);
});

test('fakturanummer, belopp och namn', () => {
  assert.equal(invoiceMatch(b, '1002'), 3);
  assert.equal(invoiceMatch(b, '2 900 kr'), 2);
  assert.equal(invoiceMatch(a, 'anders'), 1);
  assert.equal(invoiceMatch(a, '1234567'), 1);
  assert.equal(invoiceMatch(b, 'anna'), 0);
  assert.deepEqual(searchInvoices([a, b], ''), [a, b]);
});

test('ocrQuery och formatOcr', () => {
  assert.equal(ocrQuery('1001 61'), '100161');
  assert.equal(ocrQuery('Anna'), null);
  assert.equal(ocrQuery('100'), null);
  assert.equal(formatOcr('1234567890'), '1234 5678 90');
});
