import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { LEG_DAY, seedHistory, seedRoutines } from './helpers';

const cards = (page: Page) => page.getByTestId('routine-card');
const runTop = (page: Page) => page.locator('.runTop');

async function setSetting(page: Page, tab: string, group: string, button: string) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: tab }).click();
  await page.getByRole('group', { name: group, exact: true }).getByRole('button', { name: button, exact: true }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
}

// ---------------- warm-up and cool-down ----------------

test('warm-up runs first and cool-down last, labelled on the running screen', async ({ page }) => {
  await seedRoutines(page, [{ id: 'w', name: 'With blocks', rounds: 1, exercises: [{ name: 'Squats' }], warmup: [{ name: 'Jacks' }], cooldown: [{ name: 'Stretch' }] }]);
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: 'Start With blocks' }).click();
  await expect(runTop(page)).toContainText('Warm-up');
  await expect(page.locator('.runName')).toHaveText('Jacks');
  await page.getByRole('button', { name: 'Skip' }).click(); // rest
  await page.getByRole('button', { name: 'Skip' }).click(); // main
  await expect(runTop(page)).toContainText('Round 1 of 1');
  await expect(page.locator('.runName')).toHaveText('Squats');
  await page.getByRole('button', { name: 'Skip' }).click(); // rest
  await page.getByRole('button', { name: 'Skip' }).click(); // cool-down
  await expect(runTop(page)).toContainText('Cool-down');
  await expect(page.locator('.runName')).toHaveText('Stretch');
});

test('editor adds and removes warm-up and cool-down exercises; they save', async ({ page }) => {
  await seedRoutines(page, [LEG_DAY]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit routine: Leg day' }).click();
  await expect(page.getByLabel(/^Warm-up exercise name/)).toHaveCount(0);
  await page.getByRole('button', { name: /Add warm-up exercise/ }).click();
  await page.getByLabel('Warm-up exercise name 1').fill('Arm circles');
  await page.getByRole('button', { name: /Add cool-down exercise/ }).click();
  await page.getByLabel('Cool-down exercise name 1').fill('Hamstring stretch');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Edit routine: Leg day' }).click();
  await expect(page.getByLabel('Warm-up exercise name 1')).toHaveValue('Arm circles');
  await expect(page.getByLabel('Cool-down exercise name 1')).toHaveValue('Hamstring stretch');
  // main list can never be emptied, the optional lists can (after the confirm)
  await expect(page.getByRole('button', { name: 'Remove: Arm circles' })).toBeEnabled();
  await page.getByRole('button', { name: 'Remove: Arm circles' }).click();
  await page.getByRole('dialog', { name: 'Remove this exercise?' }).getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByLabel(/^Warm-up exercise name/)).toHaveCount(0);
});

// ---------------- weight and units ----------------

test('weight: set on a Quick exercise, shown while running and in the log, with a chart metric', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByLabel('Exercise', { exact: true }).fill('Pull-ups');
  await page.getByRole('group', { name: 'Exercise type' }).getByRole('button', { name: 'Reps' }).click();
  await page.getByLabel('Extra weight (optional)', { exact: true }).fill('7.5');
  await page.getByRole('group', { name: 'Get ready' }).getByRole('button', { name: 'None' }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Rounds −1' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.locator('.runWeight')).toHaveText('+7.5 kg');
  await page.clock.runFor(5_000);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'View progress' }).click();
  await expect(page.getByTestId('history-item')).toContainText('+7.5 kg');
  await expect(page.getByRole('group', { name: 'Progress' }).getByRole('button', { name: 'Heaviest weight' })).toBeVisible();
});

test('units: switching to lb relabels the weight field and running screen', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await setSetting(page, 'Workout', 'Weight unit', 'lb');
  await expect(page.getByLabel('Extra weight (optional)', { exact: true })).toHaveAttribute('placeholder', 'lb');
  await page.getByLabel('Extra weight (optional)', { exact: true }).fill('20');
  await page.getByRole('group', { name: 'Get ready' }).getByRole('button', { name: 'None' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.locator('.runWeight')).toHaveText('+20 lb');
});

