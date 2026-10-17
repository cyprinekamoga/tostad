// Checklista för flyttstädning med samma punkter som vi bockar av på plats.
export const cleaningChecklist = [
  {
    room: 'Kök',
    items: [
      'Ugn och plåtar invändigt och utvändigt',
      'Avfettning av spis och häll',
      'Köksfläkt och filter',
      'Kyl och frys invändigt och utvändigt',
      'Diskmaskinens filter, lucka och kanter',
      'Mikrovågsugn',
      'Skåp och lådor invändigt och utvändigt',
      'Bänkskivor och stänkskydd',
      'Bakom och under spis och kyl (om de går att dra ut)',
      'Golv och golvlister',
    ],
  },
  {
    room: 'Badrum',
    items: [
      'Toaletten invändigt och utvändigt, även foten',
      'Avkalkning av dusch, badkar och duschvägg',
      'Handfat och blandare',
      'Spegel och badrumsskåp',
      'Kakel och fogar',
      'Rensning av golvbrunn',
      'Handdukstork och element',
      'Tvättmaskinens lucka, gummilist och tvättmedelsfack',
      'Golv',
    ],
  },
  {
    room: 'Alla rum',
    items: [
      'Dammsugning och våttorkning av golv',
      'Golvlister och socklar',
      'Element och radiatorer, även bakom',
      'Dörrar, dörrkarmar och handtag',
      'Eluttag och strömbrytare',
      'Garderober invändigt och utvändigt',
      'Lampor och armaturer',
      'Ventiler',
    ],
  },
  {
    room: 'Fönster',
    items: [
      'Fönster på insidan och utsidan (tillval)',
      'Fönsterkarmar och fönsterbrädor',
      'Persienner',
      'Balkongdörr',
    ],
  },
  {
    room: 'Hall och övrigt',
    items: [
      'Ytterdörren på insidan och utsidan',
      'Hatthylla och skohylla',
      'Förråd (efter överenskommelse)',
      'Balkong eller uteplats (efter överenskommelse)',
    ],
  },
];

// Flyttchecklista: uppgifter räknat i dagar före (negativt) eller efter flyttdagen.
export const moveTimeline = [
  {
    phase: 'Två månader före',
    tasks: [
      { id: 'sag-upp', offset: -60, title: 'Säg upp hyresavtalet', text: 'Uppsägningstiden för hyresrätt är oftast tre månader. Kontrollera ditt avtal.' },
      { id: 'boka-flytt', offset: -56, title: 'Boka flytthjälp och flyttstädning', text: 'Månadsskiften och helger går åt först. Boka tidigt för bäst tid.' },
      { id: 'rensa', offset: -50, title: 'Börja rensa', text: 'Allt du inte flyttar är tid och pengar sparat. Sälj, skänk eller lämna till återvinning.' },
    ],
  },
  {
    phase: 'En månad före',
    tasks: [
      { id: 'bredband', offset: -30, title: 'Flytta bredband', text: 'Det tar ofta omkring två veckor att flytta bredbandet. Beställ i god tid.' },
      { id: 'el', offset: -28, title: 'Teckna el till nya bostaden', text: 'Anmäl flytt till ditt elbolag så att elen följer med dig.' },
      { id: 'forsakring', offset: -28, title: 'Flytta hemförsäkringen', text: 'Försäkringen ska gälla på båda adresserna under flyttdagen.' },
      { id: 'kartonger', offset: -21, title: 'Skaffa flyttkartonger', text: 'En tvåa behöver ofta 30 till 40 kartonger.' },
    ],
  },
  {
    phase: 'Två veckor före',
    tasks: [
      { id: 'adressandring', offset: -14, title: 'Gör flyttanmälan till Skatteverket', text: 'Gratis på skatteverket.se. Görs före flytten eller senast en vecka efter.' },
      { id: 'post', offset: -14, title: 'Beställ eftersändning av post', text: 'Så missar du inga brev från din gamla adress.' },
      { id: 'hiss', offset: -10, title: 'Boka hiss och parkering', text: 'Fråga föreningen eller hyresvärden om hissen kan bokas och var lastbilen kan stå.' },
      { id: 'packa', offset: -10, title: 'Packa det du inte använder', text: 'Böcker, säsongskläder och prydnadssaker först. Märk kartongerna med rum.' },
    ],
  },
  {
    phase: 'Dagarna före',
    tasks: [
      { id: 'frys', offset: -2, title: 'Frosta av frysen', text: 'Dagen före flyttstädningen, så att den hinner bli torr.' },
      { id: 'vaska', offset: -1, title: 'Packa en flyttdagsväska', text: 'Laddare, mediciner, tandborste, papper och något att äta.' },
      { id: 'nycklar', offset: -1, title: 'Samla nycklar', text: 'Alla nycklar, taggar och tvättstugenycklar ska lämnas tillbaka.' },
    ],
  },
  {
    phase: 'Flyttdagen',
    tasks: [
      { id: 'sms', offset: 0, title: 'Håll koll på SMS:et från oss', text: 'Du får ett SMS när teamet är på väg.' },
      { id: 'matare', offset: 0, title: 'Fotografera mätarställning', text: 'El och vatten i både gamla och nya bostaden.' },
      { id: 'genomgang', offset: 0, title: 'Gå igenom bostaden med teamet', text: 'Kolla förråd, vind och balkong innan lastbilen åker.' },
    ],
  },
  {
    phase: 'Efter flytten',
    tasks: [
      { id: 'besiktning', offset: 3, title: 'Besiktning av gamla bostaden', text: 'Spara fotorapporten från flyttstädningen. Hör av dig inom 14 dagar om något anmärks.' },
      { id: 'skada', offset: 5, title: 'Kontrollera möbler och saker', text: 'Hittar du en skada? Anmäl den med bilder via vårt skadeformulär.' },
      { id: 'omdome', offset: 7, title: 'Lämna ett omdöme', text: 'Hjälp andra att välja rätt och hjälp oss att bli bättre.' },
    ],
  },
];
