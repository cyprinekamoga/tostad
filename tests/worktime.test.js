import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checklistFor, entryHours, sumHours, formatHours, parseHours, jobHours, CHECKLISTS } from '../src/lib/worktime.js';

test('checklista: egen lista före standardlistan', () => {
  assert.deepEqual(checklistFor({ service: 'kontor', checklist: [{ label: 'A', done: true }] }), [{ label: 'A', done: true }]);
  assert.equal(checklistFor({ service: 'flyttstadning', checklist: [] }).length, CHECKLISTS.flyttstadning.length);
  assert.equal(checklistFor({ service: 'okand' }).length, CHECKLISTS.annat.length);
});

test('timmar per dag och vecka', () => {
  const entries = [
    { work_date: '2026-10-19', hours: '4.50' }, // måndag
    { work_date: '2026-10-20', hours: 8 },
    { work_date: '2026-10-26', hours: 2 },
  ];
  const s = sumHours(entries);
  assert.equal(s.days['2026-10-19'], 4.5);
  assert.equal(s.weeks['2026-10-19'], 12.5);
  assert.equal(s.weeks['2026-10-26'], 2);
  assert.equal(s.total, 14.5);
  assert.equal(entryHours(entries[0]), 4.5);
});

test('parseHours', () => {
  assert.equal(parseHours('3,5'), 3.5);
  assert.equal(parseHours('3.5'), 3.5);
  assert.equal(parseHours('3:30'), 3.5);
  assert.equal(parseHours('2.1'), 2);
  assert.equal(parseHours('0'), null);
  assert.equal(parseHours('17'), null);
  assert.equal(parseHours('tre'), null);
  assert.equal(parseHours(''), null);
});

test('jobHours avrundar till kvart', () => {
  assert.equal(jobHours({ start: 0, end: 3 * 3600000 + 20 * 60000 }), 3.25);
  assert.equal(jobHours({ start: 0, end: 0 }), 0.25);
});

test('formatHours', () => {
  assert.equal(formatHours(7.5), '7 h 30 min');
  assert.equal(formatHours(2), '2 h');
  assert.equal(formatHours(0.25), '15 min');
});
