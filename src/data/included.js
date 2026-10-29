// Vad som ingår och inte ingår i varje tjänst. Visas på tjänstesidorna under "Det här ingår".
// Underlag: branschens vanliga checklistor för flytt- och storstädning, Bohag 2010 och hur andra svenska
// städ- och flyttfirmor beskriver sina tjänster. Allt här ska stämma med hur vi faktiskt arbetar.
import { cleaningChecklist } from './checklists.js';

// Flyttstädningen följer samma checklista som kunden kan bocka av på sidan. Tillval och det som görs
// efter överenskommelse står under "ingår inte" i stället.
const moveOutCleaning = cleaningChecklist
  .map((r) => ({ title: r.room, items: r.items.filter((i) => !/\((tillval|efter överenskommelse)\)/.test(i)) }))
  .filter((r) => r.items.length);

const moving = [
  {
    title: 'Före flytten',
    items: [
      'Fast pris utifrån bostadens storlek, våningar, hiss och avstånd',
      'Planering av tid och hur många vi behöver vara',
      'Råd om vad som ska vara packat och klart när vi kommer',
    ],
  },
  {
    title: 'På flyttdagen',
    items: [
      'Flyttare och lastbil med flyttfiltar, spännband och kärror',
      'Bärhjälp ut ur den gamla bostaden och in i den nya',
      'Möbler skyddas med filtar och plast under transporten',
      'Isärtagning och ihopsättning av sängar, bord och andra enklare möbler',
      'Möbler och kartonger ställs i det rum du vill ha dem',
      'Skydd av golv och dörrkarmar där det behövs',
    ],
  },
  {
    title: 'Trygghet',
    items: [
      'Ansvarsförsäkring via Trygg-Hansa',
      'Branschens konsumentvillkor Bohag 2010',
      'Rutavdraget görs direkt på fakturan',
      'Betalning först när flytten är klar',
    ],
  },
];

