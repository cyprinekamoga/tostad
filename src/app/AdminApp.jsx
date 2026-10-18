// Ramen för administrationen: kontrollerar inloggning och behörighet, visar menyn och sidan.
import { useEffect, useState } from 'preact/hooks';
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
      if (current.aal !== 'aal2') return go(back);
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
    <div class="ad-shell">
      <nav class="ad-nav" aria-label="Administration">
        {Object.entries(PAGES).map(([key, p]) => (
          <a href={p.href} aria-current={key === page ? 'page' : undefined}>
            {p.label}
            {key === 'inkorg' && newCount > 0 && <span class="count">{newCount}</span>}
          </a>
        ))}
        <span class="ad-me">{me.profile.full_name}</span>
        <button type="button" onClick={signOut}>Logga ut</button>
      </nav>
      <section>
        <Page me={me} onInboxChange={refreshCount} />
      </section>
    </div>
  );
}
