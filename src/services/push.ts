import type { ReminderSettings } from '../engine/types';

/** Reminders use Web Push: the phone gives its push address to our server, and a
 * scheduler tells the server to send a notification at your chosen time, even when
 * the app is closed. This is the ONLY network traffic the app makes, and only after
 * you turn reminders on. Nothing about your workouts is ever sent, just the push
 * address, the time, the weekdays and the time zone. */

export type Failure = 'unsupported' | 'denied' | 'not-configured' | 'failed';
export type PushResult = { ok: true } | { ok: false; reason: Failure };

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function permissionState(): NotificationPermission | 'unsupported' {
  return isPushSupported() ? Notification.permission : 'unsupported';
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = window.atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** The service worker only exists in the built app, so never wait for it forever. */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 4000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

async function vapidKey(): Promise<{ key: string } | { error: Failure }> {
  try {
    const res = await fetch('/api/push/vapid-public-key');
    if (res.status === 503 || res.status === 404) return { error: 'not-configured' };
    if (!res.ok) return { error: 'failed' };
    const data = (await res.json()) as { publicKey?: unknown };
    return typeof data.publicKey === 'string' && data.publicKey ? { key: data.publicKey } : { error: 'not-configured' };
  } catch {
    return { error: 'failed' };
  }
}

async function post(path: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    return null;
  }
}

/** Ask permission (must be called from a tap), subscribe, and register the schedule. */
export async function enableReminders(r: Pick<ReminderSettings, 'time' | 'days'>): Promise<PushResult> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'denied' };
  // Trust the answer we just got: some browsers report the new permission a moment later.
  return register(r);
}

/** Send the current schedule to the server. No permission prompt; safe to call again. */
export async function syncReminders(r: Pick<ReminderSettings, 'time' | 'days'>): Promise<PushResult> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };
  if (Notification.permission !== 'granted') return { ok: false, reason: 'denied' };
  return register(r);
}

async function register(r: Pick<ReminderSettings, 'time' | 'days'>): Promise<PushResult> {
  const key = await vapidKey();
  if ('error' in key) return { ok: false, reason: key.error };
  try {
    const reg = await registration();
    if (!reg) return { ok: false, reason: 'failed' };
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key.key) }));
    const res = await post('/api/push/subscribe', {
      subscription: sub.toJSON(),
      reminder: { time: r.time, days: r.days },
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (!res) return { ok: false, reason: 'failed' };
    if (res.status === 503) return { ok: false, reason: 'not-configured' };
    return res.ok ? { ok: true } : { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/** Remove this phone from the server and drop the push subscription. */
export async function disableReminders(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await post('/api/push/unsubscribe', { endpoint: sub.endpoint });
    await sub.unsubscribe();
  } catch {
    /* nothing more to clean up */
  }
}

/** Is this phone really subscribed right now? (Settings can say "on" while the browser says otherwise.) */
export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== 'granted') return false;
  try {
    const reg = await registration();
    return (await reg?.pushManager.getSubscription()) != null;
  } catch {
    return false;
  }
}

/** Show a notification right now, on this phone, to prove notifications are allowed and visible. */
export async function showTestNotification(): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== 'granted') return false;
  try {
    const reg = await registration();
    if (!reg) return false;
    await reg.showNotification('Time to train', {
      body: 'This is a test. Your reminders will look like this.',
      icon: '/icons/icon192.png',
      badge: '/icons/icon192.png',
      tag: 'intervo-test',
    });
    return true;
  } catch {
    return false;
  }
}
