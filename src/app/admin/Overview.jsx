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
  const [names, setNames] = useState({});

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const head = { count: 'exact', head: true };
      loadJobs(today(), today())
        .then((list) => setTodays(list.filter((j) => j.status !== 'avbokad')))
        .catch(() => setTodays([]));
      sb.from('profiles').select('id, full_name').then(({ data }) => setNames(Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name]))));
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
        <h2>Hej {me.profile.full_name.split(' ')[0]}!</h2>
      </div>
      <div class="cp-stats">
        <a class="cp-panel cp-stat" href="/admin/planering?vy=dag">
          <strong>{todays ? todays.length : '…'}</strong>
          <span>Jobb idag</span>
        </a>
        <a class="cp-panel cp-stat" href="/admin/inkorg">
          <strong>{stats ? stats.fresh : '…'}</strong>
          <span>Nya ärenden i inkorgen</span>
        </a>
        <a class="cp-panel cp-stat" href="/admin/kunder">
          <strong>{stats ? stats.customers : '…'}</strong>
          <span>Kunder</span>
        </a>
        <a class="cp-panel cp-stat" href="/admin/personal">
          <strong>{stats ? stats.staff : '…'}</strong>
          <span>Aktiv personal</span>
        </a>
      </div>
      <div class="cp-panel" style="margin-bottom:20px">
        <div class="cp-head">
          <h2 style="font-size:1.15rem">Dagens jobb</h2>
          <span class="cp-actions">
            <a href="/admin/planering">Planering</a>
            <a href="/admin/karta">Karta</a>
          </span>
        </div>
        {todays?.length === 0 && <p class="cp-empty">Inga jobb idag.</p>}
        {todays?.length > 0 && (
          <ul class="cp-list">
            {todays.map((j) => (
              <li>
                <a class="cp-row" href={`/admin/planering?jobb=${j.id}`} style={`text-decoration:none;border-left:6px solid ${serviceColor(j.service)}`}>
                  <span class="cp-row-top">
                    <strong>{j.startTime} till {j.endTime} · {jobLabel(j)}</strong>
                    <span class="badge" style={`background:${serviceColor(j.service)};color:#fff`}>{SERVICE_LABELS[j.service]}</span>
                  </span>
                  <p>{jobAddress(j) || 'Adress saknas'}</p>
                  <small>{j.staff.length ? j.staff.map((id) => names[id] ?? '').filter(Boolean).join(', ') : 'Ingen personal bokad'}</small>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div class="cp-panel">
        <div class="cp-head">
          <h2 style="font-size:1.15rem">Senaste nya ärenden</h2>
          <a href="/admin/inkorg">Visa inkorgen</a>
        </div>
        {latest.length === 0 ? (
          <p class="cp-empty">Inga nya ärenden just nu.</p>
        ) : (
          <ul class="cp-list">
            {latest.map((s) => (
              <li>
                <a class="cp-row" href={`/admin/inkorg#${s.id}`} style="text-decoration:none">
                  <span class="cp-row-top">
                    <strong>{s.name || 'Utan namn'}</strong>
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
