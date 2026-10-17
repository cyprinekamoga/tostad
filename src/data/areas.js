// Områdessidor (/omraden/<slug>). Varje sida har egen text och egna stadsdelar
// så att den är användbar för besökaren och inte en kopia av de andra.

export const areas = [
  {
    slug: 'upplands-vasby',
    name: 'Upplands Väsby',
    home: true,
    neighborhoods: ['Runby', 'Vilunda', 'Bredden', 'Smedby', 'Fresta', 'Grimstaby', 'Sigma', 'Väsby centrum'],
    intro:
      'Upplands Väsby är vår hemmabas. Här har vi kortast körväg, vilket gör det lätt att hitta en tid, även med kort varsel.',
    housing: 'Blandat med hyresrätter runt centrum och villor och radhus i Fresta och Runby.',
    tip: 'Bor du i villa eller radhus? Ange bärvägen från dörren till där lastbilen kan stå, så blir det fasta priset rätt från början.',
  },
  {
    slug: 'sollentuna',
    name: 'Sollentuna',
    neighborhoods: ['Tureberg', 'Häggvik', 'Edsberg', 'Rotebro', 'Helenelund', 'Viby', 'Vaxmora', 'Norrviken'],
    intro: 'Sollentuna ligger precis söder om vår bas i Upplands Väsby. Kort körväg gör det lätt att hitta en tid, oavsett om du bor i lägenhet vid Sollentuna centrum eller i villa i Edsberg.',
    housing: 'Många villor och radhus, men också större hyresområden runt Tureberg och Helenelund.',
    tip: 'Flyttar du från villa? Glöm inte förråd, garage och vind när du anger storleken.',
  },
  {
    slug: 'stockholm',
    name: 'Stockholm',
    neighborhoods: ['Södermalm', 'Vasastan', 'Kungsholmen', 'Östermalm', 'Bromma', 'Hammarby sjöstad', 'Vällingby', 'Hägersten'],
    intro: 'Från sekelskiftesvåningar på Södermalm till nybyggt i Hammarby sjöstad. Vi kör till hela Stockholms stad varje dag.',
    housing: 'Många äldre hus i innerstan saknar hiss eller har små hissar. Det påverkar tiden och därmed priset.',
    tip: 'Ange våning och om det finns hiss för båda adresserna. Smala trapphus i innerstan tar längre tid och vi vill att priset ska stämma.',
  },
  {
    slug: 'solna',
    name: 'Solna',
    neighborhoods: ['Råsunda', 'Huvudsta', 'Hagalund', 'Bergshamra', 'Frösunda', 'Arenastaden', 'Ulriksdal'],
    intro: 'Solna växer snabbt, och många flyttar in i nyproduktion i Arenastaden och Hagastaden. Vi hjälper både dig som flyttar in och dig som flyttar ut.',
    housing: 'Mycket nyproduktion med hiss, men också äldre funkishus i Råsunda.',
    tip: 'Flyttar du till nyproduktion? Fråga föreningen om hissen kan bokas på flyttdagen.',
  },
  {
    slug: 'sundbyberg',
    name: 'Sundbyberg',
    neighborhoods: ['Centrala Sundbyberg', 'Duvbo', 'Lilla Alby', 'Hallonbergen', 'Rissne', 'Ursvik', 'Brotorp'],
    intro: 'Sverige till ytan minsta kommun men med många flyttar. Korta avstånd gör att flytten ofta går snabbt, och då blir priset lägre.',
    housing: 'Tätbebyggt med flerfamiljshus, ofta med hiss, och nya kvarter i Ursvik.',
    tip: 'Korta flyttar inom Sundbyberg passar bra att kombinera med flyttstädning samma dag.',
  },
  {
    slug: 'taby',
    name: 'Täby',
    neighborhoods: ['Täby centrum', 'Näsby park', 'Gribbylund', 'Viggbyholm', 'Arninge', 'Ensta', 'Hägernäs'],
    intro: 'I Täby flyttar många mellan villor och radhus. Vi hjälper till med tunga möbler, trädgårdsmöbler och flyttstädning av hela huset.',
    housing: 'Mestadels villor och radhus med förråd och garage.',
    tip: 'Ett hus innehåller ofta mer än man tror. Välj "Villa" i kalkylatorn och lägg till packhjälp om du vill ha hjälp med förråd och garage.',
  },
  {
    slug: 'jarfalla',
    name: 'Järfälla',
    neighborhoods: ['Jakobsberg', 'Barkarby', 'Viksjö', 'Kallhäll', 'Skälby', 'Stäket'],
    intro: 'Barkarbystaden växer, och i Jakobsberg och Viksjö byts många bostäder varje år. Vi hjälper dig hela vägen från Barkarby till Viksjö.',
    housing: 'Ny stadsbebyggelse i Barkarby, hyresrätter i Jakobsberg och villor i Viksjö.',
    tip: 'Ange gärna om lastbilen kan stå nära porten. I nya områden är det ibland långt från gatan.',
  },
  {
    slug: 'sigtuna',
    name: 'Sigtuna och Märsta',
    neighborhoods: ['Märsta', 'Sigtuna stad', 'Rosersberg', 'Steninge', 'Valsta', 'Skepptuna'],
    intro: 'Norr om Upplands Väsby, nära Arlanda. Kort körväg från vår bas gör det enkelt att hitta en tid i Märsta och Sigtuna.',
    housing: 'Villor och radhus i Sigtuna och Rosersberg, lägenheter i Märsta och Valsta.',
    tip: 'Flyttar du längre bort, till exempel till Uppsala? Ange avståndet i kalkylatorn så räknas körtiden in.',
  },
  {
    slug: 'nacka',
    name: 'Nacka',
    neighborhoods: ['Sickla', 'Finntorp', 'Saltsjöbaden', 'Fisksätra', 'Björknäs', 'Älta', 'Orminge'],
    intro: 'Från Sickla till Saltsjöbaden. Vi kör till hela Nacka och planerar med hänsyn till trafiken över Danvikstull och Skurubron.',
    housing: 'Blandat med nya flerfamiljshus i Sickla och Nacka strand och villor i Saltsjöbaden.',
    tip: 'Boka gärna en tidig start, så slipper lastbilen rusningstrafiken.',
  },
  {
    slug: 'lidingo',
    name: 'Lidingö',
    neighborhoods: ['Lidingö centrum', 'Larsberg', 'Torsvik', 'Käppala', 'Brevik', 'Gåshaga', 'Bodal'],
    intro: 'Villor, sjötomter och lägenheter vid Lidingö centrum. Vi planerar för långa uppfarter och branta tomter redan i offerten.',
    housing: 'Många villor, ofta med branta tomter och längre bärväg.',
    tip: 'Kryssa i "Lång bärväg" i kalkylatorn om lastbilen inte kan stå nära dörren.',
  },
];

export const areaBySlug = Object.fromEntries(areas.map((a) => [a.slug, a]));

// Postnummer i Stockholms län börjar på 10 till 19 (plus Norrtälje 76x). Vi kör i hela länet.
export function postcodeStatus(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length !== 5) return 'invalid';
  const two = Number(digits.slice(0, 2));
  const three = Number(digits.slice(0, 3));
  if ((two >= 10 && two <= 19) || (three >= 760 && three <= 764)) return 'yes';
  return 'ask';
}
