import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { LEG_DAY, seedRoutines } from './helpers';

const cards = (page: Page) => page.getByTestId('routine-card');

async function finishQuick10s(page: Page) {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('group', { name: 'Work' }).getByRole('button', { name: '10s' }).click();
  await page.getByRole('group', { name: 'Get ready' }).getByRole('button', { name: 'None' }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Rounds −1' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(10_500);
}

/** Contrast ratio between an element's text colour and the colour it is drawn on. */
async function contrastOf(page: Page, label: string): Promise<number> {
  return page.getByLabel(label).evaluate((el) => {
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const cs = getComputedStyle(el);
    const a = lum(rgb(cs.color));
    const b = lum(rgb(cs.backgroundColor));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}

// ---------------- the notes box was unreadable (dark text on a dark box) ----------------

for (const scheme of ['dark', 'light'] as const) {
  test(`the workout note text is readable in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await finishQuick10s(page);
    const note = page.getByLabel('Workout note');
    await note.fill('Elbow felt fine');
    expect(await contrastOf(page, 'Workout note')).toBeGreaterThan(7);
  });
}

test('the note text is readable when dark theme is chosen in Settings, too', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('intervo:settings', JSON.stringify({ theme: 'dark' })));
  await finishQuick10s(page);
  await page.getByLabel('Workout note').fill('x');
  expect(await contrastOf(page, 'Workout note')).toBeGreaterThan(7);
});

// ---------------- timed reps ----------------

async function quickTimedReps(page: Page) {
  await page.getByLabel('Exercise', { exact: true }).fill('Squats');
  await page.getByRole('group', { name: 'Exercise type' }).getByRole('button', { name: 'Reps' }).click();
  await page.getByRole('group', { name: 'Reps per set' }).getByRole('button', { name: '10', exact: true }).click();
  await page.getByRole('button', { name: 'Time limit on' }).click();
  await page.getByRole('group', { name: 'Reps: time limit' }).getByRole('button', { name: '20s' }).click();
  await page.getByRole('group', { name: 'Get ready' }).getByRole('button', { name: 'None' }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Rounds −1' }).click();
}

test('timed reps (quick): countdown, then it asks how many reps; the target is pre-filled', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await quickTimedReps(page);
  await expect(page.locator('.startTotal')).not.toContainText('≈'); // exact length, not an estimate
  await page.getByRole('button', { name: 'Start', exact: true }).click();

  await expect(page.getByTestId('time')).toHaveText('20'); // a real countdown
  await expect(page.getByTestId('reps-now')).toContainText('10');
  await expect(page.getByTestId('time-up')).toHaveCount(0);
  await page.clock.runFor(20_500);

  await expect(page.getByTestId('time-up')).toHaveText('Time is up. How many reps did you do?');
  await expect(page.locator('.running')).toBeVisible(); // did NOT finish on its own
  await expect(page.getByTestId('reps-now')).toContainText('10'); // target pre-filled: one tap confirms
  await page.clock.runFor(60_000); // waiting changes nothing
  await expect(page.getByTestId('time-up')).toBeVisible();

  await page.getByRole('button', { name: 'One fewer rep' }).click();
  await page.getByRole('button', { name: 'One fewer rep' }).click();
  await page.getByRole('button', { name: 'Log reps' }).click();

  await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible();
  await page.getByRole('button', { name: 'View progress' }).click();
  await expect(page.getByTestId('stat-reps')).toHaveText('8');
  await expect(page.getByTestId('history-item')).toContainText('Squats 8 reps');
});

test('timed reps: "+10 s more time" resumes the countdown; Done early logs the reps', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await quickTimedReps(page);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(20_500);
  await expect(page.getByTestId('time-up')).toBeVisible();
  await page.getByRole('button', { name: '+10 s more time' }).click();
  await expect(page.getByTestId('time-up')).toHaveCount(0);
  await expect(page.getByTestId('time')).toHaveText('10');
  await page.clock.runFor(3_000);
  await page.getByRole('button', { name: 'Done', exact: true }).click(); // finished early
  await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible();
});

test('timed reps: the editor sets reps AND time, and both survive a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Routine' }).click();
  await page.getByRole('button', { name: /New routine/ }).click();
  const row = page.locator('.exRow').first();
  await row.getByRole('group', { name: 'Exercise type' }).getByRole('button', { name: 'Reps' }).click();
  await row.getByLabel('Exercise 1: Reps').fill('12');
  await row.getByRole('button', { name: 'Exercise 1: time limit', exact: true }).click();
  await expect(row.getByRole('button', { name: /Exercise 1: time limit: 30s/ })).toBeVisible();
  await row.getByRole('button', { name: /Exercise 1: time limit: 30s/ }).click();
  const pad = page.getByRole('dialog', { name: /Set time/ });
  for (let i = 0; i < 2; i++) await pad.getByRole('button', { name: 'Delete digit' }).click(); // the pad starts at 30
  for (const k of ['4', '5']) await pad.getByRole('button', { name: k, exact: true }).click();
  await pad.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await page.reload();
  await page.getByRole('button', { name: /Edit routine/ }).click();
  const again = page.locator('.exRow').first();
  await expect(again.getByLabel('Exercise 1: Reps')).toHaveValue('12');
  await expect(again.getByRole('button', { name: 'Exercise 1: time limit', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(again.getByRole('button', { name: /Exercise 1: time limit: 45s/ })).toBeVisible();
});

// ---------------- supersets ----------------

test('supersets: link three exercises, set 2 sets, they play back to back and repeat', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('tab', { name: 'Routine' }).click();
  await page.getByRole('button', { name: /New routine/ }).click();
  const editor = page.getByRole('dialog', { name: 'New routine' });
  await expect(editor.getByTestId('superset-head')).toHaveCount(0);
  await editor.getByRole('button', { name: 'Make a superset of Exercise 1 and the next exercise' }).click();
  await expect(editor.getByTestId('superset-head')).toContainText('Superset of 2');
  await editor.getByRole('button', { name: 'Make a superset of Exercise 2 and the next exercise' }).click();
  await expect(editor.getByTestId('superset-head')).toHaveCount(1);
  await expect(editor.getByTestId('superset-head')).toContainText('Superset of 3');
  await editor.getByRole('button', { name: 'More superset sets' }).click();
  await expect(editor.getByTestId('superset-sets')).toHaveText('2');
  for (let i = 0; i < 2; i++) await editor.getByRole('button', { name: 'Rounds −1' }).click();
  await editor.getByRole('group', { name: 'Get ready' }).getByRole('button', { name: 'None' }).click();
  await editor.getByRole('button', { name: 'Save and start' }).click();

  await expect(page.locator('.runTop')).toContainText('Step 1 of 6'); // 3 exercises x 2 sets
  await expect(page.locator('.runName')).toHaveText('Exercise 1');
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('.runName')).toHaveText('Exercise 2'); // straight on, no rest in between
  await expect(page.locator('.running')).toHaveClass(/phase-work/);
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('.runName')).toHaveText('Exercise 3');
  await expect(page.locator('.running')).toHaveClass(/phase-work/);
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('.running')).toHaveClass(/phase-rest/); // rest after the pass
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('.runName')).toHaveText('Exercise 1'); // second pass
  await expect(page.locator('.runTop')).toContainText('Step 4 of 6');
});

test('supersets: Unlink splits the group again; the link survives a save and reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Routine' }).click();
  await page.getByRole('button', { name: /New routine/ }).click();
  await page.getByRole('button', { name: 'Make a superset of Exercise 1 and the next exercise' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: /Edit routine/ }).click();
  await expect(page.getByTestId('superset-head')).toContainText('Superset of 2');
  await page.getByRole('button', { name: 'Take Exercise 1 out of the superset with the next exercise' }).click();
  await expect(page.getByTestId('superset-head')).toHaveCount(0);
});

test('supersets: dragging an exercise out of a group does not leave a broken group', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Routine' }).click();
  await page.getByRole('button', { name: /New routine/ }).click();
  await page.getByRole('button', { name: 'Make a superset of Exercise 1 and the next exercise' }).click();
  await expect(page.getByTestId('superset-head')).toContainText('Superset of 2');
  const handle = page.getByRole('button', { name: /^Reorder Exercise 2/ });
  await handle.focus();
  await page.keyboard.press('ArrowDown'); // Exercise 2 moves below Exercise 3
  await expect(page.getByTestId('superset-head')).toHaveCount(0); // Exercise 1 is alone again
});

// ---------------- rest after each exercise ----------------

test('per-exercise rest: pick a time for one exercise, change the plan total, go back to default', async ({ page }) => {
  await seedRoutines(page, [LEG_DAY]);
  await page.goto('/');
  await expect(cards(page).first()).toContainText('8:15');
  await page.getByRole('button', { name: 'Edit routine: Leg day' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit routine' });
  const squatsRest = editor.getByRole('button', { name: 'Squats: rest after, Default' });
  await squatsRest.click();
  const picker = page.getByRole('dialog', { name: 'Rest after Squats' });
  await expect(picker.getByRole('button', { name: 'Use the default (10s)' })).toBeDisabled();
  await picker.getByRole('group', { name: 'Rest after' }).getByRole('button', { name: '45s' }).click();
  await picker.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Squats: rest after, 45s' })).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Lunges: rest after, Default' })).toBeVisible(); // only that one changed
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(cards(page).first()).toContainText('10:00'); // +35 s x 3 rounds

  await page.getByRole('button', { name: 'Edit routine: Leg day' }).click();
  await page.getByRole('button', { name: 'Squats: rest after, 45s' }).click();
  await page.getByRole('dialog', { name: 'Rest after Squats' }).getByRole('button', { name: 'Use the default (10s)' }).click();
  await page.getByRole('dialog', { name: 'Rest after Squats' }).getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Squats: rest after, Default' })).toBeVisible();
});

test('per-exercise rest: "None" removes the rest, and the running workout follows it', async ({ page }) => {
  await page.clock.install();
  await seedRoutines(page, [{ id: 'two', name: 'Two', exercises: [{ name: 'One' }, { name: 'Two' }], rounds: 1 }]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit routine: Two' }).click();
  await page.getByRole('button', { name: 'One: rest after, Default' }).click();
  await page.getByRole('dialog', { name: 'Rest after One' }).getByRole('group', { name: 'Rest after' }).getByRole('button', { name: 'None' }).click();
  await page.getByRole('dialog', { name: 'Rest after One' }).getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Save and start' }).click();
  await page.clock.runFor(30_500);
  await expect(page.locator('.runName')).toHaveText('Two'); // straight on
  await expect(page.locator('.running')).toHaveClass(/phase-work/);
});

// ---------------- voice: minutes are not meters ----------------

test('voice says "2 minutes", never "2m"', async ({ page }) => {
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
  await seedRoutines(page, [{ id: 'slow', name: 'Slow', exercises: [{ name: 'Squats', workSec: 20 }, { name: 'Lunges', workSec: 20 }], restBetweenExercisesSec: 120, rounds: 1 }]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start Slow' }).click();
  await page.clock.runFor(20_500);
  const said = await page.evaluate(() => (window as unknown as { __said: string[] }).__said.filter((t) => t.trim() !== ''));
  expect(said).toContain('Rest 2 minutes. Next, Lunges');
  expect(said.join(' | ')).not.toMatch(/\d[ms]\b/);
});

// ---------------- duplicate and starter routines ----------------

test('Duplicate on a card makes an independent copy', async ({ page }) => {
  await seedRoutines(page, [LEG_DAY]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Duplicate Leg day' }).click();
  await expect(cards(page)).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Edit routine: Leg day (copy)' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit routine: Leg day (copy)' }).click();
  await page.getByLabel('Exercise name 1').fill('Changed');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Edit routine: Leg day', exact: true }).click();
  await expect(page.getByLabel('Exercise name 1')).toHaveValue('Squats'); // the original is untouched
});

test('starter library: add a routine, it is saved, "Added" is shown, adding twice is impossible', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Routine' }).click();
  await expect(cards(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Browse starter routines' }).click();
  const lib = page.getByRole('dialog', { name: 'Starter routines' });
  await expect(lib.getByTestId('template-card').first()).toBeVisible();
  await lib.getByRole('button', { name: 'Add starter routine: Tabata (4 minutes)' }).click();
  await expect(lib.getByRole('button', { name: 'Add starter routine: Tabata (4 minutes)' })).toHaveText('Added');
  await expect(lib.getByRole('button', { name: 'Add starter routine: Tabata (4 minutes)' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText('Tabata (4 minutes)');
  await expect(cards(page).first()).toContainText('3:55'); // 8 x 20 s + 7 x 10 s + 5 s get ready
  await page.reload();
  await expect(cards(page)).toHaveCount(1); // persisted
});

test('starter library: the superset and timed-reps templates actually play as advertised', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('tab', { name: 'Routine' }).click();
  await page.getByRole('button', { name: 'Browse starter routines' }).click();
  const lib = page.getByRole('dialog', { name: 'Starter routines' });
  await lib.getByRole('button', { name: 'Add starter routine: Push, pull, core superset' }).click();
  await lib.getByRole('button', { name: 'Add starter routine: EMOM 10 squats' }).click();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Start Push, pull, core superset' }).click();
  await page.clock.runFor(100);
  await page.getByRole('button', { name: 'Skip' }).click(); // get ready -> push-ups
  await expect(page.locator('.runTop')).toContainText('Step 1 of 9'); // 3 exercises x 3 sets
  await page.getByRole('button', { name: 'End', exact: true }).click();
  await page.getByRole('button', { name: 'End workout' }).click();

  await page.getByRole('button', { name: 'Start EMOM 10 squats' }).click();
  await page.clock.runFor(5_500 + 40_500); // get ready, then the 40 s countdown
  await expect(page.getByTestId('time-up')).toBeVisible();
});

test('"Try today" suggests one starter routine; adding it moves the suggestion on', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Routine' }).click();
  const today = page.getByTestId('try-today');
  await expect(today).toHaveCount(1);
  const name = (await today.getByRole('strong').textContent()) ?? '';
  expect(name.length).toBeGreaterThan(2);
  await today.getByRole('button', { name: /^Add starter routine/ }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText(name);
  await expect(page.getByTestId('try-today').getByRole('strong')).not.toHaveText(name); // a different one now
});
