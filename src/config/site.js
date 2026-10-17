// Företagsuppgifter och löften som visas på hela webbplatsen.
// Allt som är markerat BEKRÄFTA är ett löfte eller en uppgift som TO Städ & Flytt
// måste godkänna innan sidan går live. Ändra värdet här så uppdateras alla sidor.

export const site = {
  name: 'TO Städ & Flytt',
  legalName: 'TO Städ & Flytt AB',
  url: 'https://tostadflytt.se',
  locale: 'sv-SE',
  orgNr: '559470-3398',
  phone: '072 222 88 00',
  phoneHref: 'tel:+46722228800',
  email: 'info@tostadflytt.se',
  // BEKRÄFTA: att numret används för WhatsApp.
  whatsappHref: 'https://wa.me/46722228800',
  address: {
    street: 'Hasselgatan 58',
    postalCode: '194 37',
    city: 'Upplands Väsby',
    region: 'Stockholms län',
    country: 'SE',
  },
  insurer: 'Trygg-Hansa',
  fSkatt: true,
  rutApproved: true,
  // Svarstid som utlovas på formulär och kontaktsidan.
  responseTime: 'inom 24 timmar',

  // Löften (BEKRÄFTA alla innan lansering).
  promises: {
    inspectionGuaranteeDays: 14, // flyttstädning: vi kommer tillbaka gratis om besiktningen inte godkänns
    inspectionFixHours: 48, // så snabbt vi åtgärdar anmärkningar
    damageResponseHours: 48, // svar på skadeanmälan
    lateCancelHours: 48, // ställer vi in med kortare varsel bjuder vi på första timmen
    packageDiscount: 0.1, // rabatt på flyttstädningen när den bokas ihop med flytt
    recurringDiscount: 0.1, // rabatt på regelbunden hemstädning
    invoiceDays: 10, // betalningsvillkor faktura
  },

  // Verifierade omdömen. Lägg in länkarna när profilerna finns så visas de automatiskt.
  reviews: {
    recoUrl: null, // t.ex. 'https://www.reco.se/to-stad-flytt-ab'
    googleReviewUrl: null, // länk från Google Företagsprofil → "Be om recensioner"
  },

  // Sociala medier: lämna null tills kontona finns, då döljs ikonerna.
  social: {
    facebook: null,
    instagram: null,
  },
};

export const nav = [
  { href: '/flyttfirma', label: 'Flytt' },
  { href: '/flyttstadning', label: 'Flyttstädning' },
  { href: '/hemstadning', label: 'Hemstädning' },
  { href: '/priser', label: 'Priser' },
  { href: '/garantier', label: 'Garantier' },
  { href: '/om-oss', label: 'Om oss' },
];
