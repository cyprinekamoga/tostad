import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outcome, notification, submissionNotification } from '../supabase/functions/push/messages.js';

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

test('notis till administratörerna om en ny bokning eller ett meddelande', () => {
  const b = submissionNotification({ id: 'abc', kind: 'bokning', data: { namn: 'Anna Svensson', tjanst: 'flyttstadning', datum: '2026-11-12', adress: 'Storgatan 1' } });
  assert.equal(b.title, 'New booking');
  assert.equal(b.body, 'Anna Svensson · Move-out cleaning · Thu 12 Nov · Storgatan 1');
  assert.equal(b.url, '/admin/inkorg#abc');
  const m = submissionNotification({ id: 'x', kind: 'kontakt', data: { namn: 'Bo', meddelande: 'Hej! Kan ni städa?' } });
  assert.equal(m.title, 'New message');
  assert.equal(m.body, 'Bo · Hej! Kan ni städa?');
});
