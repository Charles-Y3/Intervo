import { timingSafeEqual } from 'node:crypto';

/** Pure logic for the reminder service: validating what the browser sends, working
 * out who is due, and sending. Everything the outside world touches (storage,
 * the push sender, the clock) is passed in, so all of it is unit tested.
 *
 * Zero trust: the subscribe request comes from the open internet. The server will
 * later POST to the endpoint it is given, so an unchecked endpoint would let anyone
 * aim this server at any URL (SSRF). Endpoints must be https on a known push service. */

export const MAX_SUBSCRIPTIONS = 500;
/** How late after its minute a reminder may still fire. Must be longer than the
 * scheduler's interval (5 minutes) or a reminder could fall between two runs. */
export const SEND_WINDOW_MINUTES = 10;
const MAX_BODY_CHARS = 4000;
const MAX_ENDPOINT_CHARS = 1000;

export interface Reminder {
  /** "HH:MM" in the subscriber's own time zone. */
  time: string;
  /** 0 = Sunday ... 6 = Saturday. */
  days: number[];
}

export interface PushRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  reminder: Reminder;
  /** IANA time zone, for example "America/Toronto". */
  tz: string;
  /** Local calendar day (YYYY-MM-DD) this reminder last fired, to never send twice a day. */
  lastSentDate?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Store {
  get(endpoint: string): Promise<PushRecord | null>;
  upsert(rec: PushRecord): Promise<void>;
  remove(endpoint: string): Promise<void>;
  list(): Promise<PushRecord[]>;
  count(): Promise<number>;
  markSent(endpoint: string, date: string): Promise<void>;
}

/** Sends one push message. Throws; a thrown `statusCode` of 404 or 410 means the subscription is gone. */
export type Sender = (rec: PushRecord, payload: string) => Promise<void>;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

// ---- who may we send to? ----

/** Push services browsers use. Anything else is refused. */
const PUSH_HOST_SUFFIXES = [
  'fcm.googleapis.com', // Chrome, Edge, Android
  'android.googleapis.com', // older Chrome/Android
  'push.services.mozilla.com', // Firefox
  'push.apple.com', // Safari, installed iPhone apps
  'notify.windows.com', // Windows notification service
];

export function isAllowedPushEndpoint(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_ENDPOINT_CHARS) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  if (u.port && u.port !== '443') return false;
  const host = u.hostname.toLowerCase();
  if (/^[\d.]+$/.test(host) || host.includes(':')) return false; // IP literals
  return PUSH_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const B64URL = /^[A-Za-z0-9_-]+$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseReminder(v: unknown): Parsed<Reminder> {
  if (!isRecord(v)) return { ok: false, error: 'reminder is required' };
  if (typeof v.time !== 'string' || !TIME.test(v.time)) return { ok: false, error: 'time must be HH:MM' };
  if (!Array.isArray(v.days) || v.days.length < 1 || v.days.length > 7) return { ok: false, error: 'days must list 1 to 7 weekdays' };
  const days: number[] = [];
  for (const d of v.days) {
    if (typeof d !== 'number' || !Number.isInteger(d) || d < 0 || d > 6) return { ok: false, error: 'days must be 0 to 6' };
    if (!days.includes(d)) days.push(d);
  }
  return { ok: true, value: { time: v.time, days: days.sort((a, b) => a - b) } };
}

export function parseSubscribeBody(body: unknown, nowMs: number): Parsed<Omit<PushRecord, 'lastSentDate' | 'createdAt'>> {
  if (!isRecord(body)) return { ok: false, error: 'body must be JSON' };
  if (JSON.stringify(body).length > MAX_BODY_CHARS) return { ok: false, error: 'body too large' };
  const sub = body.subscription;
  if (!isRecord(sub) || !isAllowedPushEndpoint(sub.endpoint)) return { ok: false, error: 'unsupported push endpoint' };
  const keys = sub.keys;
  if (!isRecord(keys)) return { ok: false, error: 'invalid keys' };
  const { p256dh, auth } = keys;
  if (typeof p256dh !== 'string' || !B64URL.test(p256dh) || p256dh.length < 80 || p256dh.length > 100) return { ok: false, error: 'invalid keys' };
  if (typeof auth !== 'string' || !B64URL.test(auth) || auth.length < 16 || auth.length > 32) return { ok: false, error: 'invalid keys' };
  const reminder = parseReminder(body.reminder);
  if (!reminder.ok) return reminder;
  if (!isValidTimeZone(body.timeZone)) return { ok: false, error: 'invalid time zone' };
  return { ok: true, value: { endpoint: sub.endpoint as string, keys: { p256dh, auth }, reminder: reminder.value, tz: body.timeZone, updatedAt: nowMs } };
}

