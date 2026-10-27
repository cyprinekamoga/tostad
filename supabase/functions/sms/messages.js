// SMS som en administratör skickar för hand. Rena funktioner utan nätverk, så att de går att testa.
const TZ = 'Europe/Stockholm';

const partsFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** Datum, klockslag och timme i svensk tid. */
export function zoned(when) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(when)).map((x) => [x.type, x.value]));
  const hour = p.hour === '24' ? '00' : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}`, hour: Number(hour) };
}

/** Mobilnummer i formatet 46elks vill ha (+46701234567). Fasta nummer och skräp blir null. */
export function smsPhone(raw) {
  let d = String(raw ?? '').trim();
  const plus = d.startsWith('+');
  d = d.replace(/\D/g, '');
  if (!d) return null;
  if (!plus && d.startsWith('00')) d = d.slice(2);
  else if (!plus && d.startsWith('0')) d = `46${d.slice(1)}`;
  if (d.startsWith('460')) d = `46${d.slice(3)}`;
  if (d.startsWith('46')) return /^467[02369]\d{7}$/.test(d) ? `+${d}` : null;
  return /^[1-9]\d{7,14}$/.test(d) ? `+${d}` : null;
}

/** Platshållare i en mall som inte är ifyllda, till exempel [tid]. */
export const unfilled = (text) => [...new Set(String(text).match(/\[[^\]\n]{1,30}\]/g) ?? [])];
