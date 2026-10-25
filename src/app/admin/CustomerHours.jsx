// Kundtimmar: hur många timmar personalen har arbetat hos varje kund, och hur många jobb som kommer
// från varje uppdragsgivare (t.ex. Spic and Span) per månad.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { supabase } from '../../lib/supabase.js';
import { today, toInstant } from '../../lib/planner.js';
import { formatHours } from '../../lib/worktime.js';
import { countable, byCustomer, byProvider, monthsUpTo } from '../../lib/customerHours.js';
import { ErrorMsg } from '../ui.jsx';

const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const label = (m, fmt = monthFmt) => fmt.format(new Date(`${m}-15T12:00:00Z`));
const fmtDay = (d) => dayFmt.format(new Date(`${d}T12:00:00Z`));
const hours = (h) => (h ? formatHours(h) : '0 h');

function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

export default function CustomerHours() {
  const sb = supabase();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [mode, setMode] = useState('month');
  const [jobs, setJobs] = useState(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState('');
  const [error, setError] = useState('');

  const year = month.slice(0, 4);
  const months = mode === 'year' ? Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`) : monthsUpTo(month, 6);
  const inPeriod = (m) => (mode === 'year' ? m.startsWith(year) : m === month);

  useEffect(() => {
    setJobs(null);
    setError('');
    const from = months[0];
    const to = shiftMonth(months[months.length - 1], 1);
    sb.from('jobs')
      .select('id, starts_at, ends_at, status, title, street, city, customer_id, customers(id, name, kind), work_hours(hours)')
      .gte('starts_at', toInstant(`${from}-01`).toISOString())
      .lt('starts_at', toInstant(`${to}-01`).toISOString())
      .neq('status', 'avbokad')
      .order('starts_at')
      .limit(5000)
      .then(({ data, error: err }) => {
        if (err) setError('Could not load the jobs.');
        setJobs(data ?? []);
      });
  }, [month, mode]);

  const rows = useMemo(() => countable(jobs ?? []), [jobs]);
  const period = rows.filter((r) => inPeriod(r.month));
  const providers = byProvider(rows, months);
  const periodProviders = byProvider(period, [...new Set(period.map((r) => r.month))]);
  const customers = byCustomer(period);
  const q = query.trim().toLowerCase();
  const shown = q ? customers.filter((c) => `${c.name} ${c.provider} ${c.rows.map((r) => r.address).join(' ')}`.toLowerCase().includes(q)) : customers;
  const totals = period.reduce((t, r) => ({ jobs: t.jobs + 1, staff: t.staff + r.staffHours, site: t.site + r.siteHours }), { jobs: 0, staff: 0, site: 0 });
  const periodLabel = mode === 'year' ? year : label(month);

  function exportCsv() {
    const clean = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const dec = (h) => (Math.round(h * 100) / 100).toFixed(2);
    const lines = [['Customer', 'Provider', 'Date', 'Address', 'People', 'Hours worked', 'Hours on site'].join(';')];
    for (const c of shown) for (const r of c.rows) lines.push([clean(c.name), clean(c.provider), r.date, clean(r.address), r.people, dec(r.staffHours), dec(r.siteHours)].join(';'));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `customer-hours-${mode === 'year' ? year : month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div class="cp-head">
        <h2>Customer hours</h2>
        <div class="pl-nav">
          <div class="cp-tabs" role="group" aria-label="Period">
            <button type="button" aria-pressed={mode === 'month'} onClick={() => setMode('month')}>Month</button>
            <button type="button" aria-pressed={mode === 'year'} onClick={() => setMode('year')}>Year</button>
          </div>
          <button class="btn btn--ghost btn--sm" type="button" aria-label="Previous" onClick={() => setMonth(shiftMonth(month, mode === 'year' ? -12 : -1))}>‹</button>
          <strong class="pl-title" style="margin:0 6px">{periodLabel}</strong>
          <button class="btn btn--ghost btn--sm" type="button" aria-label="Next" onClick={() => setMonth(shiftMonth(month, mode === 'year' ? 12 : 1))}>›</button>
        </div>
      </div>
      <p class="muted">
        Hours worked is the time every person on the job reported, added together. Hours on site is how long the job is in the planner. Cancelled jobs are not counted.
      </p>
      <ErrorMsg error={error} />

      {jobs === null ? (
        <p class="muted">Loading …</p>
      ) : (
        <>
          <div class="cp-stats">
            <div class="cp-panel cp-stat">
              <strong>{totals.jobs}</strong>
              <span>Jobs in {periodLabel}, {hours(totals.staff)} worked</span>
            </div>
            {periodProviders.slice(0, 5).map((p) => (
              <div class="cp-panel cp-stat">
                <strong>{hours(p.total.staffHours)}</strong>
                <span>{p.name}: {p.total.jobs} {p.total.jobs === 1 ? 'job' : 'jobs'}, {hours(p.total.siteHours)} on site</span>
              </div>
            ))}
          </div>

          <section class="cp-panel" style="margin-bottom:16px">
            <h3 class="cp-subhead">Jobs per month from each provider</h3>
            <p class="muted">A company customer that sends you jobs (like Spic and Span) is its own provider. Private customers are counted as your own customers.</p>
            {providers.length === 0 ? (
              <p class="muted">No jobs in this period.</p>
            ) : (
              <div class="cp-scroll">
                <table class="cp-table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      {months.map((m) => <th>{label(m, shortFmt)}</th>)}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providers.map((p) => (
                      <tr>
                        <td><strong>{p.name}</strong></td>
                        {months.map((m) => (
                          <td>
                            {p.months[m].jobs ? (
                              <>
                                {p.months[m].jobs} {p.months[m].jobs === 1 ? 'job' : 'jobs'}
                                <br />
                                <small class="muted">{hours(p.months[m].staffHours)}</small>
                              </>
                            ) : (
                              <span class="muted">0</span>
                            )}
                          </td>
                        ))}
                        <td>
                          <strong>{p.total.jobs} {p.total.jobs === 1 ? 'job' : 'jobs'}</strong>
                          <br />
                          <small>{hours(p.total.staffHours)}</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section class="cp-panel">
            <h3 class="cp-subhead">Hours per customer, {periodLabel}</h3>
            <div class="cp-actions" style="margin-bottom:12px">
              <input type="search" placeholder="Search customer or address" aria-label="Search customer or address" value={query} onInput={(e) => setQuery(e.currentTarget.value)} style="max-width:320px" />
              <button class="btn btn--sm" type="button" disabled={!shown.length} onClick={exportCsv}>Export to Excel (CSV)</button>
            </div>
            {shown.length === 0 ? (
              <p class="muted">{q ? 'No customer matches the search.' : 'No jobs in this period.'}</p>
            ) : (
              <div class="cp-scroll">
                <table class="cp-table">
                  <thead>
                    <tr><th>Customer</th><th>Provider</th><th>Jobs</th><th>Hours worked</th><th>Hours on site</th><th><span class="visually-hidden">Show</span></th></tr>
                  </thead>
                  <tbody>
                    {shown.map((c) => [
                      <tr>
                        <td><strong>{c.name}</strong></td>
                        <td>{c.provider}</td>
                        <td>{c.jobs}</td>
                        <td>
                          {hours(c.staffHours)}
                          {c.unreported > 0 && <><br /><small class="muted">{c.unreported} without reported hours</small></>}
                        </td>
                        <td>{hours(c.siteHours)}</td>
                        <td>
                          <button class="btn btn--ghost btn--sm" type="button" onClick={() => setOpen(open === c.key ? '' : c.key)}>
                            {open === c.key ? 'Hide' : 'Show jobs'}
                          </button>
                        </td>
                      </tr>,
                      open === c.key && (
                        <tr>
                          <td colSpan={6}>
                            <ul class="cp-list">
                              {c.rows.map((r) => (
                                <li class="cp-row cp-row--static">
                                  <span class="cp-row-top">
                                    <strong>{fmtDay(r.date)}</strong>
                                    <span>{r.reported ? hours(r.staffHours) : 'No hours reported'}</span>
                                  </span>
                                  <p>
                                    {r.address}
                                    {r.people > 0 && ` · ${r.people} ${r.people === 1 ? 'person' : 'people'}`} · {hours(r.siteHours)} on site
                                  </p>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ),
                    ])}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
