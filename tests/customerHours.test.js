import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobRow, countable, byCustomer, byProvider, monthsUpTo, OWN, NO_CUSTOMER } from '../src/lib/customerHours.js';

const sas = { id: 'c1', name: 'Spic and Span', kind: 'company' };
const anna = { id: 'c2', name: 'Anna', kind: 'private' };
const job = (id, start, hours, customer, entries, extra = {}) => ({
  id,
  starts_at: start,
  ends_at: new Date(new Date(start).getTime() + hours * 3600000).toISOString(),
  status: 'klar',
  customer_id: customer?.id ?? null,
  customers: customer ?? null,
  street: 'Kocksgatan 11',
  work_hours: entries.map((h) => ({ hours: String(h) })),
  ...extra,
});

test('ett jobb blir en rad med arbetade timmar och timmar på plats', () => {
  const r = jobRow(job('j1', '2026-10-16T07:00:00Z', 3, sas, [3, 3]));
  assert.equal(r.month, '2026-10');
  assert.equal(r.provider, 'Spic and Span');
  assert.equal(r.siteHours, 3);
  assert.equal(r.staffHours, 6);
  assert.equal(r.people, 2);
});

test('månaden räknas i svensk tid', () => {
  // 30 september 23:30 UTC är 1 oktober i Sverige
  assert.equal(jobRow(job('j', '2026-09-30T23:30:00Z', 2, anna, [])).month, '2026-10');
});

test('privatkunder är egna kunder, jobb utan kund grupperas per adress', () => {
  assert.equal(jobRow(job('j', '2026-10-01T08:00:00Z', 2, anna, [])).provider, OWN);
  const r = jobRow(job('j', '2026-10-01T08:00:00Z', 2, null, [4]));
  assert.equal(r.provider, NO_CUSTOMER);
  assert.equal(r.customerName, 'Kocksgatan 11 (no customer)');
});

test('timmar per kund, avbokade jobb räknas inte', () => {
  const rows = countable([
    job('a', '2026-10-01T08:00:00Z', 3, sas, [3]),
    job('b', '2026-10-02T08:00:00Z', 2, sas, [2, 1.5]),
    job('c', '2026-10-03T08:00:00Z', 4, anna, []),
    job('d', '2026-10-04T08:00:00Z', 4, sas, [4], { status: 'avbokad' }),
  ]);
  const list = byCustomer(rows);
  assert.equal(list[0].name, 'Spic and Span');
  assert.equal(list[0].jobs, 2);
  assert.equal(list[0].staffHours, 6.5);
  assert.equal(list[0].siteHours, 5);
  assert.equal(list[1].unreported, 1);
});

test('jobb per uppdragsgivare och månad', () => {
  const months = monthsUpTo('2026-10', 2);
  assert.deepEqual(months, ['2026-09', '2026-10']);
  const rows = countable([
    job('a', '2026-09-10T08:00:00Z', 3, sas, [3]),
    job('b', '2026-10-02T08:00:00Z', 2, sas, [2]),
    job('c', '2026-10-03T08:00:00Z', 4, anna, [4]),
    job('d', '2026-08-03T08:00:00Z', 4, anna, [4]),
  ]);
  const list = byProvider(rows, months);
  assert.equal(list[0].name, 'Spic and Span');
  assert.equal(list[0].months['2026-09'].jobs, 1);
  assert.equal(list[0].total.staffHours, 5);
  assert.equal(list[1].total.jobs, 1);
});

test('månader över ett årsskifte', () => {
  assert.deepEqual(monthsUpTo('2026-02', 4), ['2025-11', '2025-12', '2026-01', '2026-02']);
});
