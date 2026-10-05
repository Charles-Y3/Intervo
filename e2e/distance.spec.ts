import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { LEG_DAY, seedHistory, seedRoutines } from './helpers';

async function quickDistance(page: Page, name = 'Run', preset = '5') {
  await page.getByLabel('Exercise', { exact: true }).fill(name);
  await page.getByRole('group', { name: 'Exercise type' }).getByRole('button', { name: 'Distance' }).click();
  await page.getByRole('group', { name: 'Distance', exact: true }).getByRole('button', { name: preset, exact: true }).click();
  await page.getByRole('group', { name: 'Get ready' }).getByRole('button', { name: 'None' }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Rounds −1' }).click(); // 5 -> 1
}

test('run: set a distance, run, adjust, tap Done; time, distance and pace are logged', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await quickDistance(page);
  await expect(page.locator('.startTotal')).toContainText('≈'); // estimate, no fixed length
  await page.getByRole('button', { name: 'Start', exact: true }).click();

  await expect(page.getByTestId('reps-now')).toHaveText('5');
  await expect(page.locator('.repsUnit')).toHaveText('km');
  await expect(page.getByTestId('time')).toHaveCount(0); // no countdown
  await page.clock.fastForward(30 * 60 * 1000); // 30 minutes of running
  await page.clock.runFor(500);
  await expect(page.getByTestId('reps-panel')).toBeVisible(); // never times out
  await expect(page.getByTestId('reps-clock')).toHaveText('30:00');
  await expect(page.getByTestId('dist-pace')).toHaveText('Pace 6:00 /km');
  await page.getByRole('button', { name: '0.1 km less' }).click();
  await page.getByRole('button', { name: '0.1 km less' }).click();
  await expect(page.getByTestId('reps-now')).toHaveText('4.8');
  await page.getByRole('button', { name: '1 km more', exact: true }).click();
  await page.getByRole('button', { name: '1 km less', exact: true }).click();
  await expect(page.getByTestId('reps-now')).toHaveText('4.8');
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible();
  await page.getByRole('button', { name: 'View progress' }).click();
  await expect(page.getByTestId('stat-distance')).toHaveText('4.8');
  await expect(page.getByTestId('history-item')).toContainText(/Run 4\.8 km in 30:0\d \(6:1\d\/km\)/);
  const metrics = page.getByRole('group', { name: 'Progress' });
  await expect(metrics.getByRole('button', { name: 'Total distance' })).toBeVisible();
  await expect(metrics.getByRole('button', { name: 'Average pace' })).toBeVisible();
});

test('miles: the unit setting changes presets, labels and what is logged', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Workout' }).click();
  await page.getByRole('group', { name: 'Distance unit' }).getByRole('button', { name: 'mi' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  await quickDistance(page, 'Jog', '2');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.locator('.repsUnit')).toHaveText('mi');
  await page.clock.runFor(4_000); // logging ignores workouts under 3 s
  await page.getByRole('button', { name: '1 mi less', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'View progress' }).click();
  await expect(page.getByTestId('history-item')).toContainText('Jog 1 mi in');
});

test('skipping a distance set logs no distance', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await quickDistance(page);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(5_000);
  await page.getByRole('button', { name: 'End', exact: true }).click();
  await page.getByRole('button', { name: 'End workout' }).click();
  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByTestId('history-item')).toContainText('Ended early');
  await expect(page.getByTestId('stat-distance')).toHaveCount(0);
});

test('a routine can mix a run with other exercises; distance rows have no weight field', async ({ page }) => {
  await seedRoutines(page, [LEG_DAY]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit routine: Leg day' }).click();
  const row = page.locator('.exRow').first();
  await expect(row.getByLabel(/extra weight/)).toBeVisible();
  await row.getByRole('group', { name: 'Exercise type' }).getByRole('button', { name: 'Distance' }).click();
  await expect(row.getByLabel(/extra weight/)).toHaveCount(0);
  await row.getByLabel('Squats: distance in km').fill('2.5');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('routine-card')).toContainText('≈');
  await page.getByRole('button', { name: 'Start Leg day' }).click();
  await expect(page.getByTestId('reps-now')).toHaveText('2.5');
  await page.getByRole('button', { name: 'Done', exact: true }).click(); // -> rest
  await expect(page.locator('.running')).toHaveClass(/phase-rest/);
});

test('bad distance values snap back', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('group', { name: 'Exercise type' }).getByRole('button', { name: 'Distance' }).click();
  const box = page.getByRole('spinbutton', { name: 'Distance', exact: true });
  await box.fill('7.25');
  await expect(page.getByRole('group', { name: 'Distance', exact: true }).getByRole('button', { name: '5', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await box.fill('0');
  await box.blur();
  await expect(box).toHaveValue('7.25'); // invalid: ignored
  await box.fill('');
  await box.blur();
  await expect(box).toHaveValue('7.25');
});

test('progress chart: total distance and average pace over time', async ({ page }) => {
  await seedHistory(page, [
    { id: 'a', daysAgo: 20, routineName: 'Run', exercises: [{ name: 'Run', distance: 5, distanceSec: 1800 }] },
    { id: 'b', daysAgo: 10, routineName: 'Run', exercises: [{ name: 'Run', distance: 5, distanceSec: 1650 }] },
    { id: 'c', daysAgo: 2, routineName: 'Run', exercises: [{ name: 'Run', distance: 6, distanceSec: 1800 }] },
  ]);
  await page.goto('/');
  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByTestId('stat-distance')).toHaveText('16');
  await page.getByRole('group', { name: 'Progress' }).getByRole('button', { name: 'Average pace' }).click();
  await page.getByRole('group', { name: 'Group by' }).getByRole('button', { name: 'Week' }).click();
  const chart = page.getByRole('img', { name: /Average pace per week/ });
  await expect(chart).toBeVisible();
  await expect(chart).toHaveAttribute('aria-label', /\d+:\d\d \/km/);
  await page.getByRole('group', { name: 'Progress' }).getByRole('button', { name: 'Total distance' }).click();
  await expect(page.getByRole('img', { name: /Total distance per week/ })).toBeVisible();
});
