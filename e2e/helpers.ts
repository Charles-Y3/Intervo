import type { Page } from '@playwright/test';

export interface SeedExercise {
  name: string;
  workSec?: number;
  kind?: 'timed' | 'reps';
  reps?: number;
  weight?: number;
}

export interface SeedRoutine {
  id: string;
  name: string;
  exercises: SeedExercise[];
  warmup?: SeedExercise[];
  cooldown?: SeedExercise[];
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
    const ex = (id: string, e: object, i: number) => ({ id: `${id}-${i}`, workSec: 30, kind: 'timed', reps: 10, ...e });
    localStorage.setItem(
      'intervo:saved',
      JSON.stringify(
        list.map((r) => ({
          restBetweenExercisesSec: 10,
          restBetweenRoundsSec: 60,
          rounds: 2,
          prepSec: 0,
          ...r,
          exercises: r.exercises.map((e, i) => ex(r.id, e, i)),
          warmup: (r.warmup ?? []).map((e, i) => ex(`${r.id}-w`, e, i)),
          cooldown: (r.cooldown ?? []).map((e, i) => ex(`${r.id}-c`, e, i)),
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

export interface SeedEntry {
  id: string;
  daysAgo: number;
  routineId?: string;
  routineName: string;
  completed?: boolean;
  note?: string;
  exercises?: { name: string; sets?: number; workSec?: number; longestSec?: number; reps?: number; bestReps?: number; weight?: number }[];
}

/** Seed the workout log (only if empty). */
export async function seedHistory(page: Page, entries: SeedEntry[]) {
  await page.addInitScript((list) => {
    if (localStorage.getItem('intervo:history') !== null) return;
    const now = Date.now();
    localStorage.setItem(
      'intervo:history',
      JSON.stringify(
        list.map((e) => ({
          id: e.id,
          routineId: e.routineId ?? '',
          unit: 'kg',
          note: e.note ?? '',
          at: now - e.daysAgo * 86400000,
          routineName: e.routineName,
          mode: 'routine',
          rounds: 3,
          roundsDone: 3,
          totalSec: 600,
          workSec: 300,
          completed: e.completed ?? true,
          exercises: (e.exercises ?? []).map((x) => ({ sets: 3, workSec: 90, longestSec: 30, reps: 0, bestReps: 0, weight: 0, ...x })),
        })),
      ),
    );
  }, entries);
}
