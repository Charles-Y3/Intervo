import { createECDH, randomBytes } from 'node:crypto';
import webpush from 'web-push';
import { describe, expect, it } from 'vitest';
import {
  MAX_SUBSCRIPTIONS,
  REMINDER_PAYLOAD,
  checkCronAuth,
  isAllowedPushEndpoint,
  isDue,
  isValidTimeZone,
  localParts,
  parseReminder,
  parseSubscribeBody,
  runSendDue,
  sanitizeRecord,
} from './core.js';
import type { PushRecord, Sender } from './core.js';
import { handleSendDue, handleSubscribe, handleUnsubscribe, handleVapidKey } from './handlers.js';
import { SEND_OPTIONS, makeSender } from './http.js';
import { MemoryStore } from './store.js';

const KEY = 'B'.repeat(87);
const AUTH = 'a'.repeat(22);
const FCM = 'https://fcm.googleapis.com/fcm/send/abc123';

const subBody = (over: Record<string, unknown> = {}) => ({
  subscription: { endpoint: FCM, keys: { p256dh: KEY, auth: AUTH } },
  reminder: { time: '18:00', days: [1, 3, 5] },
  timeZone: 'America/Toronto',
  ...over,
});

const rec = (over: Partial<PushRecord> = {}): PushRecord => ({
  endpoint: FCM,
  keys: { p256dh: KEY, auth: AUTH },
  reminder: { time: '18:00', days: [0, 1, 2, 3, 4, 5, 6] },
  tz: 'UTC',
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const at = (iso: string) => Date.parse(iso);

describe('which push endpoints are allowed (SSRF protection)', () => {
  it('accepts the real push services over https', () => {
    for (const u of [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/xyz',
      'https://web.push.apple.com/QWxx',
      'https://wns2-par02p.notify.windows.com/w/?token=1',
      'https://android.googleapis.com/gcm/send/x',
    ]) {
      expect(isAllowedPushEndpoint(u), u).toBe(true);
    }
  });

  it('refuses everything else', () => {
    for (const u of [
      'http://fcm.googleapis.com/fcm/send/abc', // not https
      'https://evil.example.com/fcm.googleapis.com',
      'https://fcm.googleapis.com.evil.com/x', // look-alike host
      'https://evilfcm.googleapis.com.attacker.io/x',
      'https://notpush.apple.com.evil.org/x',
      'https://127.0.0.1/x',
      'https://169.254.169.254/latest/meta-data', // cloud metadata
      'https://[::1]/x',
      'https://localhost/x',
      'https://user:pass@fcm.googleapis.com/x', // credentials
      'https://fcm.googleapis.com:8443/x', // odd port
      'ftp://fcm.googleapis.com/x',
      'javascript:alert(1)',
      'file:///etc/passwd',
      '',
      'not a url',
    ]) {
      expect(isAllowedPushEndpoint(u), u).toBe(false);
    }
    for (const v of [null, undefined, 5, {}, [], 'https://fcm.googleapis.com/' + 'x'.repeat(1100)]) expect(isAllowedPushEndpoint(v)).toBe(false);
  });
});

describe('subscribe request validation', () => {
  it('accepts a good request and normalizes days', () => {
    const r = parseSubscribeBody(subBody({ reminder: { time: '07:30', days: [5, 1, 1, 3] } }), 99);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.reminder).toEqual({ time: '07:30', days: [1, 3, 5] });
      expect(r.value.tz).toBe('America/Toronto');
      expect(r.value.updatedAt).toBe(99);
    }
  });

  it('rejects bad input of every kind', () => {
    const bad: [string, unknown][] = [
      ['not an object', 'x'],
      ['null', null],
      ['array', []],
      ['no subscription', { reminder: { time: '18:00', days: [1] }, timeZone: 'UTC' }],
      ['internal endpoint', subBody({ subscription: { endpoint: 'https://169.254.169.254/', keys: { p256dh: KEY, auth: AUTH } } })],
      ['short p256dh', subBody({ subscription: { endpoint: FCM, keys: { p256dh: 'abc', auth: AUTH } } })],
      ['bad chars in key', subBody({ subscription: { endpoint: FCM, keys: { p256dh: '!'.repeat(87), auth: AUTH } } })],
      ['bad auth', subBody({ subscription: { endpoint: FCM, keys: { p256dh: KEY, auth: '' } } })],
      ['bad time 24:00', subBody({ reminder: { time: '24:00', days: [1] } })],
      ['bad time 7:5', subBody({ reminder: { time: '7:5', days: [1] } })],
      ['no days', subBody({ reminder: { time: '18:00', days: [] } })],
      ['day 7', subBody({ reminder: { time: '18:00', days: [7] } })],
      ['day 1.5', subBody({ reminder: { time: '18:00', days: [1.5] } })],
      ['day string', subBody({ reminder: { time: '18:00', days: ['1'] } })],
      ['8 days', subBody({ reminder: { time: '18:00', days: [0, 1, 2, 3, 4, 5, 6, 0] } })],
      ['bad zone', subBody({ timeZone: 'Mars/Olympus' })],
      ['zone not string', subBody({ timeZone: 5 })],
      ['huge body', subBody({ junk: 'x'.repeat(5000) })],
    ];
    for (const [name, body] of bad) expect(parseSubscribeBody(body, 1).ok, name).toBe(false);
  });

  it('validates time zones', () => {
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Asia/Taipei')).toBe(true);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone('x'.repeat(100))).toBe(false);
    expect(parseReminder({ time: '09:05', days: [0] }).ok).toBe(true);
  });

  it('records read back from storage are re-validated and bad ones dropped', () => {
    expect(sanitizeRecord(rec())).toMatchObject({ endpoint: FCM, tz: 'UTC' });
    expect(sanitizeRecord({ ...rec(), endpoint: 'https://evil.example.com/x' })).toBeNull();
    expect(sanitizeRecord({ ...rec(), reminder: { time: 'noon', days: [1] } })).toBeNull();
    expect(sanitizeRecord(null)).toBeNull();
    expect(sanitizeRecord({ ...rec(), lastSentDate: 'yesterday' })!.lastSentDate).toBeUndefined();
  });
});

