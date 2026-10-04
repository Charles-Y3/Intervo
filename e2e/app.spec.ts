import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const phase = (page: Page) => page.locator('.running');

async function quickShort(page: Page) {
  // Work 10s, rest between rounds 30s, 2 rounds, no get-ready.
  await page.getByRole('group', { name: 'Work' }).getByRole('button', { name: '10s' }).click();
  await page.getByRole('group', { name: 'Rest between rounds' }).getByRole('button', { name: '30s' }).click();
  await page.getByRole('button', { name: 'Rounds −1' }).click(); // 5 -> 4
  await page.getByRole('button', { name: 'Rounds −1' }).click(); // 3
  await page.getByRole('button', { name: 'Rounds −1' }).click(); // 2
  await page.getByRole('group', { name: 'Get ready' }).getByRole('button', { name: 'None' }).click();
}

test('quick timer runs work, rest, work, then finishes', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await quickShort(page);
  await expect(page.getByText('Total')).toBeVisible();
  await expect(page.locator('.startTotal strong')).toHaveText('0:50'); // 10 + 30 + 10
  await page.getByRole('button', { name: 'Start', exact: true }).click();

  await expect(phase(page)).toHaveClass(/phase-work/);
  await page.clock.runFor(10_500);
  await expect(phase(page)).toHaveClass(/phase-rest/);
  await expect(page.getByTestId('time')).toHaveText(/^(29|30)$/);
  await page.clock.runFor(30_000);
  await expect(phase(page)).toHaveClass(/phase-work/);
  await page.clock.runFor(10_500);
  await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible();
  await expect(page.getByTestId('finish-time')).toHaveText(/^0:(4[89]|5[0-2])$/);
});

test('catches up after a long freeze (backgrounded phone)', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await quickShort(page);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.fastForward(15_000); // jumps straight into the rest
  await page.clock.runFor(200);
  await expect(phase(page)).toHaveClass(/phase-rest/);
});

test('pause freezes the countdown; skip goes to the next step', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await quickShort(page);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(3_000);
  await page.getByRole('button', { name: 'Pause' }).click();
  const before = await page.getByTestId('time').innerText();
  await page.clock.runFor(20_000);
  await expect(page.getByTestId('time')).toHaveText(before);
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(phase(page)).toHaveClass(/phase-rest/);
  await page.getByRole('button', { name: '+10 s' }).click();
  await page.clock.runFor(500);
  await expect(page.getByTestId('time')).toHaveText(/^(39|40)$/);
});

test('end asks for confirmation then returns to setup', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'End', exact: true }).click();
  await page.getByRole('button', { name: 'Keep going' }).click();
  await expect(phase(page)).toBeVisible();
  await page.getByRole('button', { name: 'End', exact: true }).click();
  await page.getByRole('button', { name: 'End workout' }).click();
  await expect(page.getByRole('tab', { name: 'Quick' })).toBeVisible();
});

test('number pad sets a custom time', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Work: 0:30/ }).click();
  const pad = page.getByRole('dialog');
  await pad.getByRole('button', { name: 'Delete digit' }).click();
  await pad.getByRole('button', { name: 'Delete digit' }).click();
  for (const k of ['1', '3', '0']) await pad.getByRole('button', { name: k, exact: true }).click();
  await pad.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.bigTimeValue')).toHaveText('1:30');
});

test('zero time is rejected with a message', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Work: 0:30/ }).click();
  const pad = page.getByRole('dialog');
  await pad.getByRole('button', { name: 'Delete digit' }).click();
  await pad.getByRole('button', { name: 'Delete digit' }).click();
  await pad.getByRole('button', { name: 'Done' }).click();
  await expect(pad.getByRole('alert')).toBeVisible();
});

test('routine: add exercises, set rest between, save, reload keeps it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Routine' }).click();
  await page.getByRole('button', { name: /Add exercise/ }).click();
  await page.getByLabel('Exercise name 1').fill('Squats');
  await page.getByRole('group', { name: 'Rest between exercises' }).getByRole('button', { name: '15s' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Routine' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Exercise name 1')).toHaveValue('Squats');
  await expect(page.getByRole('group', { name: 'Rest between exercises' }).getByRole('button', { name: '15s' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.savedItem')).toHaveCount(1);
});

test('routine runs exercises in rotation with rest between', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('tab', { name: 'Routine' }).click();
  await page.getByLabel('Exercise name 1').fill('Squats');
  await page.getByLabel('Exercise name 2').fill('Lunges');
  await page.getByRole('group', { name: 'Get ready' }).getByRole('button', { name: 'None' }).click();
  await page.getByRole('button', { name: 'Start routine' }).click();
  await expect(page.locator('.runName')).toHaveText('Squats');
  await page.getByRole('button', { name: 'Skip' }).click(); // -> rest 10s
  await expect(phase(page)).toHaveClass(/phase-rest/);
  await expect(page.locator('.runName')).toHaveText('Lunges'); // up-next name shown during rest
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('.runName')).toHaveText('Lunges');
});

test('garbage in localStorage does not break the app', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('intervo:state', '{"mode":"routine","routine":{"rounds":1e99,"exercises":"<script>"},"quick":null}');
    localStorage.setItem('intervo:settings', 'not json');
    localStorage.setItem('intervo:saved', '{"a":1}');
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start routine' })).toBeVisible();
  await expect(page.getByLabel('Exercise name 1')).toBeVisible();
});

test('settings: sound mode and theme persist', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Silent' }).click();
  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('button', { name: 'Silent' })).toHaveAttribute('aria-pressed', 'true');
});

test('works offline after the first load', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  await context.setOffline(false);
});

test('manifest is installable', async ({ page }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const res = await page.request.get(href!);
  const m = await res.json();
  expect(m.display).toBe('standalone');
  expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
});
