// Mina tider: stämplingar per månad med summa per vecka.
import { useEffect, useState } from 'preact/hooks';
import { today, toInstant, weekNumber, zoned } from '../../lib/planner.js';
import { sumHours, formatHours, entryHours } from '../../lib/worktime.js';
import { ErrorMsg } from '../ui.jsx';
import { entries as loadEntries } from './api.js';
import { dayName } from './parts.jsx';

const monthFmt = new Intl.DateTimeFormat('sv-SE', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

export default function Hours({ me }) {
  const [month, setMonth] = useState(today().slice(0, 7));
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setRows(null);
    const from = toInstant(`${month}-01`).toISOString();
    const to = toInstant(`${shiftMonth(month, 1)}-01`).toISOString();
    loadEntries(me.profile.id, from, to).then(setRows, (e) => setError(e.message));
  }, [month]);

  const sums = sumHours(rows ?? []);
  const days = Object.keys(sums.days).sort().reverse();
  const label = monthFmt.format(new Date(`${month}-15T12:00:00Z`));

  return (
    <div class="st-page">
      <div class="st-weekbar">
        <button class="btn btn--ghost btn--sm" type="button" aria-label="Föregående månad" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <div>
          <strong style="text-transform:capitalize">{label}</strong>
          <small>{rows ? `Totalt ${formatHours(sums.total)}` : 'Laddar …'}</small>
        </div>
        <button class="btn btn--ghost btn--sm" type="button" aria-label="Nästa månad" disabled={month >= today().slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
      </div>
      <ErrorMsg error={error} />
      {rows !== null && Object.keys(sums.weeks).length > 0 && (
        <section class="st-card">
          <h3>Per vecka</h3>
          <ul class="st-sum">
            {Object.keys(sums.weeks).sort().map((w) => (
              <li><span>Vecka {weekNumber(w)}</span><strong>{formatHours(sums.weeks[w])}</strong></li>
            ))}
          </ul>
        </section>
      )}
      {rows?.length === 0 && <p class="st-empty">Inga stämplingar den här månaden.</p>}
      {days.map((d) => (
        <section class="st-section">
          <h4 class="st-day">{dayName(d)} <span class="muted">{formatHours(sums.days[d])}</span></h4>
          <ul class="st-entries">
            {rows.filter((e) => zoned(e.started_at).date === d).map((e) => (
              <li class={e.ended_at ? '' : 'is-open'}>
                <span>{zoned(e.started_at).time} till {e.ended_at ? zoned(e.ended_at).time : 'nu'}</span>
                <strong>{formatHours(entryHours(e))}</strong>
                {e.edited_by && <small class="muted">Ändrad av administratör</small>}
                {e.note && <small class="muted">{e.note}</small>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p class="st-fine">Har du glömt att stämpla eller blivit fel? Säg till en administratör, som kan rätta tiden.</p>
    </div>
  );
}
