import type { Exercise, Routine } from './types';

const t = (id: string, name: string, workSec: number): Exercise => ({ id, name, workSec, kind: 'timed', reps: 10 });
const r = (id: string, name: string, reps: number): Exercise => ({ id, name, workSec: 30, kind: 'reps', reps });

/** Starter routines for people who open the app for the first time.
 * Fixed ids, so adding them twice never duplicates them. */
export const EXAMPLE_ROUTINES: Routine[] = [
  {
    id: 'example-full-body',
    name: 'Full body starter',
    exercises: [t('fb1', 'Squats', 40), r('fb2', 'Push-ups', 10), t('fb3', 'Lunges', 40), t('fb4', 'Plank', 30)],
    restBetweenExercisesSec: 15,
    restBetweenRoundsSec: 60,
    rounds: 3,
    prepSec: 5,
    warmup: [t('fb0', 'Jumping jacks', 30)],
    cooldown: [t('fb5', 'Stretch', 45)],
  },
  {
    id: 'example-core',
    name: 'Core 10 minutes',
    exercises: [t('c1', 'Plank', 45), t('c2', 'Crunches', 40), t('c3', 'Bicycle crunches', 40), t('c4', 'Mountain climbers', 30)],
    restBetweenExercisesSec: 10,
    restBetweenRoundsSec: 45,
    rounds: 3,
    prepSec: 5,
    warmup: [],
    cooldown: [t('c5', "Child's pose", 30)],
  },
  {
    id: 'example-pull',
    name: 'Pull day',
    exercises: [r('p1', 'Pull-ups', 8), t('p2', 'Dead hang', 20)],
    restBetweenExercisesSec: 20,
    restBetweenRoundsSec: 120,
    rounds: 4,
    prepSec: 5,
    warmup: [],
    cooldown: [],
  },
];

/** The saved list with any missing examples added at the end. */
export function withExamples(saved: Routine[], max: number): Routine[] {
  const have = new Set(saved.map((x) => x.id));
  return [...saved, ...EXAMPLE_ROUTINES.filter((e) => !have.has(e.id))].slice(0, max);
}
