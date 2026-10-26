// Prislogik som delas av priskalkylatorn, bokningsflödet och testerna.
//
// Alla privatpriser i PRICES är det kunden betalar EFTER rutavdrag, inklusive moms.
// För städning är hela priset arbetskostnad, så priset före RUT är det dubbla.
// Företagspriser anges exklusive moms och har inget rutavdrag.
// BEKRÄFTA alla belopp och tidsantaganden innan lansering.

export const RUT_SHARE = 0.5;
export const RUT_MAX_PER_PERSON = 75000; // kronor per person och år (gemensamt tak med ROT)
export const VAT = 0.25;
export const MIN_HOURS = 2;

export const PRICES = {
  flyttstadning: { perSqm: 45, window2: 64, window4: 99 },
  fonsterputs: { window2: 64, window4: 99 },
  hemstadning: { perHour: 125 },
  storstadning: { perHour: 160 },
  kontorsstadning: { perHourExVat: 249 },
  flytt: {
    crews: {
      '2-1': { label: '2 flyttare + 1 lastbil', men: 2, weekday: 595, weekend: 795 },
      '2-2': { label: '2 flyttare + 2 lastbilar', men: 2, weekday: 695, weekend: 895 },
      '3-2': { label: '3 flyttare + 2 lastbilar', men: 3, weekday: 945, weekend: 1145 },
    },
  },
  foretagsflytt: {
    crews: {
      '2-1': { label: '2 flyttare + 1 lastbil', men: 2, weekday: 952, weekend: 1272 },
      '2-2': { label: '2 flyttare + 2 lastbilar', men: 2, weekday: 1112, weekend: 1432 },
      '3-1': { label: '3 flyttare + 1 lastbil', men: 3, weekday: 1512, weekend: 1832 },
    },
  },
};

// Kontorsstädning: uppskattat månadspris utifrån yta och hur ofta. Tiden per besök räknas fram ur hur många kvm
// en städare hinner per timme (mer smuts hinner samlas när det städas mer sällan), gånger timpriset.
// Planlösningen påverkar, så priset visas som ett spann (±10 %) och fast pris sätts efter besök på plats.
export const OFFICE = {
  frequencies: {
    varannan: { label: 'Varannan vecka', visits: 26 / 12, sqmPerHour: 100, minHours: 2 },
    1: { label: '1 gång i veckan', visits: 52 / 12, sqmPerHour: 120, minHours: 2 },
    2: { label: '2 gånger i veckan', visits: 104 / 12, sqmPerHour: 150, minHours: 1.5 },
    3: { label: '3 gånger i veckan', visits: 156 / 12, sqmPerHour: 170, minHours: 1 },
    5: { label: 'Varje vardag', visits: 260 / 12, sqmPerHour: 200, minHours: 1 },
  },
  spread: 0.1,
  // Förbrukningsmaterial (städmedel, toalettpapper, tvål, pappershanddukar, soppåsar), per kvm och månad.
  suppliesPerSqm: [2.6, 4],
  suppliesMin: 300,
  quoteAbove: 1000,
};

const round100 = (n) => Math.round(n / 100) * 100;

/** Uppskattat månadspris exkl. moms för kontorsstädning. Svarar spann, mittpris och tid per besök. */
export function officeEstimate({ sqm = 0, frequency = '1', supplies = false } = {}) {
  const f = OFFICE.frequencies[frequency] ?? OFFICE.frequencies[1];
  const rate = PRICES.kontorsstadning.perHourExVat;
  const hours = Math.max(f.minHours, sqm / f.sqmPerHour);
  const perVisit = hours * rate;
  const clean = [round100(perVisit * f.visits * (1 - OFFICE.spread)), round100(perVisit * f.visits * (1 + OFFICE.spread))];
  const material = supplies ? OFFICE.suppliesPerSqm.map((k) => round100(Math.max(OFFICE.suppliesMin, sqm * k))) : [0, 0];
  const low = clean[0] + material[0];
  const high = clean[1] + material[1];
  return {
    low,
    high,
    mid: round100((low + high) / 2),
    clean,
    material,
    hours: Math.round(hours * 4) / 4,
    perVisit: [round100(perVisit * (1 - OFFICE.spread)), round100(perVisit * (1 + OFFICE.spread))],
    visits: f.visits,
    label: f.label,
    rate,
    quote: sqm > OFFICE.quoteAbove,
  };
}

// Hur många arbetstimmar (mantimmar) ett normalt bohag brukar ta att bära ut och in.
// Används för att räkna fram ett fast pris. BEKRÄFTA mot er erfarenhet.
export const HOME_SIZES = {
  '1': { label: '1 rum och kök (upp till ca 40 kvm)', manHours: 6, crew: '2-1' },
  '2': { label: '2 rum och kök (ca 40 till 60 kvm)', manHours: 8, crew: '2-1' },
  '3': { label: '3 rum och kök (ca 60 till 85 kvm)', manHours: 12, crew: '3-2' },
  '4': { label: '4 rum och kök (ca 85 till 110 kvm)', manHours: 16, crew: '3-2' },
  villa: { label: 'Villa eller radhus (ca 110 till 150 kvm)', manHours: 21, crew: '3-2' },
};

