// Små gemensamma byggstenar för administrationen.
import { useEffect, useRef } from 'preact/hooks';

/** Dialogruta ovanpå sidan. Stängs med Esc, klick utanför eller onClose. */
export function Modal({ open, onClose, children, label }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      class="cp-modal"
      aria-label={label}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && children}
    </dialog>
  );
}

export function ErrorMsg({ error }) {
  return error ? <p class="msg msg--error" role="alert">{error}</p> : null;
}

/** Telefonnummer som klickbar länk (bara siffror och + i länken). */
export function Phone({ value }) {
  if (!value) return null;
  return <a href={`tel:${value.replace(/[^\d+]/g, '')}`}>{value}</a>;
}

export function Email({ value }) {
  if (!value || !/^[^\s@]+@[^\s@]+$/.test(value)) return value ? <span>{value}</span> : null;
  return <a href={`mailto:${value}`}>{value}</a>;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
