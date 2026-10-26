// Gör om kalkylatorns uppgifter ("tjanst=paket, storlek=2, km=10, ...") till läsbara rader
// för inkorgen. Bara det som gäller den valda tjänsten visas.

const SERVICES = {
  flytt: 'Moving',
  flyttstadning: 'Move-out cleaning',
  paket: 'Moving + move-out cleaning',
  hemstadning: 'Home cleaning',
  storstadning: 'Deep cleaning',
  fonsterputs: 'Window cleaning',
  kontor: 'Office cleaning',
};

// Samma storlekar och bemanning som i pricing.js, på engelska för administrationen.
export const HOME_SIZES_EN = {
  '1': '1 room and kitchen (up to about 40 m²)',
  '2': '2 rooms and kitchen (about 40 to 60 m²)',
  '3': '3 rooms and kitchen (about 60 to 85 m²)',
  '4': '4 rooms and kitchen (about 85 to 110 m²)',
  villa: 'House or townhouse (about 110 to 150 m²)',
  annat: 'Other or company',
};
const CREWS = {
  '2-1': '2 movers + 1 truck',
  '2-2': '2 movers + 2 trucks',
  '3-1': '3 movers + 1 truck',
  '3-2': '3 movers + 2 trucks',
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
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const floor = (level, lift) => {
  const n = num(level);
  if (n === 0) return 'Ground floor';
  return `Floor ${n}, ${lift === 'ja' ? 'with lift' : 'no lift'}`;
};
const windows = (two, four) => {
  const a = num(two);
  const b = num(four);
  if (!a && !b) return 'None';
  return [a && plural(a, 'two-sided', 'two-sided'), b && plural(b, 'four-sided', 'four-sided')].filter(Boolean).join(' and ');
};
const yes = (v) => (v === 'ja' ? 'Yes' : 'No');

/** Läsbara rader [etikett, värde] för tjänsten i kalkylen. */
export function describeCalc(text) {
  const c = parseCalc(text);
  const s = c.tjanst;
  const rows = [];
  if (SERVICES[s]) rows.push(['Service', SERVICES[s]]);

  if (s === 'flytt' || s === 'paket') {
    if (c.storlek) rows.push(['Home', HOME_SIZES_EN[c.storlek] ?? c.storlek]);
    rows.push(['Day', c.dag === 'helg' ? 'Weekend' : 'Weekday']);
    if (c.km) rows.push(['Distance', `${num(c.km)} km`]);
    if (c.vaningFran !== undefined) rows.push(['Moving from', floor(c.vaningFran, c.hissFran)]);
    if (c.vaningTill !== undefined) rows.push(['Moving to', floor(c.vaningTill, c.hissTill)]);
    rows.push(['Long carry (over 25 m)', yes(c.langBarvag)]);
    rows.push(['Packing help', yes(c.packning)]);
    if (s === 'flytt' && c.foretag === 'ja') rows.push(['Company move', 'Yes, price excl. VAT without RUT']);
    rows.push(['Crew', !c.bemanning || c.bemanning === 'auto' ? 'Recommended for the home' : CREWS[c.bemanning] ?? c.bemanning]);
  }
  if (s === 'flyttstadning' || s === 'paket') {
    if (c.kvm) rows.push([s === 'paket' ? 'Area to clean' : 'Area', `${num(c.kvm)} m²`]);
    rows.push(['Window cleaning', windows(c.fonster2, c.fonster4)]);
  }
  if (s === 'hemstadning' || s === 'storstadning') {
    if (c.timmar) rows.push(['Time', plural(num(c.timmar), 'hour', 'hours')]);
    if (s === 'hemstadning') rows.push(['Regular cleaning', c.regelbunden === 'ja' ? 'Yes, 10% discount' : 'No, one time']);
  }
  if (s === 'fonsterputs') rows.push(['Windows', windows(c.fp2, c.fp4)]);
  if (s === 'kontor') {
    if (c.kontorKvm) rows.push(['Office area', `${num(c.kontorKvm)} m²`]);
    if (c.frekvens) rows.push(['How often', { varannan: 'Every other week', 1: 'Once a week', 2: 'Twice a week', 3: '3 times a week', 5: 'Every weekday' }[c.frekvens] ?? c.frekvens]);
    if (c.kontorKvm) rows.push(['Supplies', c.material === 'ja' ? 'Yes, we bring them' : 'No, the customer provides them']);
    if (c.kontorTimmar) rows.push(['Time per visit', plural(num(c.kontorTimmar), 'hour', 'hours')]);
    if (c.besok) rows.push(['Visits per month', String(num(c.besok))]);
  }
  if (c.pris && num(c.pris)) rows.push([s === 'kontor' && c.kontorKvm ? 'Estimated price per month' : 'Price', `${new Intl.NumberFormat('sv-SE').format(num(c.pris))} kr${s === 'kontor' || c.foretag === 'ja' ? ' excl. VAT' : ' after RUT'}`]);
  return rows;
}
