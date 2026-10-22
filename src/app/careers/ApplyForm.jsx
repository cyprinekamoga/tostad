// Ansökningsformulär: kontaktuppgifter, personligt brev och CV (PDF eller Word).
import { useState } from 'preact/hooks';
import { sendApplication } from './api.js';

const MAX = 10 * 1024 * 1024;

export default function ApplyForm({ vacancies = [], selected = '' }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const file = form.cv.files[0];
    if (file && file.size > MAX) return setError('CV-filen är för stor. Högst 10 MB.');
    setBusy(true);
    setError('');
    try {
      await sendApplication(form);
      setDone(true);
      form.reset();
      form.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  if (done)
    return (
      <div class="apply-done" role="status">
        <h3>Tack för din ansökan!</h3>
        <p>Vi har tagit emot den och hör av oss så snart vi har läst den, oftast inom en vecka. Har du frågor under tiden kan du ringa oss på 072 222 88 00.</p>
      </div>
    );

  return (
    <form class="form-grid apply-form" onSubmit={submit} noValidate={false}>
      <p class="visually-hidden" aria-hidden="true">
        <label>Lämna tomt <input name="bot-field" tabIndex={-1} autocomplete="off" /></label>
      </p>
      <div class="field">
        <label for="ap-ad">Jobbet du söker</label>
        <select id="ap-ad" name="annons" defaultValue={selected}>
          {vacancies.map((v) => <option value={v.slug}>{v.title}</option>)}
          <option value="">Spontanansökan</option>
        </select>
      </div>
      <div class="form-grid form-grid--2">
        <div class="field">
          <label for="ap-name">Namn</label>
          <input id="ap-name" name="namn" type="text" autocomplete="name" required maxLength={200} />
        </div>
        <div class="field">
          <label for="ap-phone">Telefon</label>
          <input id="ap-phone" name="telefon" type="tel" autocomplete="tel" maxLength={40} />
        </div>
      </div>
      <div class="field">
        <label for="ap-email">Mejl</label>
        <input id="ap-email" name="epost" type="email" autocomplete="email" required maxLength={254} />
      </div>
      <div class="form-grid form-grid--2">
        <fieldset class="field apply-radios">
          <legend>Har du B-körkort?</legend>
          <label><input type="radio" name="korkort" value="ja" /> Ja</label>
          <label><input type="radio" name="korkort" value="nej" /> Nej</label>
        </fieldset>
        <div class="field">
          <label for="ap-start">När kan du börja?</label>
          <input id="ap-start" name="start" type="text" maxLength={100} placeholder="Till exempel direkt eller 1 december" />
        </div>
      </div>
      <div class="field">
        <label for="ap-exp">Erfarenhet av städ eller flytt (valfritt)</label>
        <textarea id="ap-exp" name="erfarenhet" rows={3} maxLength={2000} />
      </div>
      <div class="field">
        <label for="ap-letter">Personligt brev</label>
        <textarea id="ap-letter" name="brev" rows={7} required minLength={30} maxLength={6000} placeholder="Berätta om dig själv, varför du vill jobba hos oss och vilka dagar och tider du kan jobba." />
      </div>
      <div class="field">
        <label for="ap-cv">CV (PDF eller Word, högst 10 MB)</label>
        <input id="ap-cv" name="cv" type="file" accept=".pdf,.doc,.docx,.odt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
      </div>
      <label class="toggle consent">
        <input type="checkbox" name="samtycke" value="ja" required />
        <span>
          Jag godkänner att TO Städ &amp; Flytt sparar min ansökan för rekryteringen. Får jag inget jobb raderas ansökan efter två år. Läs mer i{' '}
          <a href="/integritetspolicy">integritetspolicyn</a>.
        </span>
      </label>
      {error && <p class="apply-error" role="alert">{error}</p>}
      <button class="btn" type="submit" disabled={busy}>{busy ? 'Skickar …' : 'Skicka ansökan'}</button>
    </form>
  );
}
