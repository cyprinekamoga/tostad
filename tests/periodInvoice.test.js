import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invoicedJobIds, periodLines, pickRate, lineText } from '../src/lib/periodInvoice.js';

const rate = { id: 'r', price: 249, vat: 25, rut: true, unit: 'tim' };
const job = (id, day, extra = {}) => ({ id, service: 'hemstadning', street: 'Storgatan 1', starts_at: `2026-10-${day}T07:00:00Z`, ends_at: `2026-10-${day}T10:00:00Z`, staff: ['a'], work_hours: [], ...extra });

test('jobb som redan är fakturerade, utom krediterade', () => {
  const ids = invoicedJobIds([
    { job_id: 'j1', job_ids: [], status: 'skickad', kind: 'faktura' },
    { job_id: null, job_ids: ['j2', 'j3'], status: 'utkast', kind: 'faktura' },
    { job_id: 'j4', job_ids: [], status: 'krediterad', kind: 'faktura' },
  ]);
  assert.deepEqual([...ids].sort(), ['j1', 'j2', 'j3']);
});

test('en rad per jobb med rapporterade timmar, äldst först', () => {
  const { lines, noHours, hours } = periodLines(
    [job('b', '21', { work_hours: [{ hours: 3 }, { hours: 2.5 }] }), job('a', '14', { work_hours: [{ hours: 4 }] })],
    { rate, company: true },
  );
  assert.equal(lines.length, 2);
  assert.equal(lines[0].text, 'Hemstädning 14/10, Storgatan 1');
  assert.equal(lines[0].qty, '4');
  assert.equal(lines[1].qty, '5.5');
  assert.equal(lines[1].price, '249');
  assert.equal(lines[1].rut, false, 'företag får inget rutavdrag');
  assert.equal(noHours, 0);
  assert.equal(hours, 9.5);
});

test('utan rapporterade timmar: planerad tid gånger antal bokade, markerad', () => {
  const { lines, noHours } = periodLines([job('a', '14', { staff: ['a', 'b'] })], { rate, company: false });
  assert.equal(lines[0].qty, '6');
  assert.equal(lines[0].estimated, true);
  assert.equal(lines[0].rut, true);
  assert.equal(noHours, 1);
});

test('överenskommet pris används när inga timmar är rapporterade', () => {
  const { lines } = periodLines([job('a', '14', { price: 1250 })], { rate, company: true });
  assert.equal(lines[0].qty, '1');
  assert.equal(lines[0].price, '1000');
  assert.equal(lines[0].hourly, false);
});

test('timpris och radtext', () => {
  const products = [{ id: 'x', unit: 'st' }, { id: 'y', unit: 'tim' }, { id: 'z', unit: 'tim' }];
  assert.equal(pickRate(products, 'z').id, 'z');
  assert.equal(pickRate(products, 'saknas').id, 'y');
  assert.equal(lineText({ service: 'kontor', starts_at: '2026-11-02T08:00:00Z', city: 'Eskilstuna' }), 'Kontorsstädning 2/11, Eskilstuna');
});
