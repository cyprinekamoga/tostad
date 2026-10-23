// Gör om kalkylatorns uppgifter ("tjanst=paket, storlek=2, km=10, ...") till läsbara rader
// för inkorgen. Bara det som gäller den valda tjänsten visas.
import { HOME_SIZES, PRICES } from './pricing.js';

const SERVICES = {
  flytt: 'Flytt',
  flyttstadning: 'Flyttstädning',
  paket: 'Flytt + flyttstädning',
  hemstadning: 'Hemstädning',
  storstadning: 'Storstädning',
  fonsterputs: 'Fönsterputs',
  kontor: 'Kontorsstädning',
};

/** "a=1, b=2" till { a: '1', b: '2' }. */
export function parseCalc(text) {
  const out = {};
  for (const part of String(text ?? '').split(/,\s*/)) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

const num = (v) => Number(String(v ?? '').replace(',', '.')) || 0;
const plural = (n, one, many) => `${String(n).replace('.', ',')} ${n === 1 ? one : many}`;
const floor = (level, lift) => {
  const n = num(level);
  const where = n === 0 ? 'Bottenvåning' : `Våning ${n}`;
  return n === 0 ? where : `${where}, ${lift === 'ja' ? 'hiss finns' : 'ingen hiss'}`;
};
const windows = (two, four) => {
  const a = num(two);
  const b = num(four);
  if (!a && !b) return 'Inga';
  return [a && plural(a, 'tvåsidigt', 'tvåsidiga'), b && plural(b, 'fyrsidigt', 'fyrsidiga')].filter(Boolean).join(' och ');
};

/** Läsbara rader [etikett, värde] för tjänsten i kalkylen. */
export function describeCalc(text) {
  const c = parseCalc(text);
  const s = c.tjanst;
  const rows = [];
  if (SERVICES[s]) rows.push(['Tjänst', SERVICES[s]]);

  if (s === 'flytt' || s === 'paket') {
    if (c.storlek) rows.push(['Bostad', HOME_SIZES[c.storlek]?.label ?? (c.storlek === 'annat' ? 'Annat eller företag' : c.storlek)]);
    rows.push(['Dag', c.dag === 'helg' ? 'Helg' : 'Vardag']);
    if (c.km) rows.push(['Avstånd', `${num(c.km)} km`]);
    if (c.vaningFran !== undefined) rows.push(['Flyttar från', floor(c.vaningFran, c.hissFran)]);
    if (c.vaningTill !== undefined) rows.push(['Flyttar till', floor(c.vaningTill, c.hissTill)]);
    rows.push(['Lång bärväg (över 25 m)', c.langBarvag === 'ja' ? 'Ja' : 'Nej']);
    rows.push(['Packhjälp', c.packning === 'ja' ? 'Ja' : 'Nej']);
    if (s === 'flytt' && c.foretag === 'ja') rows.push(['Företagsflytt', 'Ja, pris exkl. moms utan RUT']);
    const crews = c.foretag === 'ja' ? PRICES.foretagsflytt.crews : PRICES.flytt.crews;
    rows.push(['Bemanning', !c.bemanning || c.bemanning === 'auto' ? 'Rekommenderad för bostaden' : crews[c.bemanning]?.label ?? c.bemanning]);
  }
  if (s === 'flyttstadning' || s === 'paket') {
    if (c.kvm) rows.push([s === 'paket' ? 'Yta att flyttstäda' : 'Yta', `${num(c.kvm)} kvm`]);
    rows.push(['Fönsterputs', windows(c.fonster2, c.fonster4)]);
  }
  if (s === 'hemstadning' || s === 'storstadning') {
    if (c.timmar) rows.push(['Tid', plural(num(c.timmar), 'timme', 'timmar')]);
    if (s === 'hemstadning') rows.push(['Regelbunden städning', c.regelbunden === 'ja' ? 'Ja, 10 % rabatt' : 'Nej, en gång']);
  }
  if (s === 'fonsterputs') rows.push(['Fönster', windows(c.fp2, c.fp4)]);
  if (s === 'kontor') {
    if (c.kontorTimmar) rows.push(['Tid per besök', plural(num(c.kontorTimmar), 'timme', 'timmar')]);
    if (c.besok) rows.push(['Besök per månad', String(num(c.besok))]);
  }
  if (c.pris && num(c.pris)) rows.push(['Pris', `${new Intl.NumberFormat('sv-SE').format(num(c.pris))} kr${s === 'kontor' || c.foretag === 'ja' ? ' exkl. moms' : ' efter RUT'}`]);
  return rows;
}
