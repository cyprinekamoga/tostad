// Checklistor per tjänst och summering av rapporterade timmar. Rena funktioner som går att testa.
import { startOfWeek } from './planner.js';

// Standardpunkter som visas när ett jobb inte har en egen checklista.
export const CHECKLISTS = {
  hemstadning: ['Dust surfaces and skirting boards', 'Vacuum and mop floors', 'Kitchen: counters, stove and sink', 'Bathroom: basin, toilet and shower', 'Empty bins', 'Take photos afterwards'],
  storstadning: ['Dust every surface, also high up', 'Wipe skirting boards, doors and switches', 'Kitchen: cupboard doors, appliances outside, stove and hood', 'Bathroom: tiles, grout, floor drain', 'Vacuum and mop floors', 'Take photos afterwards'],
  flyttstadning: ['Take photos before', 'Oven, trays and stove', 'Fridge and freezer (defrosted)', 'Hood and filter', 'Cupboards and drawers inside and out', 'Bathroom: tiles, grout, floor drain', 'Windows, frames and sashes', 'Radiators, skirting boards and doors', 'Floors vacuumed and mopped', 'Take photos afterwards'],
  fonsterputs: ['Take photos before', 'Clean the outside', 'Clean the inside', 'Wipe frames and window sills', 'Take photos afterwards'],
  kontor: ['Empty bins', 'Wipe desks and tables', 'Kitchenette: counters, sink and coffee machine', 'Toilets', 'Vacuum and mop floors'],
  flytt: ['Take photos before', 'Protect floors and door frames', 'Carry out and load', 'Check that the home is empty', 'Unload and place the furniture', 'Take photos afterwards'],
  paket: ['Take photos before', 'Protect floors and door frames', 'Carry out and load', 'Unload and place the furniture', 'Move-out cleaning by the checklist', 'Take photos afterwards'],
  pianoflytt: ['Take photos before', 'Measure doors and stairs', 'Strap and protect', 'Put in place', 'Take photos afterwards'],
  annat: ['Take photos before', 'Take photos afterwards'],
};

/** Jobbets checklista, eller standardlistan för tjänsten om jobbet saknar en egen. */
export function checklistFor(job) {
  if (Array.isArray(job.checklist) && job.checklist.length) return job.checklist;
  return (CHECKLISTS[job.service] ?? CHECKLISTS.annat).map((label) => ({ label, done: false }));
}

/** Timmar på en rad. */
export const entryHours = (entry) => Number(entry.hours) || 0;

/** Timmar per dag och vecka (måndag), räknat på arbetsdagen. */
export function sumHours(entries) {
  const days = {};
  const weeks = {};
  let total = 0;
  for (const e of entries) {
    const h = entryHours(e);
    const d = e.work_date;
    days[d] = (days[d] ?? 0) + h;
    const w = startOfWeek(d);
    weeks[w] = (weeks[w] ?? 0) + h;
    total += h;
  }
  return { days, weeks, total };
}

/** "3,5", "3.5" eller "3:30" blir 3.5. Ogiltigt eller utanför 0,25 till 16 timmar blir null. */
export function parseHours(value) {
  const text = String(value ?? '').trim().replace(',', '.');
  let h;
  const clock = text.match(/^(\d{1,2}):([0-5]\d)$/);
  if (clock) h = Number(clock[1]) + Number(clock[2]) / 60;
  else if (/^\d{0,2}(\.\d+)?$/.test(text) && text !== '' && text !== '.') h = Number(text);
  else return null;
  h = Math.round(h * 4) / 4;
  return h >= 0.25 && h <= 16 ? h : null;
}

/** Ett jobbs längd avrundad till närmaste kvart, som förslag på timmar. */
export const jobHours = (job) => Math.max(0.25, Math.round(((job.end - job.start) / 3600000) * 4) / 4);

/** 7,5 h blir "7 h 30 min". */
export function formatHours(h) {
  const minutes = Math.round(h * 60);
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  if (!hh) return `${mm} min`;
  return mm ? `${hh} h ${mm} min` : `${hh} h`;
}
