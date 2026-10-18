import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleaningBreakdown,
  flyttstadningPrice,
  fonsterputsPrice,
  hourlyCleaningPrice,
  movePrice,
  packagePrice,
  rutDeduction,
  formatKr,
  MIN_HOURS,
} from '../src/lib/pricing.js';
import { postcodeStatus } from '../src/data/areas.js';

test('flyttstädning matchar prislistan: 45 kr/kvm efter RUT', () => {
  const r = flyttstadningPrice({ sqm: 60 });
  assert.equal(r.pay, 2700);
  assert.equal(r.full, 5400);
  assert.equal(r.rut, 2700);
});

test('flyttstädning med fönster', () => {
  const r = flyttstadningPrice({ sqm: 60, windows2: 4, windows4: 2 });
  assert.equal(r.pay, 2700 + 4 * 64 + 2 * 99);
  assert.equal(r.windows, 4 * 64 + 2 * 99);
});

test('paketrabatt dras på flyttstädningen', () => {
  const r = flyttstadningPrice({ sqm: 50, discount: 0.1 });
  assert.equal(r.pay, 2025);
  assert.equal(r.discountKr, 225);
});

test('Rutuppdelning för städning: priset före RUT är det dubbla', () => {
  assert.deepEqual(cleaningBreakdown(1000), { full: 2000, rut: 1000, pay: 1000 });
});

test('hemstädning har minst två timmar och regelbunden rabatt', () => {
  assert.equal(hourlyCleaningPrice({ hours: 1 }).hours, MIN_HOURS);
  assert.equal(hourlyCleaningPrice({ hours: 3 }).pay, 375);
  assert.equal(hourlyCleaningPrice({ hours: 4, recurring: true }).pay, 450);
  assert.equal(hourlyCleaningPrice({ service: 'storstadning', hours: 4, recurring: true }).pay, 640);
});

test('flytt 2 rok vardag med 2 flyttare: samma timpris som prislistan', () => {
  const r = movePrice({ size: '2', distanceKm: 0 });
  assert.equal(r.crew, '2-1');
  assert.equal(r.hours, 4);
  assert.equal(r.rate, 595);
  assert.equal(r.price, 2380);
});

test('helgpris används på helger', () => {
  const r = movePrice({ size: '2', distanceKm: 0, weekend: true });
  assert.equal(r.price, 4 * 795);
});

test('trappor utan hiss, bärväg och avstånd ger mer tid och avrundas uppåt till halvtimme', () => {
  const r = movePrice({ size: '2', distanceKm: 20, floorsFrom: 4, elevatorFrom: false, longCarry: true });
  // 4 h + 20/35 h + 3 × 0,25 h + 0,5 h = 5,82 h → 6 h
  assert.equal(r.hours, 6);
  assert.equal(r.price, 6 * 595);
});

test('företagsflytt använder företagspriser utan RUT', () => {
  const r = movePrice({ size: '3', distanceKm: 0, business: true });
  assert.equal(r.crew, '3-1');
  assert.equal(r.rate, 1512);
  assert.equal(r.price, 4 * 1512);
});

test('paketpris = flytt + rabatterad flyttstädning', () => {
  const r = packagePrice({ size: '1', distanceKm: 0 }, { sqm: 35 }, 0.1);
  assert.equal(r.move.price, 3 * 595);
  assert.equal(r.clean.pay, Math.round(35 * 45 * 0.9));
  assert.equal(r.total, r.move.price + r.clean.pay);
});

test('fönsterputs', () => {
  assert.equal(fonsterputsPrice({ windows2: 10 }).pay, 640);
});

test('Taket för rutavdrag är 75 000 kr per person', () => {
  assert.deepEqual(rutDeduction(10000), { rut: 5000, pay: 5000, capped: false });
  const big = rutDeduction(200000, 1);
  assert.equal(big.rut, 75000);
  assert.equal(big.capped, true);
  assert.equal(rutDeduction(200000, 2).rut, 100000);
});

test('kronformat med svenskt tusentalsavgränsare', () => {
  assert.match(formatKr(12500), /^12\s500 kr$/);
});


test('postnummerkontroll: Stockholms län ja, övriga frågar vi om', () => {
  assert.equal(postcodeStatus('194 37'), 'yes');
  assert.equal(postcodeStatus('11122'), 'yes');
  assert.equal(postcodeStatus('76150'), 'yes');
  assert.equal(postcodeStatus('753 20'), 'yes'); // Uppsala
  assert.equal(postcodeStatus('746 30'), 'yes'); // Bålsta
  assert.equal(postcodeStatus('815 38'), 'yes'); // Tierp
  assert.equal(postcodeStatus('632 20'), 'yes'); // Eskilstuna
  assert.equal(postcodeStatus('611 30'), 'yes'); // Nyköping
  assert.equal(postcodeStatus('645 30'), 'yes'); // Strängnäs
  assert.equal(postcodeStatus('41101'), 'ask'); // Göteborg
  assert.equal(postcodeStatus('614 30'), 'ask'); // Söderköping, Östergötland
  assert.equal(postcodeStatus('722 11'), 'ask'); // Västerås
  assert.equal(postcodeStatus('123'), 'invalid');
});
