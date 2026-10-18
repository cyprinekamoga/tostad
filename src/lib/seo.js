import { site } from '../config/site.js';
import { counties } from '../data/areas.js';

const orgRef = { '@id': `${site.url}/#foretag` };

/** Strukturerad data för vanliga frågor (FAQPage). */
export function faqJsonLd(faq = []) {
  if (!faq.length) return null;
  return {
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

/** Strukturerad data för en tjänst med pris. */
export function serviceJsonLd({ name, description, slug, price, unit, areaNames = [] }) {
  const ld = {
    '@type': 'Service',
    '@id': `${site.url}/${slug}#tjanst`,
    name,
    serviceType: name,
    description,
    url: `${site.url}/${slug}`,
    provider: orgRef,
    areaServed: [...counties.map((c) => ({ '@type': 'AdministrativeArea', name: c.name })), ...areaNames.map((n) => ({ '@type': 'City', name: n }))],
  };
  if (price) {
    ld.offers = {
      '@type': 'Offer',
      priceCurrency: 'SEK',
      price: String(price),
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: String(price),
        priceCurrency: 'SEK',
        unitText: unit,
        valueAddedTaxIncluded: unit && !/exkl/.test(unit),
      },
      seller: orgRef,
    };
  }
  return ld;
}

export const jsonLd = (...items) => items.filter(Boolean);
