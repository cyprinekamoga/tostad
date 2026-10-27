import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smsPhone, unfilled } from '../supabase/functions/sms/messages.js';

test('mobilnummer till 46elks-format', () => {
  assert.equal(smsPhone('070-123 45 67'), '+46701234567');
  assert.equal(smsPhone('+46 70 123 45 67'), '+46701234567');
  assert.equal(smsPhone('0046701234567'), '+46701234567');
  assert.equal(smsPhone('+460736407366'), '+46736407366');
  assert.equal(smsPhone('08-123 456 78'), null);
  assert.equal(smsPhone(''), null);
});

test('mallar: platshållare som inte är ifyllda', () => {
  assert.deepEqual(unfilled('Vi kommer [dag] kl [tid], [tid].'), ['[dag]', '[tid]']);
  assert.deepEqual(unfilled('Vi kommer fredag kl 09:00.'), []);
});
