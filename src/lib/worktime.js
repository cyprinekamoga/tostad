// Checklistor per tjänst och summering av stämplade tider. Rena funktioner som går att testa.
import { zoned, startOfWeek } from './planner.js';

// Standardpunkter som visas när ett jobb inte har en egen checklista.
export const CHECKLISTS = {
  hemstadning: ['Damma av ytor och lister', 'Dammsuga och våttorka golv', 'Kök: bänkar, spis och diskho', 'Badrum: handfat, toalett och dusch', 'Tömma papperskorgar', 'Ta foton efteråt'],
  storstadning: ['Damma av alla ytor, även högt upp', 'Torka lister, dörrar och strömbrytare', 'Kök: luckor, vitvaror utvändigt, spis och fläkt', 'Badrum: kakel, fogar, golvbrunn', 'Dammsuga och våttorka golv', 'Ta foton efteråt'],
  flyttstadning: ['Ta foton före', 'Ugn, plåtar och spis', 'Kyl och frys (avfrostade)', 'Fläkt och filter', 'Skåp och lådor in och utvändigt', 'Badrum: kakel, fogar, golvbrunn', 'Fönster, karmar och bågar', 'Element, lister och dörrar', 'Golv dammsugna och våttorkade', 'Ta foton efteråt'],
  fonsterputs: ['Ta foton före', 'Putsa utsida', 'Putsa insida', 'Torka karmar och fönsterbleck', 'Ta foton efteråt'],
  kontor: ['Tömma papperskorgar', 'Torka skrivbord och bord', 'Pentry: bänkar, diskho och kaffemaskin', 'Toaletter', 'Dammsuga och våttorka golv'],
  flytt: ['Ta foton före', 'Skydda golv och dörrkarmar', 'Bär ut och lasta', 'Kontrollera att bostaden är tom', 'Lasta av och ställ möbler på plats', 'Ta foton efteråt'],
  paket: ['Ta foton före', 'Skydda golv och dörrkarmar', 'Bär ut och lasta', 'Lasta av och ställ möbler på plats', 'Flyttstädning enligt checklistan', 'Ta foton efteråt'],
  pianoflytt: ['Ta foton före', 'Mät dörrar och trappor', 'Spänn fast och skydda', 'Ställ på plats', 'Ta foton efteråt'],
  annat: ['Ta foton före', 'Ta foton efteråt'],
};

/** Jobbets checklista, eller standardlistan för tjänsten om jobbet saknar en egen. */
export function checklistFor(job) {
  if (Array.isArray(job.checklist) && job.checklist.length) return job.checklist;
  return (CHECKLISTS[job.service] ?? CHECKLISTS.annat).map((label) => ({ label, done: false }));
}

/** Längd i timmar. En pågående stämpling räknas fram till now. */
export function entryHours(entry, now = Date.now()) {
  const end = entry.ended_at ? Date.parse(entry.ended_at) : now;
  return Math.max(0, (end - Date.parse(entry.started_at)) / 3600000);
}

/** Timmar per dag och vecka (måndag), räknat på dagen då stämplingen började i svensk tid. */
export function sumHours(entries, now = Date.now()) {
  const days = {};
  const weeks = {};
  let total = 0;
  for (const e of entries) {
    const h = entryHours(e, now);
    const d = zoned(e.started_at).date;
    days[d] = (days[d] ?? 0) + h;
    const w = startOfWeek(d);
    weeks[w] = (weeks[w] ?? 0) + h;
    total += h;
  }
  return { days, weeks, total };
}

/** 7,5 h blir "7 h 30 min". */
export function formatHours(h) {
  const minutes = Math.round(h * 60);
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  if (!hh) return `${mm} min`;
  return mm ? `${hh} h ${mm} min` : `${hh} h`;
}
