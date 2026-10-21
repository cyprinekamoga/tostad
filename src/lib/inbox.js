// Skickar webbplatsens formulär till inkorgen i administrationen. Därefter skickas formuläret
// som vanligt till Netlify Forms, som reserv och för /tack-sidan. Går inkorgen inte att nå
// fortsätter formuläret ändå, så att inget ärende försvinner.
import { FUNCTIONS_URL, SUPABASE_KEY } from '../config/supabase.js';

const RESIZABLE = /^image\/(jpeg|png|webp)$/;
const MAX_SIDE = 1600;

// Mobilbilder är ofta flera megabyte. De skalas ner till högst 1600 pixlar innan de skickas.
export async function shrink(file) {
  if (!RESIZABLE.test(file.type) || file.size < 400_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    return blob ? new File([blob], `${file.name.replace(/\.\w+$/, '')}.jpg`, { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

async function sendToInbox(form) {
  const data = new FormData(form);
  for (const [key, value] of [...data.entries()]) {
    if (value instanceof File && value.size > 0) data.set(key, await shrink(value));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${FUNCTIONS_URL}/submit-form`, { method: 'POST', body: data, headers: { apikey: SUPABASE_KEY }, signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function connectForm(form) {
  form.addEventListener('submit', async (event) => {
    if (form.dataset.inboxSent) return;
    event.preventDefault();
    const button = event.submitter ?? form.querySelector('[type="submit"]');
    button?.setAttribute('disabled', '');
    await sendToInbox(form);
    form.dataset.inboxSent = '1';
    form.submit();
  });
}
