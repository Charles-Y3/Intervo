import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { LEG_DAY, seedRoutines } from './helpers';

// ---------- deletes always ask first ----------

test('deleting a saved routine asks first; cancel keeps it', async ({ page }) => {
  await seedRoutines(page, [LEG_DAY]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit routine: Leg day' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete this saved routine?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit routine' })).toBeVisible(); // still editing
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete this saved routine?' }).getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByTestId('routine-card')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('no-routines')).toBeVisible();
});

test('removing an exercise asks first', async ({ page }) => {
  await seedRoutines(page, [LEG_DAY]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit routine: Leg day' }).click();
  await expect(page.getByLabel(/Exercise name \d/)).toHaveCount(3);
  await page.getByRole('button', { name: 'Remove: Lunges' }).click();
  const confirm = page.getByRole('dialog', { name: 'Remove this exercise?' });
  await expect(confirm).toBeVisible();
  await expect(page.getByLabel(/Exercise name \d/)).toHaveCount(3);
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel(/Exercise name \d/)).toHaveCount(3);
  await page.getByRole('button', { name: 'Remove: Lunges' }).click();
  await page.getByRole('dialog', { name: 'Remove this exercise?' }).getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByLabel(/Exercise name \d/)).toHaveCount(2);
});

// ---------- workout log ----------

async function quickWorkout(page: Page, name: string) {
  await page.getByLabel('Exercise', { exact: true }).fill(name);
  await page.getByRole('group', { name: 'Work' }).getByRole('button', { name: '10s' }).click();
  await page.getByRole('group', { name: 'Get ready' }).getByRole('button', { name: 'None' }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Rounds −1' }).click(); // 5 -> 1
}

test('a finished workout is logged and shows in History', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await quickWorkout(page, 'Plank');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(10_500);
  await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible();
  await expect(page.getByText('Saved to your history.')).toBeVisible();
  await page.getByRole('button', { name: 'View progress' }).click();
  await expect(page.getByTestId('stat-workouts')).toHaveText('1');
  const item = page.getByTestId('history-item');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('Quick timer');
  await expect(item).toContainText('Plank ×1 (10s)');
  await expect(item).toContainText('Completed');
  await expect(page.getByRole('img', { name: /Work time per day/ })).toBeVisible();
  // survives a reload
  await page.reload();
  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByTestId('history-item')).toHaveCount(1);
});

test('ending early logs a partial workout; an accidental start logs nothing', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await quickWorkout(page, 'Plank');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(1_000); // under 3 s: accidental
  await page.getByRole('button', { name: 'End', exact: true }).click();
  await page.getByRole('button', { name: 'End workout' }).click();
  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByTestId('history-empty')).toBeVisible();
  await page.getByRole('button', { name: /Back/ }).click();

  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(6_000);
  await page.getByRole('button', { name: 'End', exact: true }).click();
  await expect(page.getByText('Progress so far is saved to your history.')).toBeVisible();
  await page.getByRole('button', { name: 'End workout' }).click();
  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByTestId('history-item')).toHaveCount(1);
  await expect(page.getByTestId('history-item')).toContainText('Ended early');
  await expect(page.getByTestId('history-item')).toContainText('Plank ×0');
});

// Seed 6 workouts over ~7 months: the plank gets longer over time.
async function seedHistory(page: Page) {
  await page.addInitScript(() => {
    const day = 86400000;
    const now = Date.now();
    const mk = (id: string, daysAgo: number, routineName: string, ex: [string, number, number, number][]) => ({
      id,
      at: now - daysAgo * day,
      routineName,
      mode: 'routine',
      rounds: 3,
      roundsDone: 3,
      totalSec: 600,
      workSec: ex.reduce((a, e) => a + e[2], 0),
      completed: true,
      exercises: ex.map(([name, sets, workSec, longestSec]) => ({ name, sets, workSec, longestSec })),
    });
    if (localStorage.getItem('intervo:history') !== null) return; // seed once, so deletes survive a reload
    localStorage.setItem(
      'intervo:history',
      JSON.stringify([
        mk('h1', 2, 'Core', [['Plank', 3, 120, 40]]),
        mk('h2', 5, 'Leg day', [['Squats', 3, 90, 30], ['Plank', 3, 90, 30]]),
        mk('h3', 20, 'Core', [['Plank', 3, 90, 30]]),
        mk('h4', 40, 'Leg day', [['Squats', 3, 90, 30]]),
        mk('h5', 60, 'Core', [['Plank', 3, 60, 20]]),
        mk('h6', 200, 'Core', [['Plank', 3, 45, 15]]),
      ]),
    );
  });
}

