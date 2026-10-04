import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function setupQuickReps(page: Page, name: string, reps: string) {
  await page.getByLabel('Exercise', { exact: true }).fill(name);
  await page.getByRole('group', { name: 'Exercise type' }).getByRole('button', { name: 'Reps' }).click();
  await page.getByRole('group', { name: 'Reps per set' }).getByRole('button', { name: reps, exact: true }).click();
  await page.getByRole('group', { name: 'Get ready' }).getByRole('button', { name: 'None' }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Rounds −1' }).click(); // 5 -> 1
}

test('quick reps set: adjust, Done, logged with reps', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await setupQuickReps(page, 'Pull-ups', '12');
  await expect(page.locator('.startTotal')).toContainText('≈'); // estimate, not exact
  await page.getByRole('button', { name: 'Start', exact: true }).click();

  await expect(page.getByTestId('reps-now')).toHaveText('12');
  await expect(page.getByTestId('time')).toHaveCount(0); // no countdown on a reps set
  await page.clock.runFor(23_000);
  await expect(page.getByTestId('reps-clock')).toHaveText('0:23');
  await page.getByRole('button', { name: 'One fewer rep' }).click();
  await page.getByRole('button', { name: 'One fewer rep' }).click();
  await expect(page.getByTestId('reps-now')).toHaveText('10');
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible();
  await page.getByRole('button', { name: 'View progress' }).click();
  await expect(page.getByTestId('stat-reps')).toHaveText('10');
  await expect(page.getByTestId('history-item')).toContainText('Pull-ups 10 reps · 1 sets (best 10)');
  // rep metrics are offered once there is rep data
  await expect(page.getByRole('group', { name: 'Progress' }).getByRole('button', { name: 'Best set (reps)' })).toBeVisible();
});

test('a reps set never times out on its own', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await setupQuickReps(page, 'Pull-ups', '8');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(3 * 60 * 1000); // 3 min is 5x the estimated set time; lighter than 10
  await expect(page.getByTestId('reps-panel')).toBeVisible();
  await expect(page.getByTestId('reps-now')).toHaveText('8');
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible();
});

test('skipping a reps set logs no reps', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByLabel('Exercise', { exact: true }).fill('Pull-ups');
  await page.getByRole('group', { name: 'Exercise type' }).getByRole('button', { name: 'Reps' }).click();
  await page.getByRole('group', { name: 'Get ready' }).getByRole('button', { name: 'None' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(5_000);
  await page.getByRole('button', { name: 'Skip' }).click(); // into the 1 min round rest
  await page.getByRole('button', { name: 'End', exact: true }).click();
  await page.getByRole('button', { name: 'End workout' }).click();
  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByTestId('history-item')).toContainText('Ended early');
  await expect(page.getByTestId('stat-reps')).toHaveCount(0); // no reps were confirmed
});

test('routine mixes a reps exercise with a timed one; kind and reps persist', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('tab', { name: 'Routine' }).click();
  await page.getByRole('button', { name: /New routine/ }).click();
  await page.getByLabel('Exercise name 1').fill('Pull-ups');
  const row1 = page.locator('.exRow').first();
  await row1.getByRole('group', { name: 'Exercise type' }).getByRole('button', { name: 'Reps' }).click();
  await row1.getByLabel('Pull-ups: Reps').fill('9');
  await page.getByLabel('Exercise name 2').fill('Plank');
  await page.getByRole('group', { name: 'Get ready' }).getByRole('button', { name: 'None' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await page.reload();
  await page.getByRole('button', { name: 'Edit routine: New routine' }).click();
  await expect(page.locator('.exRow').first().getByLabel('Pull-ups: Reps')).toHaveValue('9');
  await expect(page.locator('.exRow').nth(1).getByRole('button', { name: /Plank: 30s/ })).toBeVisible(); // timed stays a time button
  await page.getByRole('button', { name: 'Save and start' }).click();

  await expect(page.getByTestId('reps-now')).toHaveText('9');
  await page.getByRole('button', { name: 'Done', exact: true }).click(); // -> rest 10 s
  await expect(page.locator('.running')).toHaveClass(/phase-rest/);
  await page.getByRole('button', { name: 'Skip' }).click(); // -> plank (timed)
  await expect(page.locator('.runName')).toHaveText('Plank');
  await expect(page.getByTestId('time')).toBeVisible();
  await expect(page.getByTestId('reps-panel')).toHaveCount(0);
});

test('voice announces the rep target', async ({ page }) => {
  await page.addInitScript(() => {
    const spoken: string[] = [];
    (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
      voice = null;
      constructor(public text: string) {}
    };
    const synth = window.speechSynthesis as unknown as Record<string, unknown>;
    synth.getVoices = () => [];
    synth.cancel = () => undefined;
    synth.speak = (u: { text: string }) => spoken.push(u.text);
    (window as unknown as { __said: string[] }).__said = spoken;
  });
  await page.clock.install();
  await page.goto('/');
  await setupQuickReps(page, 'Pull-ups', '12');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(300);
  const said = await page.evaluate(() => (window as unknown as { __said: string[] }).__said.filter((t) => t.trim() !== ''));
  expect(said[0]).toBe('Pull-ups. 12 reps. Go');
});

test('typed reps are validated and snap back', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('group', { name: 'Exercise type' }).getByRole('button', { name: 'Reps' }).click();
  const box = page.getByRole('spinbutton', { name: 'Reps' });
  await box.fill('15');
  await expect(page.getByRole('group', { name: 'Reps per set' }).getByRole('button', { name: '15', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await box.fill('0'); // invalid: ignored, snaps back on blur
  await box.blur();
  await expect(box).toHaveValue('15');
  await box.fill('');
  await box.blur();
  await expect(box).toHaveValue('15');
});
