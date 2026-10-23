// Översikt: nya ärenden, antal kunder och personal, och de senaste ärendena.
import { useEffect, useState } from 'preact/hooks';
import { supabase, formatDateTime } from '../../lib/supabase.js';
import { KIND, summary } from './submission.js';
import { today } from '../../lib/planner.js';
import { loadJobs, jobLabel, jobAddress, SERVICE_LABELS, serviceColor } from './jobs.js';

export default function Overview({ me }) {
  const [stats, setStats] = useState(null);
  const [latest, setLatest] = useState([]);
  const [todays, setTodays] = useState(null);
  const [pending, setPending] = useState(0);
  const [names, setNames] = useState({});

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const head = { count: 'exact', head: true };
      loadJobs(today(), today())
        .then((list) => setTodays(list.filter((j) => j.status !== 'avbokad')))
        .catch(() => setTodays([]));
      sb.from('profiles').select('id, full_name').then(({ data }) => setNames(Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name]))));
      Promise.all([
        sb.from('absences').select('id', { count: 'exact', head: true }).eq('status', 'begard'),
        sb.from('swap_requests').select('id', { count: 'exact', head: true }).eq('status', 'vantar'),
      ]).then(([a, b]) => setPending((a.count ?? 0) + (b.count ?? 0)));
      const [fresh, customers, staff, rows] = await Promise.all([
        sb.from('submissions').select('id', head).eq('status', 'ny'),
        sb.from('customers').select('id', head),
        sb.from('profiles').select('id', head).eq('active', true),
        sb.from('submissions').select('id, kind, name, data, created_at').eq('status', 'ny').order('created_at', { ascending: false }).limit(5),
      ]);
      setStats({ fresh: fresh.count ?? 0, customers: customers.count ?? 0, staff: staff.count ?? 0 });
      setLatest(rows.data ?? []);
    })();
  }, []);

  return (
    <>
      <div class="cp-head">
        <h2>Hi {me.profile.full_name.split(' ')[0]}!</h2>
      </div>
      <div class="cp-stats">
        <a class="cp-panel cp-stat" href="/admin/planering?vy=dag">
          <strong>{todays ? todays.length : '…'}</strong>
          <span>Jobs today</span>
        </a>
        <a class="cp-panel cp-stat" href="/admin/inkorg">
          <strong>{stats ? stats.fresh : '…'}</strong>
          <span>New items in the inbox</span>
        </a>
        {pending > 0 && (
          <a class="cp-panel cp-stat" href="/admin/ledighet">
            <strong>{pending}</strong>
            <span>Time off and shift swaps waiting for a decision</span>
          </a>
        )}
        <a class="cp-panel cp-stat" href="/admin/kunder">
          <strong>{stats ? stats.customers : '…'}</strong>
          <span>Customers</span>
        </a>
        <a class="cp-panel cp-stat" href="/admin/personal">
          <strong>{stats ? stats.staff : '…'}</strong>
          <span>Active staff</span>
        </a>
      </div>
      <div class="cp-panel" style="margin-bottom:20px">
        <div class="cp-head">
          <h2 style="font-size:1.15rem">Today's jobs</h2>
          <span class="cp-actions">
            <a href="/admin/planering">Planner</a>
            <a href="/admin/karta">Map</a>
          </span>
        </div>
        {todays?.length === 0 && <p class="cp-empty">No jobs today.</p>}
        {todays?.length > 0 && (
          <ul class="cp-list">
            {todays.map((j) => (
              <li>
                <a class="cp-row" href={`/admin/planering?jobb=${j.id}`} style={`text-decoration:none;border-left:6px solid ${serviceColor(j.service)}`}>
                  <span class="cp-row-top">
                    <strong>{j.startTime} to {j.endTime} · {jobLabel(j)}</strong>
                    <span class="badge" style={`background:${serviceColor(j.service)};color:#fff`}>{SERVICE_LABELS[j.service]}</span>
                  </span>
                  <p>{jobAddress(j) || 'No address'}</p>
                  <small>{j.staff.length ? j.staff.map((id) => names[id] ?? '').filter(Boolean).join(', ') : 'No staff booked'}</small>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div class="cp-panel">
        <div class="cp-head">
          <h2 style="font-size:1.15rem">Latest new items</h2>
          <a href="/admin/inkorg">Show the inbox</a>
        </div>
        {latest.length === 0 ? (
          <p class="cp-empty">No new items right now.</p>
        ) : (
          <ul class="cp-list">
            {latest.map((s) => (
              <li>
                <a class="cp-row" href={`/admin/inkorg#${s.id}`} style="text-decoration:none">
                  <span class="cp-row-top">
                    <strong>{s.name || 'No name'}</strong>
                    <span class={`badge badge--${s.kind}`}>{KIND[s.kind]}</span>
                  </span>
                  <p>{summary(s)}</p>
                  <small>{formatDateTime(s.created_at)}</small>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
