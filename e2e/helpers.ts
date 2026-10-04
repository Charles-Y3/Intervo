import type { Page } from '@playwright/test';

export interface SeedExercise {
  name: string;
  workSec?: number;
  kind?: 'timed' | 'reps';
  reps?: number;
}

export interface SeedRoutine {
  id: string;
  name: string;
  exercises: SeedExercise[];
  restBetweenExercisesSec?: number;
  restBetweenRoundsSec?: number;
  rounds?: number;
  prepSec?: number;
}

/** Put routines in the phone's saved list before the app loads (only if none yet,
 * so deletes survive a reload) and open on the Routine tab. */
export async function seedRoutines(page: Page, routines: SeedRoutine[]) {
  await page.addInitScript((list) => {
    if (localStorage.getItem('intervo:saved') !== null) return;
    localStorage.setItem(
      'intervo:saved',
      JSON.stringify(
        list.map((r) => ({
          restBetweenExercisesSec: 10,
          restBetweenRoundsSec: 60,
          rounds: 2,
          prepSec: 0,
          ...r,
          exercises: r.exercises.map((e, i) => ({ id: `${r.id}-${i}`, workSec: 30, kind: 'timed', reps: 10, ...e })),
        })),
      ),
    );
    localStorage.setItem('intervo:state', JSON.stringify({ mode: 'routine' }));
  }, routines);
}

export const LEG_DAY: SeedRoutine = {
  id: 'leg',
  name: 'Leg day',
  exercises: [{ name: 'Squats' }, { name: 'Lunges' }, { name: 'Plank', workSec: 45 }],
  rounds: 3,
};
