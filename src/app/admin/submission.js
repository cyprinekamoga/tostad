// Etiketter och korta sammanfattningar för det som kommer in via webbplatsens formulär.
import { HOME_SIZES_EN } from '../../lib/calcSummary.js';
import { formatDateTime } from '../../lib/supabase.js';

export const KIND = { bokning: 'Booking', kontakt: 'Message', skadeanmalan: 'Damage report' };
export const STATUS = { ny: 'New', hanterad: 'Handled', arkiverad: 'Archived' };

export const SERVICES = {
  flytt: 'Moving',
  flyttstadning: 'Move-out cleaning',
  paket: 'Moving + move-out cleaning',
  hemstadning: 'Home cleaning',
  storstadning: 'Deep cleaning',
  fonsterputs: 'Window cleaning',
  kontor: 'Office cleaning',
  pianoflytt: 'Piano moving / heavy lifting',
};

// Svenska namn för text som kunden ser, till exempel rader på offerter och fakturor.
export const SERVICES_SV = {
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
  ['tjanst', 'Service'],
  ['pris', 'Price from the calculator'],
  ['datum', 'Date'],
  ['tid', 'Time'],
  ['flexibel', 'Flexible with the date'],
  ['adress', 'Address'],
  ['postnummer', 'Postcode'],
  ['nyAdress', 'New address'],
  ['storlek', 'Home'],
  ['kvm', 'Square metres'],
  ['vaningOchHiss', 'Floor and lift'],
  ['typ', 'Concerns'],
  ['beskrivning', 'Description'],
  ['meddelande', 'Message'],
  ['ovrigt', 'Other'],
  ['namn', 'Name'],
  ['telefon', 'Phone'],
  ['epost', 'Email'],
  ['kontakt', 'Contact'],
  ['kontaktsatt', 'Wants to be contacted by'],
  ['sprak', 'Language'],
  ['kalla', 'Sent from'],
  ['kalkyl', 'Calculation'],
  ['samtycke', 'Consent'],
];

export function fieldValue(key, value) {
  if (key === 'tjanst') return SERVICES[value] ?? value;
  if (key === 'storlek') return HOME_SIZES_EN[value] ?? value;
  if (key === 'pris' && /^\d+$/.test(value)) return `${Number(value).toLocaleString('sv-SE')} kr`;
  if (key === 'sprak') return value === 'en' ? 'English' : 'Swedish';
  return value;
}

/** En rad som beskriver ärendet i listan. */
export function summary(s) {
  const d = s.data ?? {};
  if (s.kind === 'bokning') return [SERVICES[d.tjanst] ?? d.tjanst, d.datum, d.adress].filter(Boolean).join(' · ');
  if (s.kind === 'skadeanmalan') return [d.typ, d.beskrivning].filter(Boolean).join(' · ');
  return d.meddelande ?? '';
}

/**
 * Kunden för ett ärende: befintlig kund med samma mejl eller telefon, annars en ny kund.
 * Kopplar ärendet till kunden. Returnerar { id, name, existed }.
 */
export async function ensureCustomer(sb, item) {
  if (item.customer_id) return { id: item.customer_id, existed: true };
  const data = item.data ?? {};
  let customer = null;
  // Värdena kommer från kunden, så de citeras för att inte kunna ändra filtret.
  const quote = (v) => `"${String(v).replace(/[\\"]/g, (c) => `\\${c}`)}"`;
  const matchers = [item.email && `email.eq.${quote(item.email)}`, item.phone && `phone.eq.${quote(item.phone)}`].filter(Boolean);
  if (matchers.length) {
    const { data: found } = await sb.from('customers').select('id, name').or(matchers.join(',')).limit(1);
    if (found?.length) customer = { ...found[0], existed: true };
  }
  if (!customer) {
    const digits = (data.postnummer ?? '').replace(/\D/g, '');
    const { data: created, error } = await sb
      .from('customers')
      .insert({
        kind: data.storlek === 'annat' || data.tjanst === 'kontor' ? 'company' : 'private',
        name: item.name || 'No name',
        email: item.email,
        phone: item.phone,
        street: data.adress ?? null,
        postal_code: digits.length === 5 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : null,
        notes: `From ${KIND[item.kind].toLowerCase()} ${formatDateTime(item.created_at)}`,
      })
      .select('id, name')
      .single();
    if (error) throw new Error('Could not create the customer.');
    customer = { ...created, existed: false };
  }
  const { error } = await sb.from('submissions').update({ customer_id: customer.id }).eq('id', item.id);
  if (error) throw new Error('Could not link the customer.');
  return customer;
}
