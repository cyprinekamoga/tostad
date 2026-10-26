// Pushnotiser i personalappen: slå på, stäng av och testa på den här telefonen.
import { callFunction } from '../../lib/supabase.js';

const SW = '/push-sw.js';
const SCOPE = '/app';

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
/** På iPhone fungerar notiser bara när appen är tillagd på hemskärmen och öppnad därifrån. */
export const needsHomeScreen = () => ios() && !standalone();

function keyBytes(base64url) {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration(SCOPE)) ?? navigator.serviceWorker.register(SW, { scope: SCOPE });
}

/** 'on' | 'off' | 'blocked' | 'unsupported' | 'homescreen' */
export async function pushState() {
  if (needsHomeScreen()) return 'homescreen';
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const reg = await navigator.serviceWorker.getRegistration(SCOPE);
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

export async function turnOn() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'Notifications are blocked. Allow them for tostadflytt.se in the phone settings.' : 'You need to allow notifications.');
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const { key } = await callFunction('push', { action: 'key' });
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  const device = `${ios() ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : 'Computer'} · ${new Date().toLocaleDateString('en-GB')}`;
  await callFunction('push', { action: 'subscribe', subscription: sub.toJSON(), device });
}

export async function turnOff() {
  const reg = await navigator.serviceWorker.getRegistration(SCOPE);
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return;
  await callFunction('push', { action: 'unsubscribe', endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

export const sendTest = () => callFunction('push', { action: 'test' });