describe('who is due (time zones, weekdays, window)', () => {
  it('reads the local day, weekday and minutes in a time zone', () => {
    // 2026-10-05 is a Monday. 22:30 UTC is 18:30 in Toronto (EDT, UTC-4).
    expect(localParts(at('2026-10-05T22:30:00Z'), 'America/Toronto')).toEqual({ date: '2026-10-05', weekday: 1, minutes: 18 * 60 + 30 });
    // 02:00 UTC on the 6th is still the evening of the 5th in Toronto.
    expect(localParts(at('2026-10-06T02:00:00Z'), 'America/Toronto')).toMatchObject({ date: '2026-10-05', weekday: 1, minutes: 22 * 60 });
    expect(localParts(at('2026-10-05T16:00:00Z'), 'Asia/Taipei')).toMatchObject({ date: '2026-10-06', weekday: 2, minutes: 0 }); // midnight, hour 24 handled
  });

  it('fires inside the 10 minute window after the chosen time, not before or after', () => {
    const r = rec({ tz: 'America/Toronto', reminder: { time: '18:00', days: [1] } });
    expect(isDue(r, at('2026-10-05T21:59:00Z')).due).toBe(false); // 17:59
    expect(isDue(r, at('2026-10-05T22:00:00Z')).due).toBe(true); // 18:00
    expect(isDue(r, at('2026-10-05T22:05:00Z')).due).toBe(true);
    expect(isDue(r, at('2026-10-05T22:09:59Z')).due).toBe(true);
    expect(isDue(r, at('2026-10-05T22:10:00Z')).due).toBe(false); // window closed
  });

  it('a 5 minute scheduler can never miss a reminder', () => {
    const r = rec({ tz: 'UTC', reminder: { time: '07:03', days: [0, 1, 2, 3, 4, 5, 6] } });
    for (const offset of [0, 1, 2, 3, 4]) {
      // schedule runs at :00, :05, :10 ... shifted by offset minutes
      let hits = 0;
      for (let m = 0; m < 24 * 60; m += 5) {
        const t = Date.UTC(2026, 9, 5, 0, m + offset);
        if (isDue(r, t).due) hits++;
      }
      expect(hits).toBeGreaterThanOrEqual(1);
    }
  });

  it('only on the chosen weekdays', () => {
    const r = rec({ tz: 'UTC', reminder: { time: '18:00', days: [1, 3] } }); // Mon, Wed
    expect(isDue(r, at('2026-10-05T18:00:00Z')).due).toBe(true); // Monday
    expect(isDue(r, at('2026-10-06T18:00:00Z')).due).toBe(false); // Tuesday
    expect(isDue(r, at('2026-10-07T18:00:00Z')).due).toBe(true); // Wednesday
  });

  it('never twice on the same local day', () => {
    const r = rec({ tz: 'UTC', lastSentDate: '2026-10-05' });
    expect(isDue(r, at('2026-10-05T18:02:00Z')).due).toBe(false);
    expect(isDue({ ...r, lastSentDate: '2026-10-04' }, at('2026-10-05T18:02:00Z')).due).toBe(true);
  });

  it('follows daylight saving time', () => {
    // Toronto switches to standard time on 2026-11-01: 18:00 local is then 23:00 UTC.
    const r = rec({ tz: 'America/Toronto', reminder: { time: '18:00', days: [0, 1, 2, 3, 4, 5, 6] } });
    expect(isDue(r, at('2026-10-31T22:00:00Z')).due).toBe(true); // EDT
    expect(isDue(r, at('2026-11-02T23:00:00Z')).due).toBe(true); // EST
    expect(isDue(r, at('2026-11-02T22:00:00Z')).due).toBe(false); // 17:00 EST
  });
});

