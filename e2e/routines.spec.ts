import { expect, test } from '@playwright/test';
import { LEG_DAY, seedRoutines } from './helpers';

const cards = (page: import('@playwright/test').Page) => page.getByTestId('routine-card');

test('Routine tab starts with the routine list, not a form', async ({ page }) => {
  await seedRoutines(page, [LEG_DAY, { id: 'core', name: 'Core', exercises: [{ name: 'Plank' }, { name: 'Crunches' }], rounds: 2 }]);
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Routine' })).toHaveAttribute('aria-selected', 'true');
  await expect(cards(page)).toHaveCount(2);
  await expect(page.getByLabel(/Exercise name/)).toHaveCount(0); // no editing form on the tab itself
  await expect(cards(page).first()).toContainText('Leg day');
  await expect(cards(page).first()).toContainText('3 exercises · 3 rounds · 8:15'); // 3 x (30+10+30+10+45) + 2 x 60
  await expect(cards(page).first()).toContainText('Squats, Lunges, Plank');
  await expect(page.getByRole('button', { name: /New routine/ })).toBeVisible();
});

test('Start on a card begins immediately, without opening the editor', async ({ page }) => {
  await seedRoutines(page, [LEG_DAY, { id: 'core', name: 'Core', exercises: [{ name: 'Crunches' }] }]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start Core' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.running')).toBeVisible();
  await expect(page.locator('.runName')).toHaveText('Crunches');
});

test('tapping the card opens the editor; Save updates the card in place', async ({ page }) => {
  await seedRoutines(page, [LEG_DAY]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit routine: Leg day' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit routine' });
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel('Routine name')).toHaveValue('Leg day');
  await expect(editor.getByLabel('Exercise name 2')).toHaveValue('Lunges');
  await editor.getByLabel('Routine name').fill('Leg day heavy');
  await editor.getByRole('button', { name: 'Rounds +1' }).click(); // 4 rounds
  await editor.getByRole('group', { name: 'Rest between exercises' }).getByRole('button', { name: '20s' }).click();
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(cards(page)).toHaveCount(1); // replaced, not duplicated
  await expect(cards(page)).toContainText('Leg day heavy');
  await expect(cards(page)).toContainText('4 rounds');
  await page.reload();
  await expect(cards(page)).toContainText('Leg day heavy');
  await page.getByRole('button', { name: 'Edit routine: Leg day heavy' }).click();
  await expect(page.getByRole('group', { name: 'Rest between exercises' }).getByRole('button', { name: '20s' })).toHaveAttribute('aria-pressed', 'true');
});

test('New routine: create, save, it appears first and survives a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Routine' }).click();
  await expect(page.getByTestId('no-routines')).toBeVisible();
  await page.getByRole('button', { name: /New routine/ }).click();
  const editor = page.getByRole('dialog', { name: 'New routine' });
  await expect(editor.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0); // nothing to delete yet
  await editor.getByLabel('Routine name').fill('Morning');
  await editor.getByLabel('Exercise name 1').fill('Squats');
  await editor.getByRole('button', { name: /Add exercise/ }).click();
  await expect(editor.getByLabel(/Exercise name \d/)).toHaveCount(4);
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page)).toContainText('4 exercises');

  await page.getByRole('button', { name: /New routine/ }).click();
  await page.getByLabel('Routine name').fill('Evening');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(cards(page)).toHaveCount(2);
  await expect(cards(page).first()).toContainText('Evening'); // newest on top
  await page.reload();
  await expect(cards(page)).toHaveCount(2);
});

test('Save and start saves and begins the workout', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Routine' }).click();
  await page.getByRole('button', { name: /New routine/ }).click();
  await page.getByLabel('Routine name').fill('Go now');
  await page.getByLabel('Exercise name 1').fill('Burpees');
  await page.getByRole('button', { name: 'Save and start' }).click();
  await expect(page.locator('.running')).toBeVisible();
  await page.getByRole('button', { name: 'End', exact: true }).click();
  await page.getByRole('button', { name: 'End workout' }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page)).toContainText('Go now');
});

test('closing with unsaved changes asks; closing a clean editor does not', async ({ page }) => {
  await seedRoutines(page, [LEG_DAY]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit routine: Leg day' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).first().click(); // clean: closes at once
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Edit routine: Leg day' }).click();
  await page.getByLabel('Routine name').fill('Changed');
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  const ask = page.getByRole('dialog', { name: 'Discard changes?' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByLabel('Routine name')).toHaveValue('Changed'); // still there
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  await page.getByRole('dialog', { name: 'Discard changes?' }).getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(cards(page)).toContainText('Leg day'); // original untouched
});

test('Escape closes only the top popup', async ({ page }) => {
  await seedRoutines(page, [LEG_DAY]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit routine: Leg day' }).click();
  await page.getByRole('button', { name: /Squats: 30s/ }).click(); // opens the number pad on top of the editor
  await expect(page.getByRole('dialog')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: 'Edit routine' })).toBeVisible();
});

test('editing a time inside the editor works (number pad on top of the editor)', async ({ page }) => {
  await seedRoutines(page, [LEG_DAY]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit routine: Leg day' }).click();
  await page.getByRole('button', { name: /Squats: 30s/ }).click();
  const pad = page.getByRole('dialog', { name: /Set time/ });
  await pad.getByRole('button', { name: 'Delete digit' }).click();
  await pad.getByRole('button', { name: 'Delete digit' }).click();
  for (const k of ['4', '5']) await pad.getByRole('button', { name: k, exact: true }).click();
  await pad.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: /Squats: 45s/ })).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(cards(page)).toContainText('9:00'); // 8:15 + 15 s x 3 rounds
});

test('Quick tab is unchanged: form plus the Start bar', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  await expect(page.getByLabel('Exercise', { exact: true })).toBeVisible();
});

test('typing a whole word in the editor keeps the cursor in the field', async ({ page }) => {
  await seedRoutines(page, [LEG_DAY]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit routine: Leg day' }).click();
  const name = page.getByLabel('Routine name');
  await name.fill('');
  await name.pressSequentially('Heavy legs', { delay: 30 }); // real key presses, one at a time
  await expect(name).toHaveValue('Heavy legs');
  await expect(name).toBeFocused();
  const ex = page.getByLabel('Exercise name 1');
  await ex.fill('');
  await ex.pressSequentially('Goblet squats', { delay: 30 });
  await expect(ex).toHaveValue('Goblet squats');
  await expect(ex).toBeFocused();
});
