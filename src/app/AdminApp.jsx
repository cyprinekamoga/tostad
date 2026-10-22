// Ramen för administrationen: kontrollerar inloggning och behörighet, visar menyn och sidan.
import { useEffect, useState, useErrorBoundary } from 'preact/hooks';
import { supabase, loadMe, isAdminRole, go, callFunction } from '../lib/supabase.js';
import Overview from './admin/Overview.jsx';
import Inbox from './admin/Inbox.jsx';
import Customers from './admin/Customers.jsx';
import Staff from './admin/Staff.jsx';
import Planner from './admin/Planner.jsx';
import MapPage from './admin/MapPage.jsx';
import Absences from './admin/Absences.jsx';
import TimeReport from './admin/TimeReport.jsx';
import Quotes from './admin/Quotes.jsx';
import Invoices from './admin/Invoices.jsx';
import Money from './admin/Money.jsx';
import Settings from './admin/Settings.jsx';
import Careers from './admin/Careers.jsx';

const PAGES = {
  oversikt: { href: '/admin', label: 'Översikt', Page: Overview },
  planering: { href: '/admin/planering', label: 'Planering', Page: Planner },
  karta: { href: '/admin/karta', label: 'Karta', Page: MapPage },
  inkorg: { href: '/admin/inkorg', label: 'Inkorg', Page: Inbox },
  kunder: { href: '/admin/kunder', label: 'Kunder', Page: Customers },
  offerter: { href: '/admin/offerter', label: 'Offerter', Page: Quotes },
  fakturor: { href: '/admin/fakturor', label: 'Fakturor', Page: Invoices },
  ekonomi: { href: '/admin/ekonomi', label: 'Ekonomi', Page: Money },
  ledighet: { href: '/admin/ledighet', label: 'Ledighet', Page: Absences },
  tider: { href: '/admin/tider', label: 'Tider', Page: TimeReport },
  rekrytering: { href: '/admin/rekrytering', label: 'Rekrytering', Page: Careers },
  personal: { href: '/admin/personal', label: 'Personal', Page: Staff },
  installningar: { href: '/admin/installningar', label: 'Inställningar', Page: Settings },
};

export default function AdminApp({ page }) {
  const [me, setMe] = useState(null);
  const [newCount, setNewCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [appCount, setAppCount] = useState(0);

  // Siffror i menyn: nya ärenden i inkorgen och ledighet eller passbyten som väntar på beslut.
  async function refreshCount() {
    const sb = supabase();
    const head = { count: 'exact', head: true };
    const [inbox, leave, swaps, apps] = await Promise.all([
      sb.from('submissions').select('id', head).eq('status', 'ny'),
      sb.from('absences').select('id', head).eq('status', 'begard'),
      sb.from('swap_requests').select('id', head).eq('status', 'vantar'),
      sb.from('applications').select('id', head).eq('status', 'ny'),
    ]);
    setAppCount(apps.count ?? 0);
    setNewCount(inbox.count ?? 0);
    setPendingCount((leave.count ?? 0) + (swaps.count ?? 0));
  }

  useEffect(() => {
    (async () => {
      const current = await loadMe();
      const back = `/logga-in?next=${encodeURIComponent(window.location.pathname)}`;
      if (!current || !current.profile?.active) return go(back);
      if (!isAdminRole(current.profile.role)) return go('/app');
      setMe(current);
      refreshCount();
      // Gallring enligt integritetspolicyn, en gång per inloggning.
      try {
        if (!sessionStorage.getItem('tostad-gallrat')) {
          sessionStorage.setItem('tostad-gallrat', '1');
          callFunction('housekeeping', {}).catch(() => {});
        }
      } catch {
        /* sessionStorage kan saknas */
      }
    })();
  }, []);

  async function signOut() {
    await supabase().auth.signOut();
    go('/logga-in');
  }

  if (!me) return <p class="muted" aria-busy="true">Laddar …</p>;
  const { Page } = PAGES[page] ?? PAGES.oversikt;

  return (
    <div class="cp-shell">
      <nav class="cp-nav" aria-label="Administration">
        {Object.entries(PAGES).map(([key, p]) => (
          <a href={p.href} aria-current={key === page ? 'page' : undefined}>
            {p.label}
            {key === 'inkorg' && newCount > 0 && <span class="count">{newCount}</span>}
            {key === 'ledighet' && pendingCount > 0 && <span class="count">{pendingCount}</span>}
            {key === 'rekrytering' && appCount > 0 && <span class="count">{appCount}</span>}
          </a>
        ))}
        <span class="cp-me">{me.profile.full_name}</span>
        <a href="/app">Mina jobb</a>
        <button type="button" onClick={signOut}>Logga ut</button>
      </nav>
      <section style="min-width:0">
        <PageBoundary>
          <Page me={me} onInboxChange={refreshCount} />
        </PageBoundary>
      </section>
    </div>
  );
}

// Visar felet på skärmen i stället för en tom sida om en sida kraschar.
function PageBoundary({ children }) {
  const [error] = useErrorBoundary((e) => console.error(e));
  if (error) return <p class="msg msg--error" role="alert">Sidan kunde inte visas: {String(error.message || error)}. Ladda om sidan.</p>;
  return children;
}
