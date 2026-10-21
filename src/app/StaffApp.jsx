// Personalens app: ram med meny längst ner, byggd för mobilen.
import { useEffect, useState, useErrorBoundary } from 'preact/hooks';
import { loadMe, go } from '../lib/supabase.js';
import Today from './staff/Today.jsx';
import Schedule from './staff/Schedule.jsx';
import JobPage from './staff/JobPage.jsx';
import Hours from './staff/Hours.jsx';
import Leave from './staff/Leave.jsx';
import Account from './staff/Account.jsx';

const TABS = [
  ['idag', '/app', 'Idag', 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z'],
  ['schema', '/app/schema', 'Schema', 'M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm-2 8h14v10H5z'],
  ['tider', '/app/tider', 'Tider', 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m1 5v5.4l4 2.3-1 1.7-5-2.9V7z'],
  ['ledighet', '/app/ledighet', 'Ledighet', 'M12 3a9 9 0 0 0-9 9h2a7 7 0 0 1 14 0h2a9 9 0 0 0-9-9m-1 10v8h2v-8z'],
  ['konto', '/app/konto', 'Konto', 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10m0 2c-5 0-9 2.5-9 5.5V22h18v-2.5C21 16.5 17 14 12 14'],
];

const PAGES = { idag: Today, schema: Schedule, jobb: JobPage, tider: Hours, ledighet: Leave, konto: Account };

export default function StaffApp({ page = 'idag' }) {
  const [me, setMe] = useState(null);

  useEffect(() => {
    (async () => {
      const current = await loadMe();
      if (!current || !current.profile?.active) return go(`/logga-in?next=${encodeURIComponent(window.location.pathname)}`);
      setMe(current);
    })();
  }, []);

  if (!me) return <p class="muted" aria-busy="true">Laddar …</p>;
  const Page = PAGES[page] ?? Today;
  const active = page === 'jobb' ? 'schema' : page;

  return (
    <div class="st-shell">
      <Boundary>
        <Page me={me} />
      </Boundary>
      <nav class="st-tabs" aria-label="Meny">
        {TABS.map(([key, href, label, icon]) => (
          <a href={href} aria-current={key === active ? 'page' : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icon} /></svg>
            <span>{label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}

function Boundary({ children }) {
  const [error] = useErrorBoundary((e) => console.error(e));
  if (error) return <p class="msg msg--error" role="alert">Sidan kunde inte visas: {String(error.message || error)}. Ladda om sidan.</p>;
  return children;
}