const dates = (page: Page) => page.getByRole('group', { name: 'Dates' });

test('history filters: dates, routine, exercise; stats follow the filters', async ({ page }) => {
  await seedHistory(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'History' }).click();
  const count = page.getByTestId('stat-workouts');
  const items = page.getByTestId('history-item');

  await expect(count).toHaveText('3'); // default: last 30 days (h1, h2, h3)
  await dates(page).getByRole('button', { name: 'Last 7 days' }).click();
  await expect(count).toHaveText('2');
  await dates(page).getByRole('button', { name: 'All time' }).click();
  await expect(count).toHaveText('6');

  await page.getByLabel('Routine').selectOption('Leg day');
  await expect(count).toHaveText('2');
  await page.getByLabel('Routine').selectOption('');

  await page.getByLabel('Exercise', { exact: true }).selectOption('Squats');
  await expect(count).toHaveText('2');
  await expect(items.first()).toContainText('Squats ×3');
  await expect(items.first()).not.toContainText('Plank'); // list shows only the chosen exercise

  await page.getByLabel('Exercise', { exact: true }).selectOption('Plank');
  await expect(count).toHaveText('5');

  await page.getByLabel('Routine').selectOption('Core');
  await expect(count).toHaveText('4');
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(count).toHaveText('3');
});

test('custom date range', async ({ page }) => {
  await seedHistory(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'History' }).click();
  await dates(page).getByRole('button', { name: 'Custom' }).click();
  await page.getByLabel('From', { exact: true }).fill('2000-01-01');
  await page.getByLabel('To', { exact: true }).fill('2099-12-31');
  await expect(page.getByTestId('stat-workouts')).toHaveText('6');
  await page.getByLabel('To', { exact: true }).fill('2000-12-31');
  await expect(page.getByTestId('history-no-match')).toBeVisible();
});

test('progress chart for one exercise over time', async ({ page }) => {
  await seedHistory(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'History' }).click();
  await dates(page).getByRole('button', { name: 'All time' }).click();
  await page.getByLabel('Exercise', { exact: true }).selectOption('Plank');
  await page.getByRole('group', { name: 'Progress' }).getByRole('button', { name: 'Longest set' }).click();
  await page.getByRole('group', { name: 'Group by' }).getByRole('button', { name: 'Month' }).click();
  const chart = page.getByRole('img', { name: /Longest set per month/ });
  await expect(chart).toBeVisible();
  await expect(chart).toHaveAttribute('aria-label', /Highest: .*: 40s/); // the best plank was 40 s
  // tap a bar for its value
  await page.locator('.chartHit').last().click();
  await expect(page.locator('.chartPick')).toContainText(/: \d+s/);
});

test('deleting a workout and clearing history both ask first', async ({ page }) => {
  await seedHistory(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'History' }).click();
  await dates(page).getByRole('button', { name: 'All time' }).click();
  await expect(page.getByTestId('history-item')).toHaveCount(6);

  await page.getByRole('button', { name: /Delete: Core/ }).first().click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Delete this workout?' })).toBeVisible();
  await expect(page.getByTestId('history-item')).toHaveCount(6); // not yet
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('history-item')).toHaveCount(6);
  await page.getByRole('button', { name: /Delete: Core/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByTestId('history-item')).toHaveCount(5);

  await page.getByRole('button', { name: 'Delete all history' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Delete all history?' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('All 5 logged workouts');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('history-item')).toHaveCount(5);
  await page.getByRole('button', { name: 'Delete all history' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete all history' }).click();
  await expect(page.getByTestId('history-empty')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByTestId('history-empty')).toBeVisible();
});

test('corrupt history in storage does not break the app', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('intervo:history', '[{"at":"x"},null,5,{"at":1e30}]'));
  await page.goto('/');
  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByTestId('history-empty')).toBeVisible();
});