describe('sending', () => {
  const run = async (records: PushRecord[], send: Sender, when = '2026-10-05T18:01:00Z') => {
    const store = new MemoryStore();
    for (const r of records) await store.upsert(r);
    const report = await runSendDue(store, send, at(when));
    return { store, report };
  };

  it('sends to the due ones only and marks them sent', async () => {
    const sent: string[] = [];
    const { store, report } = await run(
      [rec({ endpoint: FCM }), rec({ endpoint: 'https://fcm.googleapis.com/x2', reminder: { time: '06:00', days: [1] } })],
      async (r, payload) => {
        sent.push(r.endpoint);
        expect(JSON.parse(payload)).toMatchObject({ title: 'Time to train' });
      },
    );
    expect(sent).toEqual([FCM]);
    expect(report).toEqual({ checked: 2, sent: 1, removed: 0, failed: 0 });
    expect((await store.get(FCM))!.lastSentDate).toBe('2026-10-05');
  });

  it('a second run in the same window sends nothing', async () => {
    const store = new MemoryStore();
    await store.upsert(rec());
    let n = 0;
    const send: Sender = async () => void n++;
    await runSendDue(store, send, at('2026-10-05T18:01:00Z'));
    await runSendDue(store, send, at('2026-10-05T18:06:00Z'));
    expect(n).toBe(1);
  });

  it('removes subscriptions the push service says are gone (404 / 410)', async () => {
    for (const statusCode of [404, 410]) {
      const { store, report } = await run([rec()], async () => {
        throw Object.assign(new Error('gone'), { statusCode });
      });
      expect(report.removed).toBe(1);
      expect(await store.count()).toBe(0);
    }
  });

  it('keeps the record and does not mark it sent on other errors, so the next run retries', async () => {
    const { store, report } = await run([rec()], async () => {
      throw Object.assign(new Error('boom'), { statusCode: 500 });
    });
    expect(report).toEqual({ checked: 1, sent: 0, removed: 0, failed: 1 });
    expect((await store.get(FCM))!.lastSentDate).toBeUndefined();
  });

  it('one failure never blocks the others', async () => {
    const records = Array.from({ length: 25 }, (_, i) => rec({ endpoint: `https://fcm.googleapis.com/${i}` }));
    const { report } = await run(records, async (r) => {
      if (r.endpoint.endsWith('/3')) throw new Error('x');
    });
    expect(report).toMatchObject({ checked: 25, sent: 24, failed: 1 });
  });

  it('payload is short and has no personal data', () => {
    expect(REMINDER_PAYLOAD.length).toBeLessThan(200);
    expect(JSON.parse(REMINDER_PAYLOAD)).toEqual({ title: 'Time to train', body: 'Open Intervo and start when you are ready.', url: '/' });
  });
});

