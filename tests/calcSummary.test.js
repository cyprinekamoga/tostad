import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeCalc, parseCalc } from '../src/lib/calcSummary.js';

const sample = 'tjanst=paket, storlek=2, dag=vardag, km=10, vaningFran=6, hissFran=ja, vaningTill=2, hissTill=ja, langBarvag=ja, bemanning=auto, kvm=46, fonster2=2, fonster4=0, timmar=3, fp2=8, fp4=0, kontorTimmar=4, besok=4, pris=4953';

test('kalkylen tolkas', () => {
  assert.equal(parseCalc(sample).kvm, '46');
});

test('paket visar bara det som gäller flytt och flyttstädning', () => {
  const rows = Object.fromEntries(describeCalc(sample));
  assert.equal(rows['Tjänst'], 'Flytt + flyttstädning');
  assert.match(rows['Bostad'], /^2 rum och kök/);
  assert.equal(rows['Flyttar från'], 'Våning 6, hiss finns');
  assert.equal(rows['Lång bärväg (över 25 m)'], 'Ja');
  assert.equal(rows['Packhjälp'], 'Nej');
  assert.equal(rows['Fönsterputs'], '2 tvåsidiga');
  assert.match(rows['Pris'], /^4\s953 kr efter RUT$/);
  assert.equal(rows['Tid'], undefined);
  assert.equal(rows['Besök per månad'], undefined);
});

test('hemstädning och fönsterputs', () => {
  assert.deepEqual(describeCalc('tjanst=hemstadning, timmar=3.5, regelbunden=ja, pris=438'), [
    ['Tjänst', 'Hemstädning'],
    ['Tid', '3,5 timmar'],
    ['Regelbunden städning', 'Ja, 10 % rabatt'],
    ['Pris', '438 kr efter RUT'],
  ]);
  assert.equal(Object.fromEntries(describeCalc('tjanst=fonsterputs, fp2=1, fp4=3'))['Fönster'], '1 tvåsidigt och 3 fyrsidiga');
  assert.equal(Object.fromEntries(describeCalc('tjanst=flytt, vaningFran=0'))['Flyttar från'], 'Bottenvåning');
});