test('bad weight values are cleaned: negative and huge', async ({ page }) => {
  await page.goto('/');
  const box = page.getByLabel('Extra weight (optional)', { exact: true });
  await box.fill('-5');
  await box.blur();
  await expect(box).toHaveValue('');
  await box.fill('5000');
  await box.blur();
  await expect(box).toHaveValue('999');
});

// ---------------- duplicate and examples ----------------

test('Duplicate makes an independent copy with new ids', async ({ page }) => {
  await seedRoutines(page, [LEG_DAY]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit routine: Leg day' }).click();
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(cards(page)).toHaveCount(2);
  await expect(cards(page).first()).toContainText('Leg day (copy)');
  // editing the copy leaves the original alone
  await page.getByRole('button', { name: 'Edit routine: Leg day (copy)' }).click();
  await page.getByLabel('Routine name').fill('Variation');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit routine: Leg day', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit routine: Variation' })).toBeVisible();
});

test('example routines: add once, then the button goes away; they can be started', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('tab', { name: 'Routine' }).click();
  await expect(page.getByTestId('no-routines')).toBeVisible();
  await page.getByRole('button', { name: 'Add example routines' }).click();
  await expect(cards(page)).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Add example routines' })).toHaveCount(0);
  await page.reload();
  await expect(cards(page)).toHaveCount(3);
  await page.getByRole('button', { name: 'Start Full body starter' }).click();
  await page.getByRole('button', { name: 'Skip' }).click(); // the 5 s get-ready
  await expect(runTop(page)).toContainText('Warm-up'); // the example has a warm-up
  await expect(page.locator('.runName')).toHaveText('Jumping jacks');
});

// ---------------- last done and sorting ----------------

test('cards show when each routine was last done; Recent sort puts the latest first', async ({ page }) => {
  await seedRoutines(page, [
    { id: 'a', name: 'Alpha', exercises: [{ name: 'X' }] },
    { id: 'b', name: 'Bravo', exercises: [{ name: 'Y' }] },
    { id: 'c', name: 'Charlie', exercises: [{ name: 'Z' }] },
  ]);
  await seedHistory(page, [
    { id: 'h1', daysAgo: 5, routineId: 'a', routineName: 'Alpha' },
    { id: 'h2', daysAgo: 1, routineId: 'b', routineName: 'Bravo' },
    { id: 'h3', daysAgo: 3, routineId: 'b', routineName: 'Bravo' },
  ]);
  await page.goto('/');
  const names = () => page.locator('.rcName').allTextContents();
  expect(await names()).toEqual(['Bravo', 'Alpha', 'Charlie']); // recent first, never-done last
  await expect(cards(page).nth(0).getByTestId('last-done')).toHaveText('Last done yesterday · 2× in 30 days');
  await expect(cards(page).nth(1).getByTestId('last-done')).toHaveText('Last done 5 days ago · 1× in 30 days');
  await expect(cards(page).nth(2).getByTestId('last-done')).toHaveText('Not done yet');

  await page.getByRole('group', { name: 'Sort' }).getByRole('button', { name: 'A to Z' }).click();
  expect(await names()).toEqual(['Alpha', 'Bravo', 'Charlie']);
  await page.getByRole('group', { name: 'Sort' }).getByRole('button', { name: 'Newest' }).click();
  expect(await names()).toEqual(['Alpha', 'Bravo', 'Charlie']); // saved order
  await page.reload();
  await expect(page.getByRole('group', { name: 'Sort' }).getByRole('button', { name: 'Newest' })).toHaveAttribute('aria-pressed', 'true'); // remembered
});

