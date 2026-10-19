// Ramen för administrationen: kontrollerar inloggning och behörighet, visar menyn och sidan.
import { useEffect, useState, useErrorBoundary } from 'preact/hooks';
import { supabase, loadMe, isAdminRole, go } from '../lib/supabase.js';
import Overview from './admin/Overview.jsx';
import Inbox from './admin/Inbox.jsx';
import Customers from './admin/Customers.jsx';
import Staff from './admin/Staff.jsx';

const PAGES = {
  oversikt: { href: '/admin', label: 'Översikt', Page: Overview },
  inkorg: { href: '/admin/inkorg', label: 'Inkorg', Page: Inbox },
  kunder: { href: '/admin/kunder', label: 'Kunder', Page: Customers },
  personal: { href: '/admin/personal', label: 'Personal', Page: Staff },
};

export default function AdminApp({ page }) {
  const [me, setMe] = useState(null);
  const [newCount, setNewCount] = useState(0);

  async function refreshCount() {
    const { count } = await supabase().from('submissions').select('id', { count: 'exact', head: true }).eq('status', 'ny');
    setNewCount(count ?? 0);
  }

  useEffect(() => {
    (async () => {
      const current = await loadMe();
      const back = `/logga-in?next=${encodeURIComponent(window.location.pathname)}`;
      if (!current || !current.profile?.active) return go(back);
      if (!isAdminRole(current.profile.role)) return go('/app');
      setMe(current);
      refreshCount();
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
          </a>
        ))}
        <span class="cp-me">{me.profile.full_name}</span>
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
