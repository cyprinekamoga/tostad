import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zoned, toInstant, addDays, weekday, startOfWeek, weekNumber, seriesDates, longestRest, overlaps, warningsFor, routeLink, addMinutes } from '../src/lib/planner.js';

const H = 3600000;
const job = (id, date, from, to, toDate = date) => ({ id, start: toInstant(date, from).getTime(), end: toInstant(toDate, to).getTime() });

test('svensk tid fram och tillbaka, vinter och sommar', () => {
  assert.equal(toInstant('2026-01-15', '08:00').toISOString(), '2026-01-15T07:00:00.000Z');
  assert.equal(toInstant('2026-07-15', '08:00').toISOString(), '2026-07-15T06:00:00.000Z');
  assert.deepEqual(zoned('2026-07-15T06:00:00Z'), { date: '2026-07-15', time: '08:00', minutes: 480 });
  // Dagen då klockan ställs om till vintertid.
  assert.equal(toInstant('2026-10-25', '12:00').toISOString(), '2026-10-25T11:00:00.000Z');
});

test('datumhjälp', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(weekday('2026-10-19'), 0);
  assert.equal(weekday('2026-10-25'), 6);
  assert.equal(startOfWeek('2026-10-22'), '2026-10-19');
  assert.equal(weekNumber('2026-10-19'), 43);
  assert.equal(weekNumber('2027-01-01'), 53);
  assert.equal(addMinutes('22:30', 120), '23:59');
});

test('serie varannan vecka', () => {
  assert.deepEqual(seriesDates('2026-10-19', 2, '2026-11-30'), ['2026-10-19', '2026-11-02', '2026-11-16', '2026-11-30']);
});

test('längsta vila och dubbelbokning', () => {
  const from = toInstant('2026-10-20').getTime();
  const to = toInstant('2026-10-21').getTime();
  assert.equal(longestRest([job('a', '2026-10-20', '08:00', '12:00'), job('b', '2026-10-20', '13:00', '17:00')], from, to), 8 * H);
  assert.deepEqual(overlaps([job('a', '2026-10-20', '08:00', '12:00'), job('b', '2026-10-20', '11:00', '14:00'), job('c', '2026-10-20', '14:00', '15:00')]), [['a', 'b']]);
});

test('varningar för dygnsvila och veckovila', () => {
  const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'];
  // Vanlig dag: ingen varning.
  assert.deepEqual(warningsFor([job('a', '2026-10-20', '08:00', '17:00')], days), []);
  // Lunchrast mitt på dagen är ingen varning.
  assert.deepEqual(warningsFor([job('a', '2026-10-20', '08:00', '12:00'), job('b', '2026-10-20', '13:00', '17:00')], days), []);
  // Arbete 06 till 10 och 16 till 22 ger 16 timmars arbetsdag och bara 8 timmars vila.
  const split = warningsFor([job('a', '2026-10-20', '06:00', '10:00'), job('b', '2026-10-20', '16:00', '22:00')], days);
  assert.deepEqual(split, [{ kind: 'dygnsvila', date: '2026-10-20', restHours: 8 }]);
  // Kväll till 23 och start 07 nästa morgon: bara 8 timmars vila.
  const late = warningsFor([job('a', '2026-10-20', '15:00', '23:00'), job('b', '2026-10-21', '07:00', '12:00')], days);
  assert.equal(late.filter((w) => w.kind === 'dygnsvila').length, 1);
  // Arbete varje dag 08 till 20 utan en lång ledighet bryter veckovilan.
  const busy = days.map((d, i) => job(String(i), d, '08:00', '20:00'));
  assert.equal(warningsFor(busy, days).filter((w) => w.kind === 'veckovila').length, 1);
  // Med lördag och söndag lediga hålls veckovilan.
  assert.equal(warningsFor(busy.slice(0, 5), days).filter((w) => w.kind === 'veckovila').length, 0);
});

test('ruttlänk till Google Maps', () => {
  const url = new URL(routeLink('Hasselgatan 58, Upplands Väsby', ['A 1, Solna', 'B 2, Kista']));
  assert.equal(url.searchParams.get('destination'), 'B 2, Kista');
  assert.equal(url.searchParams.get('waypoints'), 'A 1, Solna');
  assert.equal(routeLink('x', []), null);
});
