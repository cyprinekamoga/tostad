// SMS kvällen före: vem som ska få vad. Rena funktioner utan nätverk, så att de går att testa.
const TZ = 'Europe/Stockholm';

const partsFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** Datum, klockslag och timme i svensk tid. */
export function zoned(when) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(when)).map((x) => [x.type, x.value]));
  const hour = p.hour === '24' ? '00' : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}`, hour: Number(hour) };
}

export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Midnatt i Sverige som tidpunkt (hanterar sommar- och vintertid). */
export function swedishMidnight(date) {
  const [y, m, d] = date.split('-').map(Number);
  const wanted = Date.UTC(y, m - 1, d);
  let guess = wanted;
  for (let i = 0; i < 3; i++) {
    const z = zoned(guess);
    const [zy, zm, zd] = z.date.split('-').map(Number);
    const [hh, mm] = z.time.split(':').map(Number);
    const shown = Date.UTC(zy, zm - 1, zd, hh, mm);
    if (shown === wanted) break;
    guess += wanted - shown;
  }
  return new Date(guess);
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

const CUSTOMER_SERVICE = {
  flytt: 'flytt',
  flyttstadning: 'flyttstädning',
  paket: 'flytt och flyttstädning',
  hemstadning: 'hemstädning',
  storstadning: 'storstädning',
  fonsterputs: 'fönsterputs',
  kontor: 'städning',
  pianoflytt: 'pianoflytt',
  annat: 'uppdraget',
};

const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] ?? '';
const joinNames = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} och ${names[names.length - 1]}`);
const place = (job) => [job.street, job.city].filter(Boolean).join(', ');

/** Byter {nyckel} mot värden. Okända nycklar lämnas som de är. */
export function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)).replace(/[ \t]+\n/g, '\n').trim();
}

function team(job) {
  return (job.job_staff ?? []).map((s) => s.profiles).filter((p) => p && p.active !== false);
}

/**
 * Alla SMS för jobben en dag. Varje rad har antingen phone och body, eller skip med en orsak.
 * Bara kunderna får SMS. Personalen ser sina jobb i appen, så job_staff används bara för vem som kommer.
 * jobs: med customers(name, phone, kind) och job_staff(profiles(id, full_name, phone, active)).
 */
export function plan(jobs, settings, date) {
  const out = [];
  const todo = jobs.filter((j) => j.status === 'planerad' && zoned(j.starts_at).date === date).sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  for (const job of todo) {
    const c = job.customers;
    const base = { kind: 'kvall_kund', ref_date: date, job_id: job.id, customer_id: c?.id ?? null, profile_id: null, who: c?.name ?? job.title ?? job.street ?? 'Job' };
    if (!c) {
      out.push({ ...base, skip: 'No customer on the job' });
      continue;
    }
    if (c.kind === 'company' && !settings.sms_company_customers) {
      out.push({ ...base, skip: 'Company customer (turned off in the settings)' });
      continue;
    }
    const phone = smsPhone(c.phone);
    if (!phone) {
      out.push({ ...base, skip: c.phone ? 'Not a mobile number' : 'No phone number' });
      continue;
    }
    const names = team(job).map((p) => firstName(p.full_name)).filter(Boolean);
    const body = fill(settings.sms_customer_text, {
      namn: c.kind === 'company' ? c.name : firstName(c.name),
      tjanst: CUSTOMER_SERVICE[job.service] ?? 'uppdraget',
      datum: `${Number(date.slice(8))}/${Number(date.slice(5, 7))}`,
      tid: zoned(job.starts_at).time,
      adress: place(job) || 'adressen vi har fått',
      team: names.length ? joinNames(names) : 'Vårt team',
      telefon: settings.phone,
    });
    out.push({ ...base, phone, body });
  }

  return out;
}

/** Minuter personalen kan välja för när de är framme. */
export const ARRIVAL_MINUTES = [10, 15, 20, 30, 45, 60, 90];

/**
 * SMS:et när personalen trycker "We are on our way". job: med customers(name, phone, kind) och job_staff som i plan.
 * Svarar { phone, body } eller { skip } med en orsak på engelska som visas för personalen.
 */
export function onWayMessage(job, settings, minutes) {
  const c = job.customers;
  if (!settings.sms_onway_enabled) return { skip: 'SMS when on the way is turned off' };
  if (!c) return { skip: 'The job has no customer' };
  if (c.kind === 'company' && !settings.sms_company_customers) return { skip: 'Company customers do not get SMS' };
  const phone = smsPhone(c.phone);
  if (!phone) return { skip: c.phone ? 'The customer has no mobile number' : 'The customer has no phone number' };
  if (!ARRIVAL_MINUTES.includes(minutes)) return { skip: 'Choose when you arrive' };
  const names = team(job).map((p) => firstName(p.full_name)).filter(Boolean);
  const body = fill(settings.sms_onway_text, {
    namn: c.kind === 'company' ? c.name : firstName(c.name),
    team: names.length ? joinNames(names) : 'Vårt team',
    tjanst: CUSTOMER_SERVICE[job.service] ?? 'uppdraget',
    adress: place(job) || 'er adress',
    minuter: minutes,
    telefon: settings.phone,
  });
  return { phone, body };
}

/** Är det dags att skicka? Mellan sändtiden och 22 svensk tid. */
export function isSendTime(now, hour) {
  const h = zoned(now).hour;
  return h >= hour && h < 22;
}
