// Inloggning för alla med e-post och lösenord. Personal går vidare till /app och administratörer till /admin.
import { useEffect, useState } from 'preact/hooks';
import { supabase, loadMe, isAdminRole, safeNext, go, callFunction } from '../lib/supabase.js';

export default function Login() {
  const sb = supabase();
  const [step, setStep] = useState('loading');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const next = safeNext(new URLSearchParams(window.location.search).get('next'));

  // Avgör vart den inloggade ska.
  async function proceed() {
    const me = await loadMe();
    if (!me) return setStep('password');
    if (!me.profile || !me.profile.active) {
      await sb.auth.signOut();
      setError('This account is not active. Contact an admin.');
      return setStep('password');
    }
    // Tvåstegsverifiering används inte. Koder som registrerades tidigare tas bort.
    if (me.nextAal === 'aal2') await callFunction('staff-admin', { action: 'remove_mfa' }).catch(() => {});
    if (!isAdminRole(me.profile.role)) return go(next?.startsWith('/app') ? next : '/app');
    go(next || '/admin');
  }

  useEffect(() => {
    proceed();
  }, []);

  async function signIn(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: signInError } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) {
      setBusy(false);
      setError(/confirm/i.test(signInError.message) ? 'This account is not activated yet. Use the link you got.' : 'Wrong email or password.');
      return;
    }
    await proceed();
    setBusy(false);
  }

  if (step === 'loading') return <div class="auth-card" aria-busy="true"><p>Loading …</p></div>;

  return (
    <div class="auth-card">
      {error && <p class="msg msg--error" role="alert">{error}</p>}
      <form class="form-grid" onSubmit={signIn}>
        <h2>Log in</h2>
        <div class="field">
          <label for="li-email">Email</label>
          <input id="li-email" type="email" autocomplete="username" required value={email} onInput={(e) => setEmail(e.currentTarget.value)} />
        </div>
        <div class="field">
          <label for="li-pw">Password</label>
          <input id="li-pw" type="password" autocomplete="current-password" required value={password} onInput={(e) => setPassword(e.currentTarget.value)} />
        </div>
        <button class="btn btn--block" type="submit" disabled={busy}>{busy ? 'Logging in …' : 'Log in'}</button>
        <p class="muted">Forgot your password? Ask an admin for a new login link.</p>
      </form>
    </div>
  );
}