export function parseUnsubscribeBody(body: unknown): Parsed<{ endpoint: string }> {
  if (!isRecord(body) || typeof body.endpoint !== 'string' || body.endpoint.length === 0 || body.endpoint.length > MAX_ENDPOINT_CHARS) {
    return { ok: false, error: 'endpoint is required' };
  }
  return { ok: true, value: { endpoint: body.endpoint } };
}

/** Records read back from storage are untrusted too: anything malformed is dropped. */
export function sanitizeRecord(raw: unknown): PushRecord | null {
  if (!isRecord(raw)) return null;
  const parsed = parseSubscribeBody({ subscription: { endpoint: raw.endpoint, keys: raw.keys }, reminder: raw.reminder, timeZone: raw.tz }, 0);
  if (!parsed.ok) return null;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    ...parsed.value,
    lastSentDate: typeof raw.lastSentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.lastSentDate) ? raw.lastSentDate : undefined,
    createdAt: num(raw.createdAt, 0),
    updatedAt: num(raw.updatedAt, 0),
  };
}

// ---- who is due right now? ----

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** The local calendar day, weekday and minutes since midnight in a time zone. */
export function localParts(ms: number, tz: string): { date: string; weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: WEEKDAYS[get('weekday')] ?? 0,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

export function isDue(rec: PushRecord, nowMs: number): { due: boolean; date: string } {
  const local = localParts(nowMs, rec.tz);
  if (rec.lastSentDate === local.date) return { due: false, date: local.date };
  if (!rec.reminder.days.includes(local.weekday)) return { due: false, date: local.date };
  const [h, m] = rec.reminder.time.split(':').map(Number);
  const target = h * 60 + m;
  const late = local.minutes - target;
  return { due: late >= 0 && late < SEND_WINDOW_MINUTES, date: local.date };
}

export const REMINDER_PAYLOAD = JSON.stringify({ title: 'Time to train', body: 'Open Intervo and start when you are ready.', url: '/' });

export interface SendReport {
  checked: number;
  sent: number;
  removed: number;
  failed: number;
}

/** Send to everyone who is due, a few at a time so a slow push service cannot run out the clock. */
export async function runSendDue(store: Store, send: Sender, nowMs: number): Promise<SendReport> {
  const all = await store.list();
  const report: SendReport = { checked: all.length, sent: 0, removed: 0, failed: 0 };
  const due = all.map((rec) => ({ rec, ...isDue(rec, nowMs) })).filter((x) => x.due);
  const BATCH = 10;
  for (let i = 0; i < due.length; i += BATCH) {
    await Promise.all(
      due.slice(i, i + BATCH).map(async ({ rec, date }) => {
        try {
          await send(rec, REMINDER_PAYLOAD);
          await store.markSent(rec.endpoint, date);
          report.sent++;
        } catch (err) {
          const code = (err as { statusCode?: number })?.statusCode;
          if (code === 404 || code === 410) {
            await store.remove(rec.endpoint);
            report.removed++;
          } else {
            report.failed++; // not marked sent: the next run inside the window tries again
          }
        }
      }),
    );
  }
  return report;
}

// ---- who may trigger a send? ----

/** The scheduler proves itself with a shared secret. Fails closed: with no secret configured, nobody may send. */
export function checkCronAuth(provided: unknown, expected: string | undefined): 'ok' | 'not-configured' | 'forbidden' {
  if (!expected) return 'not-configured';
  if (typeof provided !== 'string') return 'forbidden';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? 'ok' : 'forbidden';
}