const DRIVE_KMH = 35; // genomsnittsfart i stadstrafik inklusive lastning vid bilen
const FLOOR_HOURS = 0.25; // extra tid per våning utan hiss, per adress
const LONG_CARRY_HOURS = 0.5; // bärväg längre än 25 meter
const PACKING_SHARE = 0.6; // packhjälp ≈ 60 % av bärtiden

export const roundKr = (n) => Math.round(n);
const roundUpHalfHour = (h) => Math.ceil(h * 2) / 2;

/** Pris för städtjänster där hela priset är arbetskostnad. */
export function cleaningBreakdown(pay) {
  const full = pay / (1 - RUT_SHARE);
  return { full: roundKr(full), rut: roundKr(full - pay), pay: roundKr(pay) };
}

/** Flyttstädning: fast pris utifrån boyta och fönster. */
export function flyttstadningPrice({ sqm = 0, windows2 = 0, windows4 = 0, discount = 0 } = {}) {
  const p = PRICES.flyttstadning;
  const base = Math.max(0, sqm) * p.perSqm;
  const windows = Math.max(0, windows2) * p.window2 + Math.max(0, windows4) * p.window4;
  const beforeDiscount = base + windows;
  const discountKr = beforeDiscount * discount;
  return { ...cleaningBreakdown(beforeDiscount - discountKr), base: roundKr(base), windows: roundKr(windows), discountKr: roundKr(discountKr) };
}

/** Fönsterputs som egen tjänst. */
export function fonsterputsPrice({ windows2 = 0, windows4 = 0 } = {}) {
  const p = PRICES.fonsterputs;
  return cleaningBreakdown(Math.max(0, windows2) * p.window2 + Math.max(0, windows4) * p.window4);
}

/** Hemstädning och storstädning per timme. */
export function hourlyCleaningPrice({ service = 'hemstadning', hours = MIN_HOURS, recurring = false, recurringDiscount = 0.1 } = {}) {
  const rate = PRICES[service].perHour;
  const h = Math.max(MIN_HOURS, hours);
  const discount = service === 'hemstadning' && recurring ? recurringDiscount : 0;
  const pay = h * rate * (1 - discount);
  return { ...cleaningBreakdown(pay), hours: h, rate, discount };
}

/**
 * Flytt: räknar fram ett fast pris från bostadens storlek och förutsättningar.
 * Tiden är vår uppskattning. Kunden betalar det fasta priset även om det tar längre tid,
 * så länge uppgifterna stämmer.
 */
export function movePrice({
  size = '2',
  crew,
  weekend = false,
  distanceKm = 10,
  floorsFrom = 0,
  floorsTo = 0,
  elevatorFrom = true,
  elevatorTo = true,
  longCarry = false,
  packing = false,
  business = false,
} = {}) {
  const home = HOME_SIZES[size] ?? HOME_SIZES['2'];
  const table = business ? PRICES.foretagsflytt.crews : PRICES.flytt.crews;
  const crewKey = crew && table[crew] ? crew : business && home.crew === '3-2' ? '3-1' : home.crew;
  const c = table[crewKey];
  let hours = home.manHours / c.men;
  if (packing) hours += (home.manHours * PACKING_SHARE) / c.men;
  hours += Math.max(0, distanceKm) / DRIVE_KMH;
  if (!elevatorFrom) hours += Math.max(0, floorsFrom - 1) * FLOOR_HOURS;
  if (!elevatorTo) hours += Math.max(0, floorsTo - 1) * FLOOR_HOURS;
  if (longCarry) hours += LONG_CARRY_HOURS;
  hours = Math.max(MIN_HOURS, roundUpHalfHour(hours));
  const rate = weekend ? c.weekend : c.weekday;
  return { hours, rate, crew: crewKey, crewLabel: c.label, men: c.men, price: roundKr(hours * rate), business };
}

/** Flytt + flyttstädning i ett paket. */
export function packagePrice(moveInput, cleanInput, packageDiscount = 0.1) {
  const move = movePrice(moveInput);
  const clean = flyttstadningPrice({ ...cleanInput, discount: packageDiscount });
  return { move, clean, total: move.price + clean.pay };
}

/** Rutavdrag för en given arbetskostnad (inkl. moms) och antal personer som delar på avdraget. */
export function rutDeduction(labourCost, persons = 1) {
  const max = RUT_MAX_PER_PERSON * Math.max(1, persons);
  const rut = Math.min(labourCost * RUT_SHARE, max);
  return { rut: roundKr(rut), pay: roundKr(labourCost - rut), capped: labourCost * RUT_SHARE > max };
}

export const formatKr = (n) => `${new Intl.NumberFormat('sv-SE').format(Math.round(n))} kr`;
