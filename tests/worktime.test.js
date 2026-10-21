import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checklistFor, entryHours, sumHours, formatHours, CHECKLISTS } from '../src/lib/worktime.js';

test('checklista: egen lista före standardlistan', () => {
  assert.deepEqual(checklistFor({ service: 'kontor', checklist: [{ label: 'A', done: true }] }), [{ label: 'A', done: true }]);
  assert.equal(checklistFor({ service: 'flyttstadning', checklist: [] }).length, CHECKLISTS.flyttstadning.length);
  assert.equal(checklistFor({ service: 'okand' }).length, CHECKLISTS.annat.length);
});

test('timmar per dag och vecka', () => {
  const entries = [
    { started_at: '2026-10-19T06:00:00Z', ended_at: '2026-10-19T10:30:00Z' }, // måndag 08:00 till 12:30
    { started_at: '2026-10-20T06:00:00Z', ended_at: '2026-10-20T14:00:00Z' },
    { started_at: '2026-10-26T07:00:00Z', ended_at: null }, // pågår, vintertid
  ];
  const now = Date.parse('2026-10-26T09:00:00Z');
  const s = sumHours(entries, now);
  assert.equal(s.days['2026-10-19'], 4.5);
  assert.equal(s.weeks['2026-10-19'], 12.5);
  assert.equal(s.weeks['2026-10-26'], 2);
  assert.equal(s.total, 14.5);
  assert.equal(entryHours(entries[2], now), 2);
});

test('formatHours', () => {
  assert.equal(formatHours(7.5), '7 h 30 min');
  assert.equal(formatHours(2), '2 h');
  assert.equal(formatHours(0.25), '15 min');
});