test('renaming a routine keeps its history together', async ({ page }) => {
  await seedRoutines(page, [{ id: 'a', name: 'Legs v2', exercises: [{ name: 'X' }] }]);
  await seedHistory(page, [
    { id: 'h1', daysAgo: 20, routineId: 'a', routineName: 'Legs' },
    { id: 'h2', daysAgo: 2, routineId: 'a', routineName: 'Legs v2' },
  ]);
  await page.goto('/');
  await expect(cards(page).first().getByTestId('last-done')).toContainText('2× in 30 days');
  await page.getByRole('button', { name: 'History' }).click();
  await page.getByRole('group', { name: 'Dates' }).getByRole('button', { name: 'All time' }).click();
  const options = page.getByLabel('Routine', { exact: true }).locator('option');
  await expect(options).toHaveText(['All routines', 'Legs v2']); // one choice, newest name
  await page.getByLabel('Routine', { exact: true }).selectOption({ label: 'Legs v2' });
  await expect(page.getByTestId('stat-workouts')).toHaveText('2');
});

// ---------------- weekly goal and streak ----------------

test('weekly goal card counts finished workouts and shows the streak', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await expect(page.getByTestId('goal-card')).toHaveCount(0); // off by default
  await setSetting(page, 'Workout', 'Weekly goal', '2');
  await expect(page.getByTestId('goal-progress')).toHaveText('0 of 2 workouts');
  await expect(page.getByTestId('goal-streak')).toContainText('Reach your goal');

  for (let n = 1; n <= 2; n++) {
    await page.getByRole('group', { name: 'Work' }).getByRole('button', { name: '10s' }).click();
    await page.getByRole('group', { name: 'Get ready' }).getByRole('button', { name: 'None' }).click();
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Rounds −1' }).click();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.clock.runFor(10_500);
    await page.getByRole('button', { name: 'Back to setup' }).click();
    await expect(page.getByTestId('goal-progress')).toHaveText(n === 1 ? '1 of 2 workouts' : 'Goal reached');
  }
  await expect(page.getByTestId('goal-streak')).toHaveText('Streak: 1 week');
});

test('ended-early workouts do not count toward the goal', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem('intervo:settings', JSON.stringify({ weeklyGoal: 1 })));
  await page.goto('/');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(6_000);
  await page.getByRole('button', { name: 'End', exact: true }).click();
  await page.getByRole('button', { name: 'End workout' }).click();
  await expect(page.getByTestId('goal-progress')).toHaveText('0 of 1 workouts');
});

// ---------------- workout notes ----------------

test('a note typed on the finish screen is saved to that workout and shown in History', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('group', { name: 'Work' }).getByRole('button', { name: '10s' }).click();
  await page.getByRole('group', { name: 'Get ready' }).getByRole('button', { name: 'None' }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Rounds −1' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(10_500);
  await page.getByLabel('Workout note').fill('Elbow felt fine, +2 reps');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByText('Note saved')).toBeVisible();
  await page.getByRole('button', { name: 'View progress' }).click();
  await expect(page.getByTestId('history-item')).toContainText('Elbow felt fine, +2 reps');
  await page.reload();
  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByTestId('history-item')).toContainText('Elbow felt fine, +2 reps');
});

// ---------------- backup and restore ----------------

