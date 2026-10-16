import { site } from '../config/site.js';

export const homeFaq = [
  {
    q: 'Vad kostar flytthjälp i Stockholm?',
    a: '2 flyttare och lastbil kostar 595 kr i timmen på vardagar och 795 kr på helger, efter RUT-avdrag. En normal tvåa tar runt 4 timmar. Använd priskalkylatorn så får du ett fast pris för just din flytt.',
  },
  {
    q: 'Vad kostar flyttstädning?',
    a: 'Flyttstädning kostar 45 kr per kvadratmeter efter RUT-avdrag, alltså 2 700 kr för 60 kvm. Fönsterputs kan läggas till för 64 kr per 2-sidigt fönster.',
  },
  {
    q: 'Är priset verkligen fast?',
    a: 'Ja. Priset du får är priset du betalar, så länge uppgifterna du lämnat stämmer (storlek, våning, hiss och avstånd). Om något behöver ändras på plats frågar vi dig skriftligt innan vi gör något extra.',
  },
  {
    q: 'Hur fungerar RUT-avdraget?',
    a: 'Du betalar bara halva arbetskostnaden. Vi drar av 50 % direkt på fakturan och ansöker om resten hos Skatteverket. Taket är 75 000 kr per person och år.',
  },
  {
    q: 'Vad händer om besiktningen inte blir godkänd?',
    a: `Hör av dig inom ${site.promises.inspectionGuaranteeDays} dagar. Vi kommer tillbaka och åtgärdar anmärkningarna kostnadsfritt inom ${site.promises.inspectionFixHours} timmar. Fotorapporten visar hur det såg ut när vi lämnade.`,
  },
  {
    q: 'Måste jag betala i förväg?',
    a: `Nej. Du får fakturan när jobbet är klart, med RUT-avdraget redan avdraget och ${site.promises.invoiceDays} dagars betaltid.`,
  },
  {
    q: 'Vilka områden kör ni till?',
    a: 'Hela Stockholms län – från Upplands Väsby, Sollentuna och Täby till Stockholm, Solna, Nacka och Lidingö. Skriv ditt postnummer i rutan ovan så ser du direkt.',
  },
  {
    q: 'Do you speak English?',
    a: 'Yes. Write to us in English by e-mail or WhatsApp and we will reply in English. See our English page for prices and guarantees.',
  },
];
