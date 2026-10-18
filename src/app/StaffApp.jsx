// Personalens startsida. Schema, jobb och tider kommer i nästa fas.
import { useEffect, useState } from 'preact/hooks';
import { supabase, loadMe, isAdminRole, go } from '../lib/supabase.js';

export default function StaffApp() {
  const [me, setMe] = useState(null);

  useEffect(() => {
    (async () => {
      const current = await loadMe();
      if (!current || !current.profile?.active) return go('/logga-in?next=/app');
      setMe(current);
    })();
  }, []);

  async function signOut() {
    await supabase().auth.signOut();
    go('/logga-in');
  }

  if (!me) return <p class="muted" aria-busy="true">Laddar …</p>;
  return (
    <div class="auth-card">
      <h2>Hej {me.profile.full_name.split(' ')[0]}!</h2>
      <p>Du är inloggad som {me.profile.email}.</p>
      <p>Här samlas snart dina jobb, ditt schema och dina arbetstider. Vi säger till när det är klart.</p>
      {isAdminRole(me.profile.role) && (
        <a class="btn btn--block" href="/admin">Till administrationen</a>
      )}
      <button class="btn btn--ghost btn--block" type="button" onClick={signOut}>Logga ut</button>
    </div>
  );
}
