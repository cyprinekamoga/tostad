// Översikt: nya ärenden, antal kunder och personal, och de senaste ärendena.
import { useEffect, useState } from 'preact/hooks';
import { supabase, formatDateTime } from '../../lib/supabase.js';
import { KIND, summary } from './submission.js';

export default function Overview({ me }) {
  const [stats, setStats] = useState(null);
  const [latest, setLatest] = useState([]);

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const head = { count: 'exact', head: true };
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
      <div class="ad-head">
        <h2>Hej {me.profile.full_name.split(' ')[0]}!</h2>
      </div>
      <div class="ad-stats">
        <a class="ad-panel ad-stat" href="/admin/inkorg">
          <strong>{stats ? stats.fresh : '…'}</strong>
          <span>Nya ärenden i inkorgen</span>
        </a>
        <a class="ad-panel ad-stat" href="/admin/kunder">
          <strong>{stats ? stats.customers : '…'}</strong>
          <span>Kunder</span>
        </a>
        <a class="ad-panel ad-stat" href="/admin/personal">
          <strong>{stats ? stats.staff : '…'}</strong>
          <span>Aktiv personal</span>
        </a>
      </div>
      <div class="ad-panel">
        <div class="ad-head">
          <h2 style="font-size:1.15rem">Senaste nya ärenden</h2>
          <a href="/admin/inkorg">Visa inkorgen</a>
        </div>
        {latest.length === 0 ? (
          <p class="ad-empty">Inga nya ärenden just nu.</p>
        ) : (
          <ul class="ad-list">
            {latest.map((s) => (
              <li>
                <a class="ad-row" href={`/admin/inkorg#${s.id}`} style="text-decoration:none">
                  <span class="ad-row-top">
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
