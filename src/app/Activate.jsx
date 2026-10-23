// Aktiveringslänken från en administratör: bekräftar länken och låter personen välja lösenord.
// Samma sida används när någon behöver ett nytt lösenord (typ=recovery).
import { useEffect, useState } from 'preact/hooks';
import { supabase, go, callFunction } from '../lib/supabase.js';

const MIN_LENGTH = 10;

export default function Activate() {
  const sb = supabase();
  const [step, setStep] = useState('verifying');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [isNew, setIsNew] = useState(true);

  // Tvåstegsverifiering används inte. Koder som registrerades tidigare tas bort innan lösenordet byts.
  async function afterSession() {
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === 'aal2') {
      await callFunction('staff-admin', { action: 'remove_mfa' }).catch(() => {});
      await sb.auth.refreshSession();
    }
    setStep('password');
  }

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get('th');
      const type = params.get('typ') === 'recovery' ? 'recovery' : 'invite';
      setIsNew(type === 'invite');
      // Ta bort nyckeln ur adressfältet så att den inte sparas i historiken.
      if (tokenHash) window.history.replaceState(null, '', window.location.pathname);
      if (tokenHash) {
        const { error: otpError } = await sb.auth.verifyOtp({ token_hash: tokenHash, type });
        if (!otpError) return afterSession();
      }
      const { data } = await sb.auth.getSession();
      if (data.session) return afterSession();
      setStep('error');
    })();
  }, []);

  async function savePassword(e) {
    e.preventDefault();
    setError('');
    if (pw1.length < MIN_LENGTH) return setError(`The password needs at least ${MIN_LENGTH} characters.`);
    if (pw1 !== pw2) return setError('The passwords do not match.');
    setBusy(true);
    const { error: updateError } = await sb.auth.updateUser({ password: pw1 });
    setBusy(false);
    if (updateError) {
      if (/weak|pwned|leaked/i.test(updateError.message)) return setError('This password is too weak or has leaked elsewhere. Choose another one.');
      if (/same|different/i.test(updateError.message)) return setError('Choose a different password from the old one.');
      return setError('Could not save the password. Try again.');
    }
    // Inloggningssidan skickar personal till appen och administratörer till administrationen.
    go('/logga-in');
  }

  if (step === 'verifying') return <div class="auth-card" aria-busy="true"><p>Checking the link …</p></div>;

  if (step === 'error')
    return (
      <div class="auth-card">
        <h2>This link does not work</h2>
        <p>The link has already been used or has expired. It is valid for one hour. Ask an admin for a new link.</p>
        <a class="btn btn--ghost btn--block" href="/logga-in">Go to login</a>
      </div>
    );

  return (
    <div class="auth-card">
      {error && <p class="msg msg--error" role="alert">{error}</p>}
      {step === 'password' && (
        <form class="form-grid" onSubmit={savePassword}>
          <h2>{isNew ? 'Welcome! Choose a password' : 'Choose a new password'}</h2>
          <p>At least {MIN_LENGTH} characters. A sentence with a few words is easy to remember and hard to guess.</p>
          <div class="field">
            <label for="ac-pw1">Password</label>
            <input id="ac-pw1" type="password" autocomplete="new-password" required minLength={MIN_LENGTH} value={pw1} onInput={(e) => setPw1(e.currentTarget.value)} />
          </div>
          <div class="field">
            <label for="ac-pw2">Repeat the password</label>
            <input id="ac-pw2" type="password" autocomplete="new-password" required minLength={MIN_LENGTH} value={pw2} onInput={(e) => setPw2(e.currentTarget.value)} />
          </div>
          <button class="btn btn--block" type="submit" disabled={busy}>{busy ? 'Saving …' : 'Save and continue'}</button>
        </form>
      )}
    </div>
  );
}
