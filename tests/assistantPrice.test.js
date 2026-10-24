import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestPrice } from '../src/lib/assistantPrice.js';

const basis = (b) => ({ sqm: null, rooms: null, windows2: null, windows4: null, clean_hours: null, recurring: false, company: false, same_as_last_time: false, ...b });

test('flyttstädning privat och företag', () => {
  const a = { service: 'flyttstadning', price_basis: basis({ sqm: 74 }) };
  assert.equal(suggestPrice(a).price, 3330); // 74 × 45
  assert.equal(suggestPrice(a, { company: true }).price, 6660); // utan RUT
  assert.match(suggestPrice({ service: 'flyttstadning', price_basis: basis({ rooms: '1' }) }).basis, /estimated from rooms/);
});

test('fönsterputs med spröjs', () => {
  const a = { service: 'fonsterputs', price_basis: basis({ windows2: 8, windows4: 4 }) };
  assert.equal(suggestPrice(a).price, 8 * 64 + 4 * 99);
});

test('hemstädning regelbunden och kontor', () => {
  assert.equal(suggestPrice({ service: 'hemstadning', price_basis: basis({ clean_hours: 4, recurring: true }) }).price, 450);
  assert.equal(suggestPrice({ service: 'kontor', hours: 2, price_basis: null }).price, 623);
});

test('pris i texten går före och okänt ger null', () => {
  assert.equal(suggestPrice({ service: 'flyttstadning', price_explicit: 2500, price_basis: null }).price, 2500);
  assert.equal(suggestPrice({ service: 'flyttstadning', price_basis: null }), null);
  assert.equal(suggestPrice({ service: 'annat', price_basis: null, hours: 3 }), null);
});
