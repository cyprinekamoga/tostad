// Aktiveringslänken från en administratör: bekräftar länken och låter personen välja lösenord.
// Samma sida används när någon behöver ett nytt lösenord (typ=recovery).
import { useEffect, useState } from 'preact/hooks';
import { supabase, go } from '../lib/supabase.js';

const MIN_LENGTH = 10;

export default function Activate() {
  const sb = supabase();
  const [step, setStep] = useState('verifying');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [code, setCode] = useState('');
  const [factorId, setFactorId] = useState('');
  const [isNew, setIsNew] = useState(true);

  // Har kontot redan tvåstegsverifiering måste koden anges innan lösenordet kan bytas.
  async function afterSession() {
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      const { data } = await sb.auth.mfa.listFactors();
      const verified = data?.totp?.find((f) => f.status === 'verified');
      if (verified) {
        setFactorId(verified.id);
        return setStep('mfa');
      }
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

  async function verifyCode(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: verifyError } = await sb.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') });
    setBusy(false);
    if (verifyError) return setError('Fel kod. Försök igen.');
    setStep('password');
  }

  async function savePassword(e) {
    e.preventDefault();
    setError('');
    if (pw1.length < MIN_LENGTH) return setError(`Lösenordet behöver minst ${MIN_LENGTH} tecken.`);
    if (pw1 !== pw2) return setError('Lösenorden är inte lika.');
    setBusy(true);
    const { error: updateError } = await sb.auth.updateUser({ password: pw1 });
    setBusy(false);
    if (updateError) {
      if (/weak|pwned|leaked/i.test(updateError.message)) return setError('Lösenordet är för svagt eller har läckt i andra sammanhang. Välj ett annat.');
      if (/same|different/i.test(updateError.message)) return setError('Välj ett annat lösenord än det gamla.');
      return setError('Kunde inte spara lösenordet. Försök igen.');
    }
    // Inloggningssidan tar det sista steget: personal till appen, administratörer till tvåstegsverifiering.
    go('/logga-in');
  }

  if (step === 'verifying') return <div class="auth-card" aria-busy="true"><p>Kontrollerar länken …</p></div>;

  if (step === 'error')
    return (
      <div class="auth-card">
        <h2>Länken fungerar inte</h2>
        <p>Länken har redan använts eller gått ut. Den gäller i en timme. Be en administratör om en ny länk.</p>
        <a class="btn btn--ghost btn--block" href="/logga-in">Till inloggningen</a>
      </div>
    );

  return (
    <div class="auth-card">
      {error && <p class="msg msg--error" role="alert">{error}</p>}
      {step === 'mfa' && (
        <form class="form-grid" onSubmit={verifyCode}>
          <h2>Bekräfta med kod</h2>
          <p>Skriv in koden från din autentiseringsapp för att kunna byta lösenord.</p>
          <div class="field">
            <label for="ac-code">Kod</label>
            <input id="ac-code" class="code-input" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength={7} required value={code} onInput={(e) => setCode(e.currentTarget.value)} />
          </div>
          <button class="btn btn--block" type="submit" disabled={busy}>Fortsätt</button>
        </form>
      )}
      {step === 'password' && (
        <form class="form-grid" onSubmit={savePassword}>
          <h2>{isNew ? 'Välkommen! Välj ett lösenord' : 'Välj ett nytt lösenord'}</h2>
          <p>Minst {MIN_LENGTH} tecken. En mening med några ord är lätt att komma ihåg och svår att gissa.</p>
          <div class="field">
            <label for="ac-pw1">Lösenord</label>
            <input id="ac-pw1" type="password" autocomplete="new-password" required minLength={MIN_LENGTH} value={pw1} onInput={(e) => setPw1(e.currentTarget.value)} />
          </div>
          <div class="field">
            <label for="ac-pw2">Upprepa lösenordet</label>
            <input id="ac-pw2" type="password" autocomplete="new-password" required minLength={MIN_LENGTH} value={pw2} onInput={(e) => setPw2(e.currentTarget.value)} />
          </div>
          <button class="btn btn--block" type="submit" disabled={busy}>{busy ? 'Sparar …' : 'Spara och fortsätt'}</button>
        </form>
      )}
    </div>
  );
}