describe('the cron secret', () => {
  it('fails closed, and compares exactly', () => {
    expect(checkCronAuth('s3cret', undefined)).toBe('not-configured');
    expect(checkCronAuth('s3cret', '')).toBe('not-configured');
    expect(checkCronAuth(undefined, 's3cret')).toBe('forbidden');
    expect(checkCronAuth('', 's3cret')).toBe('forbidden');
    expect(checkCronAuth('s3cre', 's3cret')).toBe('forbidden');
    expect(checkCronAuth('s3cret!', 's3cret')).toBe('forbidden');
    expect(checkCronAuth(['s3cret'], 's3cret')).toBe('forbidden');
    expect(checkCronAuth('s3cret', 's3cret')).toBe('ok');
  });
});

describe('route handlers', () => {
  const env = { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', PUSH_CRON_SECRET: 'sec' };
  const noop: Sender = async () => undefined;

  it('vapid key: 503 until configured', () => {
    expect(handleVapidKey({}).status).toBe(503);
    expect(handleVapidKey({ VAPID_PUBLIC_KEY: 'pub' }).status).toBe(503);
    expect(handleVapidKey(env)).toEqual({ status: 200, body: { publicKey: 'pub' } });
  });

  it('subscribe: 503 with no store, 400 for bad input, 200 stores it', async () => {
    expect((await handleSubscribe(subBody(), null, 1)).status).toBe(503);
    const store = new MemoryStore();
    expect((await handleSubscribe({ nope: true }, store, 1)).status).toBe(400);
    expect((await handleSubscribe(subBody({ subscription: { endpoint: 'https://169.254.169.254/', keys: { p256dh: KEY, auth: AUTH } } }), store, 1)).status).toBe(400);
    expect(await store.count()).toBe(0);
    expect((await handleSubscribe(subBody(), store, 5)).status).toBe(200);
    expect(await store.get(FCM)).toMatchObject({ createdAt: 5, tz: 'America/Toronto', reminder: { time: '18:00', days: [1, 3, 5] } });
  });

  it('re-subscribing keeps createdAt and does not reset "already sent today"', async () => {
    const store = new MemoryStore();
    await handleSubscribe(subBody(), store, 10);
    await store.markSent(FCM, '2026-10-05');
    await handleSubscribe(subBody({ reminder: { time: '18:05', days: [1] } }), store, 99);
    const r = (await store.get(FCM))!;
    expect(r).toMatchObject({ createdAt: 10, updatedAt: 99, lastSentDate: '2026-10-05', reminder: { time: '18:05', days: [1] } });
  });

  it('subscribe: the table is capped, but existing subscribers can still update', async () => {
    const store = new MemoryStore();
    for (let i = 0; i < MAX_SUBSCRIPTIONS; i++) await store.upsert(rec({ endpoint: `https://fcm.googleapis.com/${i}` }));
    const fresh = subBody({ subscription: { endpoint: 'https://fcm.googleapis.com/new', keys: { p256dh: KEY, auth: AUTH } } });
    expect((await handleSubscribe(fresh, store, 1)).status).toBe(429);
    const existing = subBody({ subscription: { endpoint: 'https://fcm.googleapis.com/0', keys: { p256dh: KEY, auth: AUTH } } });
    expect((await handleSubscribe(existing, store, 1)).status).toBe(200);
    expect(await store.count()).toBe(MAX_SUBSCRIPTIONS);
  });

  it('unsubscribe removes the record', async () => {
    const store = new MemoryStore();
    await store.upsert(rec());
    expect((await handleUnsubscribe({}, store)).status).toBe(400);
    expect((await handleUnsubscribe({ endpoint: FCM }, null)).status).toBe(503);
    expect((await handleUnsubscribe({ endpoint: FCM }, store)).status).toBe(200);
    expect(await store.count()).toBe(0);
  });

  it('send-due: 503 when anything is missing, 403 for a wrong secret, 200 with the right one', async () => {
    const store = new MemoryStore();
    await store.upsert(rec());
    const now = at('2026-10-05T18:01:00Z');
    expect((await handleSendDue('sec', {}, store, noop, now)).status).toBe(503); // no VAPID
    expect((await handleSendDue('sec', env, null, noop, now)).status).toBe(503); // no store
    expect((await handleSendDue('sec', env, store, null, now)).status).toBe(503); // no sender
    expect((await handleSendDue('sec', { ...env, PUSH_CRON_SECRET: undefined }, store, noop, now)).status).toBe(503); // no secret: closed
    expect((await handleSendDue(undefined, env, store, noop, now)).status).toBe(403);
    expect((await handleSendDue('wrong', env, store, noop, now)).status).toBe(403);
    expect((await store.get(FCM))!.lastSentDate).toBeUndefined(); // nothing was sent by the failed calls
    const ok = await handleSendDue('sec', env, store, noop, now);
    expect(ok).toEqual({ status: 200, body: { status: 'ok', checked: 1, sent: 1, removed: 0, failed: 0 } });
  });
});

describe('the real push message (built with real keys, never sent)', () => {
  // A phone's subscription keys: a P-256 public key and a 16 byte auth secret, both base64url.
  const phone = () => {
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    return { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') };
  };

  it('is a valid encrypted, VAPID-signed, high urgency request to the phone push service', () => {
    const vapid = webpush.generateVAPIDKeys();
    webpush.setVapidDetails('mailto:admin@example.com', vapid.publicKey, vapid.privateKey);
    const keys = phone();
    expect(keys.p256dh).toHaveLength(87); // what the subscribe validation expects
    expect(keys.auth).toHaveLength(22);
    const req = webpush.generateRequestDetails({ endpoint: FCM, keys }, REMINDER_PAYLOAD, SEND_OPTIONS);
    expect(req.endpoint).toBe(FCM);
    expect(req.method).toBe('POST');
    expect(String(req.headers.TTL)).toBe('3600');
    expect(req.headers.Urgency).toBe('high');
    expect(req.headers['Content-Encoding']).toBe('aes128gcm');
    expect(String(req.headers.Authorization)).toMatch(/^vapid t=/);
    expect(Buffer.isBuffer(req.body)).toBe(true);
    expect((req.body as Buffer).toString('utf-8')).not.toContain('Time to train'); // encrypted, not readable on the way
  });

  it('keys from a real phone pass our subscribe validation', () => {
    const keys = phone();
    expect(parseSubscribeBody(subBody({ subscription: { endpoint: FCM, keys } }), 1).ok).toBe(true);
  });

  it('the sender is built from the VAPID environment, and refuses to exist without keys', () => {
    const vapid = webpush.generateVAPIDKeys();
    expect(makeSender({})).toBeNull();
    expect(makeSender({ VAPID_PUBLIC_KEY: vapid.publicKey })).toBeNull();
    expect(typeof makeSender({ VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, VAPID_SUBJECT: 'mailto:me@example.com' })).toBe('function');
    expect(() => makeSender({ VAPID_PUBLIC_KEY: 'not a key', VAPID_PRIVATE_KEY: 'nope' })).toThrow(); // bad keys fail loudly (the route answers 500, never sends)
  });
});
