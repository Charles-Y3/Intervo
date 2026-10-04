import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

// The new headless Chromium honours granted notification permissions (the old headless shell does not).
test.use({ channel: 'chromium' });

/** There is no server in these tests: /api/push/* is answered by a stand-in, and the phone's
 * push service (which would need Google's servers) by a fake. What is proven here is the
 * app's side: what it asks the server for, what it shows, and what it stores. */

interface Call {
  path: string;
  body: Record<string, unknown> | null;
}

async function fakePushManager(page: Page, opts: { subscribed?: boolean } = {}) {
  await page.addInitScript((initiallySubscribed) => {
    const state = { subscribed: initiallySubscribed };
    const sub = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-test',
      toJSON() {
        return { endpoint: this.endpoint, keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } };
      },
      async unsubscribe() {
        state.subscribed = false;
        return true;
      },
    };
    const manager = {
      async getSubscription() {
        return state.subscribed ? sub : null;
      },
      async subscribe() {
        state.subscribed = true;
        return sub;
      },
    };
    Object.defineProperty(ServiceWorkerRegistration.prototype, 'pushManager', { get: () => manager });
    (window as unknown as { __push: typeof state }).__push = state;
  }, opts.subscribed ?? false);
}

type Mode = 'ok' | 'not-configured' | 'down';

/** Stand-in for the server. Records every call. */
async function fakeServer(page: Page, mode: Mode = 'ok') {
  const calls: Call[] = [];
  await page.route('**/api/push/**', async (route: Route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    calls.push({ path, body: req.postData() ? JSON.parse(req.postData()!) : null });
    if (mode === 'down') return route.abort();
    if (mode === 'not-configured') return route.fulfill({ status: 503, json: { error: 'PUSH_NOT_CONFIGURED' } });
    if (path.endsWith('vapid-public-key')) return route.fulfill({ json: { publicKey: 'B' + 'A'.repeat(86) } });
    return route.fulfill({ json: { status: 'ok' } });
  });
  return calls;
}

const subscribeCalls = (calls: Call[]) => calls.filter((c) => c.path.endsWith('/subscribe'));

async function openSettings(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
}

const reminders = (page: Page) => page.getByTestId('reminders');
const toggle = (page: Page) => reminders(page).getByRole('checkbox', { name: 'Remind me to train' });