test('backup: export downloads a valid file with everything in it', async ({ page }) => {
  await seedRoutines(page, [LEG_DAY]);
  await seedHistory(page, [{ id: 'h1', daysAgo: 1, routineId: 'leg', routineName: 'Leg day', note: 'solid' }]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'General' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save backup file' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^intervo-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  const fs = await import('node:fs');
  const data = JSON.parse(fs.readFileSync(path, 'utf-8'));
  expect(data).toMatchObject({ app: 'intervo', version: 1 });
  expect(data.saved).toHaveLength(1);
  expect(data.saved[0].name).toBe('Leg day');
  expect(data.history).toHaveLength(1);
  expect(data.history[0].note).toBe('solid');
});

function backupFile(over: Record<string, unknown> = {}) {
  const routine = (id: string, name: string) => ({
    id, name, rounds: 2, prepSec: 0, restBetweenExercisesSec: 10, restBetweenRoundsSec: 60,
    exercises: [{ id: `${id}-1`, name: 'Burpees', workSec: 30, kind: 'timed', reps: 10, weight: 0 }],
  });
  return Buffer.from(
    JSON.stringify({
      app: 'intervo', version: 1, exportedAt: Date.UTC(2026, 9, 1),
      settings: { sound: 'beeps', units: 'lb', weeklyGoal: 4 },
      state: { mode: 'routine', sort: 'name' },
      saved: [routine('imp1', 'Imported one'), routine('leg', 'Other phone version')],
      history: [{ id: 'imp-h', at: Date.UTC(2026, 8, 20), routineName: 'Imported one', routineId: 'imp1', exercises: [] }],
      ...over,
    }),
  );
}

test('restore: merge adds what is missing and keeps what is here', async ({ page }) => {
  await seedRoutines(page, [LEG_DAY]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'General' }).click();
  await page.getByLabel('Backup file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: backupFile() });
  const sheet = page.getByRole('dialog', { name: 'Restore backup' });
  await expect(sheet).toContainText('2 routines and 1 workouts');
  await sheet.getByRole('button', { name: 'Add what is missing' }).click();
  await expect(page.getByText('Backup restored.')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  await expect(cards(page)).toHaveCount(2); // Leg day (kept, not overwritten) + Imported one
  await expect(page.getByRole('button', { name: 'Edit routine: Leg day', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit routine: Imported one' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit routine: Other phone version' })).toHaveCount(0);
});

test('restore: replace asks first, then swaps everything including settings', async ({ page }) => {
  await seedRoutines(page, [LEG_DAY]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'General' }).click();
  await page.getByLabel('Backup file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: backupFile() });
  const sheet = page.getByRole('dialog', { name: 'Restore backup' });
  await sheet.getByRole('button', { name: 'Replace everything' }).click();
  const confirm = page.getByRole('dialog', { name: 'Replace everything on this phone?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(cards(page)).toHaveCount(1); // still the original routine behind the popups: nothing changed yet
  await page.getByRole('dialog', { name: 'Restore backup' }).getByRole('button', { name: 'Replace everything' }).click();
  await page.getByRole('dialog', { name: 'Replace everything on this phone?' }).getByRole('button', { name: 'Replace everything' }).click();
  await expect(page.getByText('Backup restored.')).toBeVisible();
  await page.getByRole('tab', { name: 'Workout' }).click();
  await expect(page.getByRole('group', { name: 'Weight unit' }).getByRole('button', { name: 'lb' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('tab', { name: 'Sound' }).click();
  await expect(page.getByRole('group', { name: 'Sound', exact: true }).getByRole('button', { name: 'Beeps' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  await expect(cards(page)).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Edit routine: Leg day', exact: true })).toHaveCount(0); // replaced
  await page.reload();
  await expect(cards(page)).toHaveCount(2); // persisted
});

test('restore: bad files are rejected with a message and change nothing', async ({ page }) => {
  await seedRoutines(page, [LEG_DAY]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'General' }).click();
  const input = page.getByLabel('Backup file');
  await input.setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('this is not json') });
  await expect(page.getByRole('alert')).toContainText('not a readable backup');
  await input.setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"somebody-else","version":1}') });
  await expect(page.getByRole('alert')).toContainText('not an Intervo backup');
  await expect(page.getByRole('dialog', { name: 'Restore backup' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  await expect(cards(page)).toHaveCount(1);
});

test('restore: hostile contents are sanitized, not trusted', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'General' }).click();
  const evil = backupFile({
    saved: [{ id: 'e', name: '<img src=x onerror=alert(1)>', rounds: 1e9, exercises: 'no' }],
    settings: { sound: 'loud', weeklyGoal: 1e9, units: 'stone' },
    history: [{ at: 'now' }],
  });
  await page.getByLabel('Backup file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: evil });
  await page.getByRole('dialog', { name: 'Restore backup' }).getByRole('button', { name: 'Add what is missing' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  await page.getByRole('tab', { name: 'Routine' }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page)).toContainText('99 rounds'); // clamped
  await expect(page.locator('img[src="x"]')).toHaveCount(0); // rendered as text, never as HTML
});

// ---------------- drag to reorder ----------------

const mainNames = (page: Page) => page.locator('.field').filter({ hasText: /^Exercises/ }).locator('.exName').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));

test('drag a handle to reorder exercises', async ({ page }) => {
  await seedRoutines(page, [LEG_DAY]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit routine: Leg day' }).click();
  expect(await mainNames(page)).toEqual(['Squats', 'Lunges', 'Plank']);
  const handle = page.getByRole('button', { name: /Reorder Squats/ });
  const last = page.getByRole('button', { name: /Reorder Plank/ });
  const a = (await handle.boundingBox())!;
  const b = (await last.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + 60, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height + 40, { steps: 10 });
  await page.mouse.up();
  expect(await mainNames(page)).toEqual(['Lunges', 'Plank', 'Squats']);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(cards(page)).toContainText('Lunges, Plank, Squats');
});

test('keyboard: arrow keys on the handle reorder; focus stays on the handle', async ({ page }) => {
  await seedRoutines(page, [LEG_DAY]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit routine: Leg day' }).click();
  const handle = page.getByRole('button', { name: /Reorder Lunges/ });
  await handle.focus();
  await page.keyboard.press('ArrowUp');
  expect(await mainNames(page)).toEqual(['Lunges', 'Squats', 'Plank']);
  await expect(page.getByRole('button', { name: /Reorder Lunges/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  expect(await mainNames(page)).toEqual(['Squats', 'Plank', 'Lunges']);
  await page.keyboard.press('ArrowDown'); // already last: no change, no error
  expect(await mainNames(page)).toEqual(['Squats', 'Plank', 'Lunges']);
});

// ---------------- running shortcuts ----------------

test('+10 s works on a work step too', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('group', { name: 'Get ready' }).getByRole('button', { name: 'None' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(1_000);
  await expect(page.getByTestId('time')).toHaveText('29');
  await page.getByRole('button', { name: '+10 s' }).click();
  await expect(page.getByTestId('time')).toHaveText('39');
});

test('Extra set repeats the exercise once more, tagged, and is logged', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByLabel('Exercise', { exact: true }).fill('Plank');
  await page.getByRole('group', { name: 'Work' }).getByRole('button', { name: '10s' }).click();
  await page.getByRole('group', { name: 'Get ready' }).getByRole('button', { name: 'None' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Rounds −1' }).click(); // 2 rounds
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('button', { name: '+ Extra set' })).toHaveCount(0); // not while a set is running
  await page.clock.runFor(10_500); // -> round rest
  await expect(page.locator('.running')).toHaveClass(/phase-rest/);
  await page.getByRole('button', { name: '+ Extra set' }).click();
  await page.getByRole('button', { name: 'Skip' }).click(); // skip the rest -> the extra set
  await expect(page.locator('.running')).toHaveClass(/phase-work/);
  await expect(runTop(page)).toContainText('extra set');
  await page.clock.runFor(10_500); // extra set done -> its rest
  await page.getByRole('button', { name: 'Skip' }).click(); // -> round 2
  await expect(runTop(page)).toContainText('Round 2 of 2');
  await page.clock.runFor(10_500);
  await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible();
  await page.getByRole('button', { name: 'View progress' }).click();
  await expect(page.getByTestId('history-item')).toContainText('Plank ×3'); // 2 rounds + 1 extra set
  await expect(page.getByTestId('history-item')).toContainText('2/2 rounds'); // extra set never inflates rounds
});