export const included = {
  flyttstadning: {
    groups: moveOutCleaning,
    notIncluded: [
      'Fönsterputs ingår inte i kvadratmeterpriset. Den kostar 64 kr per tvåsidigt och 99 kr per fyrsidigt fönster efter RUT.',
      'Förråd, balkong och uteplats städas efter överenskommelse. Ange det i bokningen.',
      'Saker som lämnats kvar i bostaden. Vi kan köra dem till återvinning som tillval.',
      'Fläckar, brännmärken och slitage som inte går bort med normal rengöring.',
    ],
    note: 'Vi tar med rengöringsmedel, verktyg och dammsugare. Frosta gärna av frysen dagen innan.',
  },
  flyttfirma: {
    groups: moving,
    notIncluded: [
      'Packning av kartonger. Den kan du boka som packhjälp.',
      'Flyttstädning. Boka den i paket med flytten och få 10 % rabatt på städningen.',
      'Piano, kassaskåp och andra mycket tunga föremål. Säg till i förväg så räknar vi med rätt utrustning.',
      'Montering av sådant som sitter på väggen, till exempel lampor, tavlor, gardinstänger och tv-fästen.',
      'Bortforsling till återvinning. Den kan läggas till i bokningen.',
    ],
    note: 'Du packar själv i kartonger och tömmer lådor och skåp innan vi kommer, om du inte har bokat packhjälp.',
  },
  'flytt-och-flyttstadning': {
    groups: [...moving.slice(0, 2), ...moveOutCleaning.map((g) => ({ ...g, title: `Flyttstädning: ${g.title.toLowerCase()}` })), moving[2]],
    notIncluded: [
      'Packning av kartonger. Den kan läggas till som packhjälp.',
      'Fönsterputs ingår inte i städningens kvadratmeterpris, men kan läggas till i kalkylatorn.',
      'Förråd, balkong och uteplats städas efter överenskommelse.',
      'Montering av sådant som sitter på väggen, till exempel lampor, tavlor och tv-fästen.',
    ],
    note: 'Du får samma besiktningsgaranti och fotorapport som när du bokar flyttstädning separat.',
  },
  hemstadning: {
    groups: [
      {
        title: 'Kök',
        items: [
          'Bänkskivor och stänkskydd',
          'Spis och häll',
          'Mikrovågsugn invändigt och utvändigt',
          'Diskho och blandare',
          'Skåpsluckor, handtag och vitvaror utvändigt',
          'Tömning av sopor',
          'Golv',
        ],
      },
      {
        title: 'Badrum',
        items: ['Toalett invändigt och utvändigt', 'Handfat och blandare', 'Dusch och badkar', 'Kakel runt dusch, badkar och handfat', 'Speglar', 'Golv'],
      },
      {
        title: 'Alla rum',
        items: [
          'Dammsugning och våttorkning av golv',
          'Dammtorkning av fria ytor, hyllor och fönsterbrädor',
          'Dammtorkning av lister, lampor och tavlor som går att nå',
          'Speglar och glasytor',
          'Tömning av papperskorgar',
          'Bäddning med rena lakan om du lagt fram dem',
        ],
      },
    ],
    notIncluded: [
      'Ugn, kyl och frys invändigt. Det ingår i storstädning.',
      'Skåp och lådor invändigt.',
      'Fönsterputs. Den bokas separat.',
      'Tvätt och strykning.',
      'Flytt av tunga möbler.',
    ],
    note: 'Tiden du bokar är din. Säg vad som är viktigast så börjar vi där. Vi tar med städprodukter, eller använder dina om du vill.',
  },
  storstadning: {
    groups: [
      {
        title: 'Kök',
        items: [
          'Allt som ingår i hemstädning',
          'Ugn, plåtar och galler',
          'Kyl och frys invändigt',
          'Köksfläkt och fettfilter',
          'Skåp och lådor invändigt och utvändigt',
          'Bakom och under spis och kyl om de går att dra ut',
        ],
      },
      {
        title: 'Badrum',
        items: ['Allt som ingår i hemstädning', 'Avkalkning av dusch, badkar, blandare och duschvägg', 'Kakel och fogar från golv till tak', 'Rensning av golvbrunn', 'Badrumsskåp invändigt och utvändigt'],
      },
      {
        title: 'Alla rum',
        items: [
          'Allt som ingår i hemstädning',
          'Golvlister och socklar',
          'Element och radiatorer, även bakom',
          'Dörrar, dörrkarmar och handtag',
          'Eluttag och strömbrytare',
          'Lampor och armaturer',
          'Garderober utvändigt, och invändigt om de är tömda',
        ],
      },
    ],
    notIncluded: [
      'Fönsterputs. Den kan läggas till.',
      'Tvätt av mattor, soffor och andra textilier.',
      'Ytor som inte går att nå säkert med en vanlig stege.',
    ],
    note: 'Storstädning passar inför en visning, efter en renovering eller som vårstädning.',
  },
  fonsterputs: {
    groups: [
      {
        title: 'Det här gör vi',
        items: [
          'Glaset på båda sidor av ett tvåsidigt fönster',
          'Alla fyra glasytor på fönster med kopplade bågar',
          'Karmar och bågar torkas',
          'Fönsterbrädor invändigt',
          'Fönsterbleck utvändigt där vi når säkert',
          'Skydd av fönsterbräda och golv medan vi putsar',
        ],
      },
    ],
    notIncluded: [
      'Persienner och rullgardiner.',
      'Fönster som inte går att nå säkert inifrån eller med en vanlig stege.',
      'Utsidan när det är minusgrader. Då putsar vi bara insidan.',
    ],
    note: 'Har fönstren spröjs som går att ta bort, ta gärna loss dem innan vi kommer.',
  },
  kontorsstadning: {
    groups: [
      {
        title: 'Kontor och mötesrum',
        items: [
          'Dammtorkning av skrivbord och fria ytor',
          'Dammtorkning av hyllor och fönsterbrädor',
          'Tömning av papperskorgar och byte av påsar',
          'Dammsugning och moppning av golv',
          'Fingeravtryck på glasdörrar och glasväggar',
        ],
      },
      {
        title: 'Pentry',
        items: ['Bänkar och diskho', 'Kaffemaskin och mikrovågsugn utvändigt', 'Bord och stolar', 'Tömning av sopor', 'Golv'],
      },
      {
        title: 'Toaletter',
        items: ['Toalett, handfat och blandare', 'Speglar', 'Påfyllning av toalettpapper, tvål och pappershanddukar om ni har valt förbrukningsmaterial', 'Golv'],
      },
    ],
    notIncluded: [
      'Fönsterputs. Den kan läggas till.',
      'Golvvård som skurning, polering och vaxning.',
      'Kyl, frys och ugn invändigt. Det kan bokas som storstädning.',
      'Diskning för hand.',
    ],
    note: 'Vi går igenom era lokaler på ett gratis besök och skriver ner exakt vad som ingår i just ert avtal.',
  },
  packhjalp: {
    groups: [
      {
        title: 'Packning',
        items: [
          'Packning av husgeråd, porslin, glas, böcker, kläder och prydnadssaker',
          'Ömtåligt lindas i silkespapper eller bubbelplast och packas stående',
          'Tavlor och speglar skyddas med kartong eller filtar',
          'Varje kartong märks med rum och innehåll',
        ],
      },
      {
        title: 'Material',
        items: ['Flyttkartonger, tejp, silkespapper och bubbelplast efter behov. Säg till vid bokningen så räknar vi med det i priset.'],
      },
    ],
    notIncluded: [
      'Uppackning i den nya bostaden. Säg till om du vill ha hjälp med det.',
      'Värdesaker, kontanter, smycken, läkemedel och viktiga papper. Dem tar du med själv.',
      'Farligt gods som färg, bensin, gasol och rengöringsmedel med varningsmärkning.',
    ],
    note: 'Du väljer själv om vi packar allt eller bara det du inte hinner.',
  },
  pianoflytt: {
    groups: [
      {
        title: 'Det här gör vi',
        items: [
          'Bärning med pianokärra, bärremmar och rätt antal personer',
          'Skydd av golv, dörrkarmar och trappor',
          'Pianot lindas i filtar och spänns fast under transporten',
          'Placering där du vill ha pianot',
          'Ansvarsförsäkring via Trygg-Hansa',
        ],
      },
    ],
    notIncluded: [
      'Stämning av pianot. Låt det stå en till två veckor i sitt nya rum innan det stäms.',
      'Kranbil om pianot inte går genom trapphuset.',
    ],
    note: 'Skicka en bild på pianot och trapphuset så ger vi ett fast pris. Flygel ger vi alltid pris på efter bilder.',
  },
};