test.describe('with notifications allowed', () => {
  test.use({ permissions: ['notifications'] });

  test('turning on registers this phone with the schedule and time zone', async ({ page }) => {
    await fakePushManager(page);
    const calls = await fakeServer(page);
    await openSettings(page);
    await toggle(page).click(); // the box flips once the phone and server have answered
    await expect(page.getByTestId('reminder-status')).toHaveText('Reminders on: Mon, Wed, Fri at 6:00 PM.');
    const sub = subscribeCalls(calls);
    expect(sub).toHaveLength(1);
    expect(sub[0].body).toMatchObject({
      subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-test' },
      reminder: { time: '18:00', days: [1, 3, 5] },
    });
    expect(typeof sub[0].body!.timeZone).toBe('string');
    expect(String(sub[0].body!.timeZone).length).toBeGreaterThan(2);
    // only the push address, schedule and time zone are sent: no routine, history or settings data
    expect(Object.keys(sub[0].body!).sort()).toEqual(['reminder', 'subscription', 'timeZone']);
    // persisted
    await page.reload();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(toggle(page)).toBeChecked();
  });

  test('changing the time or days re-sends the schedule; the last day cannot be removed', async ({ page }) => {
    await fakePushManager(page);
    const calls = await fakeServer(page);
    await openSettings(page);
    await toggle(page).click(); // the box flips once the phone and server have answered
    await expect(page.getByTestId('reminder-status')).toBeVisible();
    await reminders(page).getByLabel('Reminder time').fill('07:15');
    await reminders(page).getByRole('group', { name: 'Reminder days' }).getByRole('button', { name: 'Tue' }).click();
    await expect.poll(() => subscribeCalls(calls).length).toBe(2); // debounced into one request
    expect(subscribeCalls(calls)[1].body).toMatchObject({ reminder: { time: '07:15', days: [1, 2, 3, 5] } });
    await expect(page.getByTestId('reminder-status')).toHaveText('Reminders on: Mon, Tue, Wed, Fri at 7:15 AM.');

    const days = reminders(page).getByRole('group', { name: 'Reminder days' });
    for (const d of ['Tue', 'Wed', 'Fri']) await days.getByRole('button', { name: d }).click();
    await days.getByRole('button', { name: 'Mon' }).click(); // the last one: ignored
    await expect(days.getByRole('button', { name: 'Mon' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => subscribeCalls(calls).at(-1)?.body).toMatchObject({ reminder: { days: [1] } });
  });

  test('turning off removes this phone from the server', async ({ page }) => {
    await fakePushManager(page);
    const calls = await fakeServer(page);
    await openSettings(page);
    await toggle(page).click(); // the box flips once the phone and server have answered
    await expect(page.getByTestId('reminder-status')).toBeVisible();
    await toggle(page).click();
    await expect(toggle(page)).not.toBeChecked();
    const un = calls.filter((c) => c.path.endsWith('/unsubscribe'));
    expect(un).toHaveLength(1);
    expect(un[0].body).toEqual({ endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-test' });
    expect(await page.evaluate(() => (window as unknown as { __push: { subscribed: boolean } }).__push.subscribed)).toBe(false);
  });

  test('when the server is not set up, it says so and stays off', async ({ page }) => {
    await fakePushManager(page);
    await fakeServer(page, 'not-configured');
    await openSettings(page);
    await toggle(page).click();
    await expect(page.getByTestId('reminder-message')).toContainText('not set up on the server yet');
    await expect(toggle(page)).not.toBeChecked();
  });

  test('when the server cannot be reached, it says so and stays off', async ({ page }) => {
    await fakePushManager(page);
    await fakeServer(page, 'down');
    await openSettings(page);
    await toggle(page).click();
    await expect(page.getByTestId('reminder-message')).toContainText('Could not reach the server');
    await expect(toggle(page)).not.toBeChecked();
  });

  test('each time the app opens it re-sends the schedule (keeps the time zone current)', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('intervo:settings', JSON.stringify({ reminder: { enabled: true, time: '06:30', days: [2, 4] } })));
    await fakePushManager(page, { subscribed: true });
    const calls = await fakeServer(page);
    await page.goto('/');
    await expect.poll(() => subscribeCalls(calls).length).toBe(1);
    expect(subscribeCalls(calls)[0].body).toMatchObject({ reminder: { time: '06:30', days: [2, 4] } });
  });

  test('nothing is sent to any server while reminders are off', async ({ page }) => {
    await fakePushManager(page);
    const calls = await fakeServer(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.waitForTimeout(800);
    expect(calls).toEqual([]);
  });

  test('a restored backup never claims reminders are on', async ({ page }) => {
    await fakePushManager(page);
    await fakeServer(page);
    await openSettings(page);
    const file = Buffer.from(
      JSON.stringify({ app: 'intervo', version: 1, exportedAt: 1, settings: { reminder: { enabled: true, time: '05:00', days: [6] } }, state: {}, saved: [], history: [] }),
    );
    await page.getByLabel('Backup file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: file });
    await page.getByRole('dialog', { name: 'Restore backup' }).getByRole('button', { name: 'Replace everything' }).click();
    await page.getByRole('dialog', { name: 'Replace everything on this phone?' }).getByRole('button', { name: 'Replace everything' }).click();
    await expect(page.getByText('Backup restored.')).toBeVisible();
    await expect(toggle(page)).not.toBeChecked(); // the schedule came back, the "on" did not
    await expect(reminders(page).getByLabel('Reminder time')).toHaveValue('05:00');
  });

  test('the test notification button shows a notification on this phone', async ({ page }) => {
    await fakePushManager(page);
    await fakeServer(page);
    await openSettings(page);
    await toggle(page).click(); // the box flips once the phone and server have answered
    await expect(page.getByTestId('reminder-status')).toBeVisible();
    await page.getByRole('button', { name: 'Show a test notification' }).click();
    await expect(page.getByTestId('reminder-message')).toContainText('Test sent');
    const titles = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => n.title));
    expect(titles).toContain('Time to train');
  });
});

test.describe('the service worker handles a push', () => {
  test.use({ permissions: ['notifications'] });

  async function deliverPush(page: Page, payload: unknown) {
    const session = await page.context().newCDPSession(page);
    const registration = new Promise<string>((resolve) => {
      session.on('ServiceWorker.workerRegistrationUpdated', (e: { registrations: { registrationId: string }[] }) => {
        if (e.registrations[0]) resolve(e.registrations[0].registrationId);
      });
    });
    await session.send('ServiceWorker.enable');
    const registrationId = await registration;
    await session.send('ServiceWorker.deliverPushMessage', {
      origin: new URL(page.url()).origin,
      registrationId,
      data: typeof payload === 'string' ? payload : JSON.stringify(payload),
    });
  }

  const shown = (page: Page) =>
    page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => ({ title: n.title, body: n.body, url: (n.data as { url?: string })?.url, tag: n.tag })));

  test('a reminder push becomes a notification', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await deliverPush(page, { title: 'Time to train', body: 'Open Intervo and start when you are ready.', url: '/' });
    await expect.poll(() => shown(page)).toEqual([{ title: 'Time to train', body: 'Open Intervo and start when you are ready.', url: '/', tag: 'intervo-reminder' }]);
  });

  test('a hostile push cannot send you to another site or flood the screen', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await deliverPush(page, { title: 'T'.repeat(500), body: 'B'.repeat(900), url: '//evil.example.com/phish' });
    await expect.poll(async () => (await shown(page)).length).toBe(1);
    const [n] = await shown(page);
    expect(n.title).toHaveLength(80);
    expect(n.body).toHaveLength(200);
    expect(n.url).toBe('/');
  });

  test('a push that is not JSON still shows the default reminder', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await deliverPush(page, 'plain text, not json');
    await expect.poll(async () => (await shown(page))[0]?.title).toBe('Time to train');
  });
});

