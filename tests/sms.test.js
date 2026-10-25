import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smsPhone, fill, plan, isSendTime, swedishMidnight } from '../supabase/functions/sms/messages.js';

const settings = {
  phone: '072 222 88 00',
  sms_company_customers: false,
  sms_customer_text: 'Hej {namn}! Påminnelse: {tjanst} imorgon {datum} kl {tid}, {adress}. {team} kommer. Frågor? Ring {telefon} /TO Städ & Flytt',
  sms_staff_text: 'Hi {namn}! Your jobs tomorrow, {datum}:\n{jobb}\nDetails in the app: tostadflytt.se/app',
};
const anna = { id: 'p1', full_name: 'Anna Svensson', phone: '070-111 22 33', active: true };
const omar = { id: 'p2', full_name: 'Omar Ali', phone: null, active: true };

test('mobilnummer till 46elks-format', () => {
  assert.equal(smsPhone('070-123 45 67'), '+46701234567');
  assert.equal(smsPhone('+46 70 123 45 67'), '+46701234567');
  assert.equal(smsPhone('0046701234567'), '+46701234567');
  assert.equal(smsPhone('+460736407366'), '+46736407366');
  assert.equal(smsPhone('08-123 456 78'), null);
  assert.equal(smsPhone(''), null);
  assert.equal(smsPhone('+4479460000000'.slice(0, 13)), '+447946000000');
});

test('mallar fylls i', () => {
  assert.equal(fill('Hej {namn}, {okand}', { namn: 'Sara' }), 'Hej Sara, {okand}');
});

test('svensk midnatt med vintertid', () => {
  assert.equal(swedishMidnight('2026-10-30').toISOString(), '2026-10-29T23:00:00.000Z');
  assert.equal(swedishMidnight('2026-07-01').toISOString(), '2026-06-30T22:00:00.000Z');
});

test('sändtid i svensk tid', () => {
  assert.equal(isSendTime(new Date('2026-10-29T17:02:00Z'), 18), true); // 18:02 vintertid
  assert.equal(isSendTime(new Date('2026-10-29T16:02:00Z'), 18), false); // 17:02
  assert.equal(isSendTime(new Date('2026-10-29T21:30:00Z'), 18), false); // 22:30
});

test('SMS till kund och personal kvällen före', () => {
  const jobs = [
    { id: 'j1', status: 'planerad', service: 'flyttstadning', starts_at: '2026-10-30T07:00:00Z', street: 'Kungsgatan 12', city: 'Eskilstuna', customers: { id: 'c1', name: 'Sara Lind', phone: '0701234567', kind: 'private' }, job_staff: [{ profiles: anna }, { profiles: omar }] },
    { id: 'j2', status: 'planerad', service: 'hemstadning', starts_at: '2026-10-30T12:00:00Z', street: 'Storgatan 1', city: null, customers: { id: 'c2', name: 'Spic and Span', phone: '0709999999', kind: 'company' }, job_staff: [{ profiles: anna }] },
    { id: 'j3', status: 'avbokad', service: 'hemstadning', starts_at: '2026-10-30T09:00:00Z', customers: { id: 'c3', name: 'Bo', phone: '0708888888', kind: 'private' }, job_staff: [] },
    { id: 'j4', status: 'planerad', service: 'hemstadning', starts_at: '2026-10-31T09:00:00Z', customers: { id: 'c4', name: 'Eva', phone: '0707777777', kind: 'private' }, job_staff: [] },
  ];
  const out = plan(jobs, settings, '2026-10-30');
  const sara = out.find((m) => m.job_id === 'j1');
  assert.equal(sara.phone, '+46701234567');
  assert.equal(sara.body, 'Hej Sara! Påminnelse: flyttstädning imorgon 30/10 kl 08:00, Kungsgatan 12, Eskilstuna. Anna och Omar kommer. Frågor? Ring 072 222 88 00 /TO Städ & Flytt');
  assert.equal(out.find((m) => m.job_id === 'j2').skip, 'Company customer (turned off in the settings)');
  assert.equal(out.some((m) => m.job_id === 'j3' || m.job_id === 'j4'), false);
  const staff = out.find((m) => m.profile_id === 'p1');
  assert.equal(staff.body, 'Hi Anna! Your jobs tomorrow, Friday 30 October:\n08:00 Move-out cleaning, Kungsgatan 12, Eskilstuna\n13:00 Home cleaning, Storgatan 1\nDetails in the app: tostadflytt.se/app');
  assert.equal(out.find((m) => m.profile_id === 'p2').skip, 'No phone number');

  const withCompanies = plan(jobs, { ...settings, sms_company_customers: true }, '2026-10-30');
  assert.match(withCompanies.find((m) => m.job_id === 'j2').body, /^Hej Spic and Span!/);
});
