// Pris för ett jobb som jobbassistenten föreslår, räknat med priskalkylatorn (pricing.js).
// Priset är det kunden betalar inklusive moms: efter RUT för privatpersoner, utan RUT för företag.
import { PRICES, VAT, flyttstadningPrice, fonsterputsPrice, hourlyCleaningPrice, movePrice, packagePrice, formatKr } from './pricing.js';

// Ungefärlig boyta när bara antal rum är känt.
const ROOM_SQM = { '1': 35, '2': 50, '3': 72, '4': 97, villa: 130 };

const withVat = (exVat) => Math.round(exVat * (1 + VAT));

/**
 * Returnerar { price, basis } eller null när det inte går att räkna.
 * action: förslaget från assistenten. company: true om ett företag betalar.
 */
export function suggestPrice(action, { company = false, service = action.service, hours = action.hours } = {}) {
  if (action.price_explicit) return { price: Math.round(action.price_explicit), basis: 'Price written in the message' };
  const b = action.price_basis ?? {};
  const isCompany = company || !!b.company;
  const tail = isCompany ? 'company price incl. VAT, no RUT' : 'after RUT';
  const w2 = b.windows2 ?? 0;
  const w4 = b.windows4 ?? 0;
  const windowsText = w2 || w4 ? `, ${[w2 && `${w2} two-sided`, w4 && `${w4} four-sided`].filter(Boolean).join(' and ')} windows` : '';

  if (service === 'flyttstadning' || service === 'paket') {
    const sqm = b.sqm ?? ROOM_SQM[b.rooms];
    if (!sqm) return null;
    const estimated = !b.sqm;
    if (service === 'paket') {
      const p = packagePrice({ size: b.rooms ?? '2', business: isCompany }, { sqm, windows2: w2, windows4: w4 });
      const price = isCompany ? withVat(p.move.price) + p.clean.full : p.total;
      return { price, basis: `Moving (${p.move.crewLabel}, ${p.move.hours} h) + move-out cleaning ${sqm} m²${estimated ? ' (estimated from rooms)' : ''}${windowsText}, ${tail}` };
    }
    const r = flyttstadningPrice({ sqm, windows2: w2, windows4: w4 });
    return { price: isCompany ? r.full : r.pay, basis: `${sqm} m²${estimated ? ' (estimated from rooms)' : ''} × ${PRICES.flyttstadning.perSqm} kr${windowsText}, ${tail}` };
  }
  if (service === 'fonsterputs') {
    if (!w2 && !w4) return null;
    const r = fonsterputsPrice({ windows2: w2, windows4: w4 });
    return { price: isCompany ? r.full : r.pay, basis: `${windowsText.slice(2)}, ${tail}` };
  }
  if (service === 'hemstadning' || service === 'storstadning') {
    const h = b.clean_hours ?? hours;
    if (!h) return null;
    const r = hourlyCleaningPrice({ service, hours: h, recurring: !!b.recurring });
    return { price: isCompany ? r.full : r.pay, basis: `${r.hours} h × ${r.rate} kr${r.discount ? ', 10% regular discount' : ''}, ${tail}` };
  }
  if (service === 'kontor') {
    const h = b.clean_hours ?? hours;
    if (!h) return null;
    return { price: withVat(h * PRICES.kontorsstadning.perHourExVat), basis: `${h} h × ${PRICES.kontorsstadning.perHourExVat} kr excl. VAT, incl. VAT` };
  }
  if (service === 'flytt') {
    const m = movePrice({ size: b.rooms ?? '2', business: isCompany });
    return { price: isCompany ? withVat(m.price) : m.price, basis: `${m.crewLabel}, ${m.hours} h × ${m.rate} kr${isCompany ? ' excl. VAT, incl. VAT' : ', after RUT'}` };
  }
  return null;
}

export const priceText = (p) => (p ? `${formatKr(p.price)} (${p.basis})` : '');