test.describe('unsupported or blocked', () => {
  test('without push support the toggle is disabled with an explanation', async ({ page }) => {
    await page.addInitScript(() => {
      delete (window as unknown as { PushManager?: unknown }).PushManager;
    });
    const calls = await fakeServer(page);
    await openSettings(page);
    await expect(toggle(page)).toBeDisabled();
    await expect(page.getByTestId('reminder-message')).toContainText('add Intervo to your Home Screen');
    expect(calls).toEqual([]);
  });

  test('blocked notifications: explains how to fix it, sends nothing', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Notification, 'permission', { get: () => 'denied' });
      Notification.requestPermission = async () => 'denied';
    });
    await fakePushManager(page);
    const calls = await fakeServer(page);
    await openSettings(page);
    await toggle(page).click();
    await expect(page.getByTestId('reminder-message')).toContainText('blocked');
    await expect(toggle(page)).not.toBeChecked();
    expect(calls).toEqual([]);
  });

  test('"on" in settings but no longer allowed on the phone: turns itself off with a message', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('intervo:settings', JSON.stringify({ reminder: { enabled: true, time: '18:00', days: [1] } }));
      Object.defineProperty(Notification, 'permission', { get: () => 'denied' });
    });
    await fakePushManager(page);
    await fakeServer(page);
    await openSettings(page);
    await expect(page.getByTestId('reminder-message')).toContainText('no longer subscribed');
    await expect(toggle(page)).not.toBeChecked();
  });
});
