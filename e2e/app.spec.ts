import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedRoutines } from './helpers';

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

test('routine runs exercises in rotation with rest between', async ({ page }) => {
  await seedRoutines(page, [{ id: 'r', name: 'Pair', exercises: [{ name: 'Squats' }, { name: 'Lunges' }] }]);
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: 'Start Pair' }).click();
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
  await expect(page.getByRole('tab', { name: 'Routine' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('no-routines')).toBeVisible();
  await expect(page.getByRole('button', { name: /New routine/ })).toBeVisible();
});

test('settings: sound mode and theme persist', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Silent' }).click();
  await page.getByRole('tab', { name: 'General' }).click();
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

// Records what the app asks the phone to say, with fake voices installed.
async function spySpeech(page: Page) {
  await page.addInitScript(() => {
    const spoken: { text: string; voice: string | null }[] = [];
    const voices = [
      { name: 'Daniel', lang: 'en-GB', voiceURI: 'Daniel' },
      { name: 'Samantha', lang: 'en-US', voiceURI: 'Samantha' },
      { name: 'Amelie', lang: 'fr-CA', voiceURI: 'Amelie' },
    ];
    (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
      voice: { name: string } | null = null;
      constructor(public text: string) {}
    };
    const synth = window.speechSynthesis as unknown as Record<string, unknown>;
    synth.getVoices = () => voices;
    synth.cancel = () => undefined;
    synth.speak = (u: { text: string; voice: { name: string } | null }) => {
      spoken.push({ text: u.text, voice: u.voice ? u.voice.name : null });
    };
    (window as unknown as { __spoken: typeof spoken }).__spoken = spoken;
  });
}
const said = (page: Page) =>
  page.evaluate(() => (window as unknown as { __spoken: { text: string; voice: string | null }[] }).__spoken.filter((s) => s.text.trim() !== ''));

test('settings: choosing a female voice speaks with a female voice, male with a male one', async ({ page }) => {
  await spySpeech(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('group', { name: 'Voice', exact: true }).getByRole('button', { name: 'Female' }).click();
  expect((await said(page)).at(-1)).toEqual({ text: 'Round one. Squats. Go', voice: 'Samantha' });
  await page.getByRole('group', { name: 'Voice', exact: true }).getByRole('button', { name: 'Male', exact: true }).click();
  expect((await said(page)).at(-1)?.voice).toBe('Daniel');
  await page.getByRole('combobox', { name: 'Choose a specific voice' }).selectOption('Samantha');
  expect((await said(page)).at(-1)?.voice).toBe('Samantha');
  // French voice is not offered
  await expect(page.getByRole('option', { name: /Amelie/ })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('combobox', { name: 'Choose a specific voice' })).toHaveValue('Samantha');
});

test('a workout speaks with the chosen voice', async ({ page }) => {
  await spySpeech(page);
  await page.addInitScript(() => localStorage.setItem('intervo:settings', JSON.stringify({ sound: 'voice', voicePref: 'female' })));
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(500);
  const first = (await said(page))[0];
  expect(first.voice).toBe('Samantha');
});

test('count aloud every second speaks each second during work', async ({ page }) => {
  await spySpeech(page);
  await page.addInitScript(() => localStorage.setItem('intervo:settings', JSON.stringify({ sound: 'voice', countAloud: 'every' })));
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('group', { name: 'Work' }).getByRole('button', { name: '10s' }).click();
  await page.getByRole('group', { name: 'Get ready' }).getByRole('button', { name: 'None' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(6_000);
  const texts = (await said(page)).map((s) => s.text);
  expect(texts[0]).toBe('Work. Go');
  expect(texts).toEqual(expect.arrayContaining(['8', '7', '6', '5', '4']));
  expect(texts).not.toContain('9'); // first 2 s are left for the announcement
});

test('default "last 3 seconds" does not count every second', async ({ page }) => {
  await spySpeech(page);
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('group', { name: 'Work' }).getByRole('button', { name: '10s' }).click();
  await page.getByRole('group', { name: 'Get ready' }).getByRole('button', { name: 'None' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(6_000);
  expect((await said(page)).map((s) => s.text)).toEqual(['Work. Go']);
  await page.clock.runFor(3_500);
  expect((await said(page)).map((s) => s.text)).toEqual(['Work. Go', '3', '2', '1']);
});

test('settings are split into tabs; each tab shows only its own controls', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const tabs = page.getByRole('tablist', { name: 'Settings sections' });
  await expect(tabs.getByRole('tab')).toHaveText(['Sound', 'Workout', 'Reminders', 'General']);
  await expect(tabs.getByRole('tab', { name: 'Sound' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('group', { name: 'Sound', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Theme' })).toHaveCount(0);
  await tabs.getByRole('tab', { name: 'Workout' }).click();
  await expect(page.getByRole('group', { name: 'Weekly goal' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Weight unit' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Sound', exact: true })).toHaveCount(0);
  await tabs.getByRole('tab', { name: 'Reminders' }).click();
  await expect(page.getByTestId('reminders')).toBeVisible();
  await tabs.getByRole('tab', { name: 'General' }).click();
  await expect(page.getByRole('group', { name: 'Theme' })).toBeVisible();
  await expect(page.getByLabel('Backup file')).toBeAttached();
  await expect(page.getByTestId('reminders')).toHaveCount(0);
});
