import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeCalc, parseCalc } from '../src/lib/calcSummary.js';

const sample = 'tjanst=paket, storlek=2, dag=vardag, km=10, vaningFran=6, hissFran=ja, vaningTill=2, hissTill=ja, langBarvag=ja, bemanning=auto, kvm=46, fonster2=2, fonster4=0, timmar=3, fp2=8, fp4=0, kontorTimmar=4, besok=4, pris=4953';

test('kalkylen tolkas', () => {
  assert.equal(parseCalc(sample).kvm, '46');
});

test('paket visar bara det som gäller flytt och flyttstädning', () => {
  const rows = Object.fromEntries(describeCalc(sample));
  assert.equal(rows['Service'], 'Moving + move-out cleaning');
  assert.match(rows['Home'], /^2 rooms and kitchen/);
  assert.equal(rows['Moving from'], 'Floor 6, with lift');
  assert.equal(rows['Long carry (over 25 m)'], 'Yes');
  assert.equal(rows['Packing help'], 'No');
  assert.equal(rows['Window cleaning'], '2 two-sided');
  assert.match(rows['Price'], /^4\s953 kr after RUT$/);
  assert.equal(rows['Time'], undefined);
  assert.equal(rows['Visits per month'], undefined);
});

test('hemstädning och fönsterputs', () => {
  assert.deepEqual(describeCalc('tjanst=hemstadning, timmar=3.5, regelbunden=ja, pris=438'), [
    ['Service', 'Home cleaning'],
    ['Time', '3.5 hours'],
    ['Regular cleaning', 'Yes, 10% discount'],
    ['Price', '438 kr after RUT'],
  ]);
  assert.equal(Object.fromEntries(describeCalc('tjanst=fonsterputs, fp2=1, fp4=3'))['Windows'], '1 two-sided and 3 four-sided');
  assert.equal(Object.fromEntries(describeCalc('tjanst=flytt, vaningFran=0'))['Moving from'], 'Ground floor');
  assert.equal(Object.fromEntries(describeCalc('tjanst=flytt, bemanning=3-2'))['Crew'], '3 movers + 2 trucks');
});
