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
import CustomerHours from './admin/CustomerHours.jsx';
import Sms from './admin/Sms.jsx';
import Quotes from './admin/Quotes.jsx';
import Invoices from './admin/Invoices.jsx';
import Money from './admin/Money.jsx';
import Settings from './admin/Settings.jsx';
import Careers from './admin/Careers.jsx';
import Rut from './admin/Rut.jsx';
import Assistant from './admin/Assistant.jsx';
import logo from '../assets/brand/logo.png';

const PAGES = {
  oversikt: { href: '/admin', label: 'Overview', Page: Overview },
  assistent: { href: '/admin/assistent', label: 'Job assistant', Page: Assistant },
  planering: { href: '/admin/planering', label: 'Planner', Page: Planner },
  karta: { href: '/admin/karta', label: 'Map', Page: MapPage },
  inkorg: { href: '/admin/inkorg', label: 'Inbox', Page: Inbox },
  kunder: { href: '/admin/kunder', label: 'Customers', Page: Customers },
  offerter: { href: '/admin/offerter', label: 'Quotes', Page: Quotes },
  fakturor: { href: '/admin/fakturor', label: 'Invoices', Page: Invoices },
  rut: { href: '/admin/rut', label: 'RUT', Page: Rut },
  ekonomi: { href: '/admin/ekonomi', label: 'Finances', Page: Money },
  ledighet: { href: '/admin/ledighet', label: 'Time off', Page: Absences },
  tider: { href: '/admin/tider', label: 'Hours', Page: TimeReport },
  kundtimmar: { href: '/admin/kundtimmar', label: 'Customer hours', Page: CustomerHours },
  rekrytering: { href: '/admin/rekrytering', label: 'Recruitment', Page: Careers },
  personal: { href: '/admin/personal', label: 'Staff', Page: Staff },
  sms: { href: '/admin/sms', label: 'SMS', Page: Sms },
  installningar: { href: '/admin/installningar', label: 'Settings', Page: Settings },
};

// Menyn i grupper, så att den går att överblicka.
const GROUPS = [
  ['', ['oversikt', 'assistent']],
  ['Planning', ['planering', 'karta', 'ledighet', 'tider', 'kundtimmar']],
  ['Customers and finances', ['inkorg', 'kunder', 'offerter', 'fakturor', 'rut', 'ekonomi']],
  ['Company', ['personal', 'rekrytering', 'sms', 'installningar']],
];
const MENU_KEY = 'tostad-meny';
const readMenuHidden = () => {
  try {
    return localStorage.getItem(MENU_KEY) === 'dold';
  } catch {
    return false;
  }
};

export default function AdminApp({ page }) {
  const [me, setMe] = useState(null);
  const [menuHidden, setMenuHidden] = useState(readMenuHidden);
  const [drawer, setDrawer] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [appCount, setAppCount] = useState(0);
  const [rutCount, setRutCount] = useState(0);
  const [draftCount, setDraftCount] = useState(0);

  // Siffror i menyn: nya ärenden i inkorgen och ledighet eller passbyten som väntar på beslut.
  async function refreshCount() {
    const sb = supabase();
    const head = { count: 'exact', head: true };
    const [inbox, leave, swaps, apps, rut, drafts] = await Promise.all([
      sb.from('submissions').select('id', head).eq('status', 'ny'),
      sb.from('absences').select('id', head).eq('status', 'begard'),
      sb.from('swap_requests').select('id', head).eq('status', 'vantar'),
      sb.from('applications').select('id', head).eq('status', 'ny'),
      // Betalda fakturor med RUT som inte är ansökta än.
      sb.from('invoices').select('id', head).eq('kind', 'faktura').eq('status', 'betald').eq('rut_status', 'ej_ansokt').gt('rut', 0),
      sb.from('assistant_drafts').select('id', head).eq('status', 'ny'),
    ]);
    setDraftCount(drafts.count ?? 0);
    setRutCount(rut.count ?? 0);
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

  if (!me) return <p class="muted adm-loading" aria-busy="true">Loading …</p>;
  const current = PAGES[page] ?? PAGES.oversikt;
  const { Page } = current;
  const badge = { inkorg: newCount, ledighet: pendingCount, rekrytering: appCount, rut: rutCount, assistent: draftCount };

  function toggleMenu() {
    // På mobilen glider menyn in över sidan. På datorn kan den döljas och valet sparas.
    if (window.matchMedia('(max-width: 959px)').matches) return setDrawer(!drawer);
    const next = !menuHidden;
    setMenuHidden(next);
    try {
      localStorage.setItem(MENU_KEY, next ? 'dold' : 'visas');
    } catch {
      /* ignoreras */
    }
  }

  return (
    <div class={`adm${menuHidden ? ' is-menu-hidden' : ''}${drawer ? ' is-drawer-open' : ''}`}>
      <header class="adm-top">
        <button class="adm-burger" type="button" aria-label={menuHidden ? 'Show menu' : 'Hide menu'} aria-expanded={!menuHidden || drawer} onClick={toggleMenu}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>
        <a class="adm-brand" href="/admin" aria-label="Overview">
          <img src={logo.src} alt="" width="32" height="32" />
          <span>TO Städ &amp; Flytt</span>
        </a>
        <h1 class="adm-title">{current.label}</h1>
        <div class="adm-user">
          <span class="adm-name">{me.profile.full_name}</span>
          <a href="/app">My jobs</a>
          <button type="button" onClick={signOut}>Log out</button>
        </div>
      </header>
      <div class="adm-body">
        <nav class="adm-nav" aria-label="Administration">
          {GROUPS.map(([title, keys]) => (
            <div class="adm-group">
              {title && <p class="adm-group-title">{title}</p>}
              {keys.map((key) => (
                <a href={PAGES[key].href} aria-current={key === page ? 'page' : undefined}>
                  <span>{PAGES[key].label}</span>
                  {badge[key] > 0 && <span class="count">{badge[key]}</span>}
                </a>
              ))}
            </div>
          ))}
          <div class="adm-group adm-nav-me">
            <p class="adm-group-title">{me.profile.full_name}</p>
            <a href="/app">My jobs</a>
            <button type="button" onClick={signOut}>Log out</button>
          </div>
        </nav>
        <button class="adm-scrim" type="button" aria-label="Close menu" tabIndex={-1} onClick={() => setDrawer(false)} />
        <section class="adm-page">
          <PageBoundary>
            <Page me={me} onInboxChange={refreshCount} />
          </PageBoundary>
        </section>
      </div>
    </div>
  );
}

// Visar felet på skärmen i stället för en tom sida om en sida kraschar.
function PageBoundary({ children }) {
  const [error] = useErrorBoundary((e) => console.error(e));
  if (error) return <p class="msg msg--error" role="alert">This page could not be shown: {String(error.message || error)}. Reload the page.</p>;
  return children;
}
