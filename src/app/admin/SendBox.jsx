// Skicka en länk till kunden: kopiera, mejl eller SMS. Automatiska mejl kommer när Resend är kopplat.
import { useState } from 'preact/hooks';
import { copyText } from '../ui.jsx';

export default function SendBox({ title, intro, url, text, subject, email, phone, onClose }) {
  const [copied, setCopied] = useState('');
  const tel = (phone ?? '').replace(/[^\d+]/g, '');
  return (
    <div class="cp-modal-body">
      <h3>{title}</h3>
      {intro && <p>{intro}</p>}
      <div class="cp-link-box">{url}</div>
      <div class="cp-actions">
        <button class="btn btn--sm" type="button" onClick={async () => setCopied((await copyText(url)) ? 'link' : '')}>{copied === 'link' ? 'The link is copied' : 'Copy the link'}</button>
        <button class="btn btn--ghost btn--sm" type="button" onClick={async () => setCopied((await copyText(text)) ? 'text' : '')}>{copied === 'text' ? 'The text is copied' : 'Copy the whole text'}</button>
        {email && <a class="btn btn--ghost btn--sm" href={`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`}>Send as email</a>}
        {tel && <a class="btn btn--ghost btn--sm" href={`sms:${tel}?body=${encodeURIComponent(text)}`}>Send as SMS</a>}
        <a class="btn btn--ghost btn--sm" href={url} target="_blank" rel="noopener">Open</a>
      </div>
      <details>
        <summary>Show the text (in Swedish, for the customer)</summary>
        <p style="white-space:pre-wrap">{text}</p>
      </details>
      <button class="btn btn--ghost" type="button" onClick={onClose}>Done</button>
    </div>
  );
}
