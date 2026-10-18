// Inloggning för alla. Personal går vidare till /app. Administratörer måste dessutom
// använda en kod från en autentiseringsapp (tvåstegsverifiering) innan de kommer in.
import { useEffect, useState } from 'preact/hooks';
import { supabase, loadMe, isAdminRole, safeNext, go } from '../lib/supabase.js';

export default function Login() {
  const sb = supabase();
  const [step, setStep] = useState('loading');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [factorId, setFactorId] = useState('');
  const [enroll, setEnroll] = useState(null);
  const next = safeNext(new URLSearchParams(window.location.search).get('next'));

  // Avgör nästa steg utifrån vem som är inloggad och hur.
  async function proceed() {
    const me = await loadMe();
    if (!me) return setStep('password');
    if (!me.profile || !me.profile.active) {
      await sb.auth.signOut();
      setError('Kontot är inte aktivt. Kontakta en administratör.');
      return setStep('password');
    }
    if (!isAdminRole(me.profile.role)) return go(next?.startsWith('/app') ? next : '/app');
    if (me.aal === 'aal2') return go(next || '/admin');

    const { data } = await sb.auth.mfa.listFactors();
    const verified = data?.totp?.find((f) => f.status === 'verified');
    if (verified) {
      setFactorId(verified.id);
      return setStep('mfa');
    }
    // Påbörjade men ej slutförda registreringar tas bort innan vi börjar om.
    for (const f of data?.all ?? []) if (f.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: f.id });
    const { data: created, error: enrollError } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'TO Städ & Flytt' });
    if (enrollError) {
      setError('Kunde inte starta tvåstegsverifieringen. Ladda om sidan och försök igen.');
      return setStep('password');
    }
    setFactorId(created.id);
    setEnroll({ qr: created.totp.qr_code, secret: created.totp.secret });
    setStep('enroll');
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
      setError(/confirm/i.test(signInError.message) ? 'Kontot är inte aktiverat ännu. Använd länken du fick.' : 'Fel e-post eller lösenord.');
      return;
    }
    await proceed();
    setBusy(false);
  }

  async function verify(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: verifyError } = await sb.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') });
    if (verifyError) {
      setBusy(false);
      setError('Fel kod. Kontrollera att klockan i telefonen stämmer och försök igen.');
      return;
    }
    go(next || '/admin');
  }

  async function signOut() {
    await sb.auth.signOut();
    setStep('password');
    setCode('');
  }

  if (step === 'loading') return <div class="auth-card" aria-busy="true"><p>Laddar …</p></div>;

  return (
    <div class="auth-card">
      {error && <p class="msg msg--error" role="alert">{error}</p>}

      {step === 'password' && (
        <form class="form-grid" onSubmit={signIn}>
          <h2>Logga in</h2>
          <div class="field">
            <label for="li-email">E-post</label>
            <input id="li-email" type="email" autocomplete="username" required value={email} onInput={(e) => setEmail(e.currentTarget.value)} />
          </div>
          <div class="field">
            <label for="li-pw">Lösenord</label>
            <input id="li-pw" type="password" autocomplete="current-password" required value={password} onInput={(e) => setPassword(e.currentTarget.value)} />
          </div>
          <button class="btn btn--block" type="submit" disabled={busy}>{busy ? 'Loggar in …' : 'Logga in'}</button>
          <p class="muted">Glömt lösenordet? Be en administratör om en ny inloggningslänk.</p>
        </form>
      )}

      {step === 'mfa' && (
        <form class="form-grid" onSubmit={verify}>
          <h2>Tvåstegsverifiering</h2>
          <p>Öppna din autentiseringsapp och skriv in den sexsiffriga koden för TO Städ &amp; Flytt.</p>
          <div class="field">
            <label for="li-code">Kod</label>
            <input id="li-code" class="code-input" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength={7} required value={code} onInput={(e) => setCode(e.currentTarget.value)} />
          </div>
          <button class="btn btn--block" type="submit" disabled={busy}>{busy ? 'Kontrollerar …' : 'Fortsätt'}</button>
          <button class="btn btn--ghost btn--block" type="button" onClick={signOut}>Logga ut</button>
        </form>
      )}

      {step === 'enroll' && enroll && (
        <form class="form-grid" onSubmit={verify}>
          <h2>Slå på tvåstegsverifiering</h2>
          <p>Administratörer skyddas med en kod från telefonen. Det gör du en gång.</p>
          <ol class="auth-steps">
            <li>Installera en autentiseringsapp, till exempel Google Authenticator, Microsoft Authenticator eller 1Password.</li>
            <li>Skanna QR-koden med appen.</li>
            <li>Skriv in den sexsiffriga koden som visas.</li>
          </ol>
          <div class="qr">
            <img src={enroll.qr} alt="QR-kod för autentiseringsappen" width="200" height="200" />
          </div>
          <details>
            <summary>Kan du inte skanna? Skriv in nyckeln</summary>
            <p class="secret">{enroll.secret}</p>
            <p class="muted">Spara gärna nyckeln i en lösenordshanterare. Den behövs om du byter telefon.</p>
          </details>
          <div class="field">
            <label for="li-code2">Kod från appen</label>
            <input id="li-code2" class="code-input" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength={7} required value={code} onInput={(e) => setCode(e.currentTarget.value)} />
          </div>
          <button class="btn btn--block" type="submit" disabled={busy}>{busy ? 'Kontrollerar …' : 'Aktivera och fortsätt'}</button>
          <button class="btn btn--ghost btn--block" type="button" onClick={signOut}>Logga ut</button>
        </form>
      )}
    </div>
  );
}
