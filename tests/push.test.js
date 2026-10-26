import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outcome, notification } from '../supabase/functions/push/messages.js';

const ev = (...kinds) => kinds.map((kind) => ({ kind }));

test('vad som har hänt för en person och ett jobb', () => {
  assert.equal(outcome(ev('ny'), true), 'ny');
  assert.equal(outcome(ev('borttagen', 'ny'), true), null); // planeringen sparade om laget
  assert.equal(outcome(ev('borttagen', 'ny', 'andrad'), true), 'andrad');
  assert.equal(outcome(ev('ny', 'borttagen'), false), null); // tillagd och bortplockad direkt
  assert.equal(outcome(ev('borttagen'), false), 'borttagen');
  assert.equal(outcome(ev('andrad', 'avbokad'), false), 'avbokad');
  assert.equal(outcome(ev('andrad'), true), 'andrad');
});

test('en notis per person, sammanfattad när det är flera', () => {
  const one = notification([{ kind: 'ny', job_id: 'j1', service: 'hemstadning', starts_at: '2026-10-28T07:00:00Z', city: 'Eskilstuna' }]);
  assert.deepEqual(one, { title: 'New job', body: 'Wed 28 Oct 08:00 · Home cleaning · Eskilstuna', url: '/app/jobb?id=j1', tag: 'job-j1' });
  const many = notification([
    { kind: 'ny', job_id: 'j2', service: 'flytt', starts_at: '2026-10-30T07:00:00Z', city: null },
    { kind: 'avbokad', job_id: 'j1', service: 'hemstadning', starts_at: '2026-10-28T07:00:00Z', city: 'Eskilstuna' },
  ]);
  assert.equal(many.title, '2 changes in your schedule');
  assert.equal(many.body, 'Job cancelled: Wed 28 Oct 08:00 · Home cleaning · Eskilstuna\nNew job: Fri 30 Oct 08:00 · Moving');
  assert.equal(many.url, '/app/schema');
  assert.equal(notification([{ kind: 'ny', job_id: 'a', service: 'flytt', starts_at: '2026-10-30T07:00:00Z' }, { kind: 'ny', job_id: 'b', service: 'flytt', starts_at: '2026-10-31T07:00:00Z' }]).title, '2 new jobs');
});
