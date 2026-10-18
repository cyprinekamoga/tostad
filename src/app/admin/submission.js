// Etiketter och korta sammanfattningar för det som kommer in via webbplatsens formulär.
import { HOME_SIZES } from '../../lib/pricing.js';

export const KIND = { bokning: 'Bokning', kontakt: 'Meddelande', skadeanmalan: 'Skadeanmälan' };
export const STATUS = { ny: 'Ny', hanterad: 'Hanterad', arkiverad: 'Arkiverad' };

const SERVICES = {
  flytt: 'Flytt',
  flyttstadning: 'Flyttstädning',
  paket: 'Flytt + flyttstädning',
  hemstadning: 'Hemstädning',
  storstadning: 'Storstädning',
  fonsterputs: 'Fönsterputs',
  kontor: 'Kontorsstädning',
  pianoflytt: 'Pianoflytt / tunga lyft',
};

// Ordning och etiketter när ett ärende visas i sin helhet.
export const FIELDS = [
  ['tjanst', 'Tjänst'],
  ['pris', 'Pris från kalkylatorn'],
  ['datum', 'Datum'],
  ['tid', 'Tid'],
  ['flexibel', 'Flexibel med datum'],
  ['adress', 'Adress'],
  ['postnummer', 'Postnummer'],
  ['nyAdress', 'Ny adress'],
  ['storlek', 'Bostad'],
  ['kvm', 'Kvadratmeter'],
  ['vaningOchHiss', 'Våning och hiss'],
  ['typ', 'Gäller'],
  ['beskrivning', 'Beskrivning'],
  ['meddelande', 'Meddelande'],
  ['ovrigt', 'Övrigt'],
  ['namn', 'Namn'],
  ['telefon', 'Telefon'],
  ['epost', 'Mejl'],
  ['kontakt', 'Kontakt'],
  ['kontaktsatt', 'Vill bli kontaktad via'],
  ['sprak', 'Språk'],
  ['kalkyl', 'Kalkyl'],
  ['samtycke', 'Samtycke'],
];

export function fieldValue(key, value) {
  if (key === 'tjanst') return SERVICES[value] ?? value;
  if (key === 'storlek') return HOME_SIZES[value]?.label ?? (value === 'annat' ? 'Annat eller företag' : value);
  if (key === 'pris' && /^\d+$/.test(value)) return `${Number(value).toLocaleString('sv-SE')} kr`;
  if (key === 'sprak') return value === 'en' ? 'Engelska' : 'Svenska';
  return value;
}

/** En rad som beskriver ärendet i listan. */
export function summary(s) {
  const d = s.data ?? {};
  if (s.kind === 'bokning') return [SERVICES[d.tjanst] ?? d.tjanst, d.datum, d.adress].filter(Boolean).join(' · ');
  if (s.kind === 'skadeanmalan') return [d.typ, d.beskrivning].filter(Boolean).join(' · ');
  return d.meddelande ?? '';
}
