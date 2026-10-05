import { EXAMPLE_ROUTINES } from './examples';
import { sanitizeRoutine, defaultRoutine } from './storage';
import type { Exercise, Routine } from './types';

export interface Template {
  routine: Routine;
  /** One line shown under the name. */
  blurb: string;
}

const t = (id: string, name: string, workSec: number, extra: Partial<Exercise> = {}): Exercise => ({ id, name, workSec, kind: 'timed', ...extra });
/** Reps. With `limit` it is a timed reps set: a countdown, then the app asks how many reps were done. */
const r = (id: string, name: string, reps: number, extra: Partial<Exercise> & { limit?: number } = {}): Exercise => {
  const { limit, ...rest } = extra;
  return { id, name, workSec: limit ?? 30, kind: 'reps', reps, ...(limit ? { timed: true } : {}), ...rest };
};

const base = { prepSec: 5, warmup: [] as Exercise[], cooldown: [] as Exercise[] };

const NEW_TEMPLATES: Template[] = [
  {
    blurb: '20 s all out, 10 s rest, 8 times. Four minutes.',
    routine: {
      id: 'tpl-tabata',
      name: 'Tabata (4 minutes)',
      exercises: [t('tb1', 'All out', 20)],
      restBetweenExercisesSec: 0,
      restBetweenRoundsSec: 10,
      rounds: 8,
      ...base,
    },
  },
  {
    blurb: 'Every minute: 12 squats in 40 s, then 20 s rest. Ten minutes. Tells you when time is up.',
    routine: {
      id: 'tpl-emom',
      name: 'EMOM 10 squats',
      exercises: [r('em1', 'Squats', 12, { limit: 40, restAfterSec: 20 })],
      restBetweenExercisesSec: 0,
      restBetweenRoundsSec: 20,
      rounds: 10,
      ...base,
    },
  },
  {
    blurb: 'Twelve bodyweight moves, 30 s each. The classic seven minutes.',
    routine: {
      id: 'tpl-seven',
      name: '7-minute workout',
      exercises: [
        t('s1', 'Jumping jacks', 30),
        t('s2', 'Wall sit', 30),
        t('s3', 'Push-ups', 30),
        t('s4', 'Crunches', 30),
        t('s5', 'Step-ups', 30),
        t('s6', 'Squats', 30),
        t('s7', 'Chair dips', 30),
        t('s8', 'Plank', 30),
        t('s9', 'High knees', 30),
        t('s10', 'Lunges', 30),
        t('s11', 'Push-up and rotate', 30),
        t('s12', 'Side plank', 30),
      ],
      restBetweenExercisesSec: 10,
      restBetweenRoundsSec: 60,
      rounds: 1,
      ...base,
    },
  },
  {
    blurb: 'Push, pull and core back to back, rest, three times. A superset of three.',
    routine: {
      id: 'tpl-superset',
      name: 'Push, pull, core superset',
      exercises: [
        r('ss1', 'Push-ups', 10, { group: 'tpl-ss', sets: 3 }),
        r('ss2', 'Inverted rows', 10, { group: 'tpl-ss' }),
        t('ss3', 'Plank', 30, { group: 'tpl-ss' }),
      ],
      restBetweenExercisesSec: 60,
      restBetweenRoundsSec: 60,
      rounds: 1,
      ...base,
    },
  },
  {
    blurb: 'Push-ups 5, 10, 15, 10, 5. Climb up and come back down.',
    routine: {
      id: 'tpl-pyramid',
      name: 'Push-up pyramid',
      exercises: [r('py1', 'Push-ups (5)', 5), r('py2', 'Push-ups (10)', 10), r('py3', 'Push-ups (15)', 15), r('py4', 'Push-ups (10) ', 10), r('py5', 'Push-ups (5) ', 5)],
      restBetweenExercisesSec: 45,
      restBetweenRoundsSec: 60,
      rounds: 1,
      ...base,
    },
  },
  {
    blurb: 'Alternate 60 s running and 90 s walking, eight times, with a walk to warm up and cool down.',
    routine: {
      id: 'tpl-c25k',
      name: 'Couch to 5k: week 1',
      exercises: [t('c1', 'Run', 60), t('c2', 'Walk', 90)],
      restBetweenExercisesSec: 0,
      restBetweenRoundsSec: 0,
      rounds: 8,
      prepSec: 5,
      warmup: [t('cw', 'Brisk walk', 300)],
      cooldown: [t('cc', 'Easy walk', 300)],
    },
  },
  {
    blurb: 'Gentle stretches, 30 s each. Good after any workout or on a rest day.',
    routine: {
      id: 'tpl-stretch',
      name: 'Stretch and mobility',
      exercises: [t('m1', 'Cat-cow', 30), t('m2', 'Hip flexor stretch', 30), t('m3', 'Hamstring stretch', 30), t('m4', 'Shoulder circles', 30), t("m5", "Child's pose", 45)],
      restBetweenExercisesSec: 5,
      restBetweenRoundsSec: 15,
      rounds: 1,
      ...base,
    },
  },
  {
    blurb: 'Max reps in 45 s of squats, then log how many you did. Beat it next time.',
    routine: {
      id: 'tpl-amrap',
      name: 'Squat challenge',
      exercises: [r('am1', 'Squats', 30, { limit: 45 })],
      restBetweenExercisesSec: 0,
      restBetweenRoundsSec: 60,
      rounds: 3,
      ...base,
    },
  },
];

const EXAMPLE_BLURBS: Record<string, string> = {
  'example-full-body': 'Squats, push-ups, lunges and plank with a warm-up and a stretch.',
  'example-core': 'Four core moves, three rounds, about ten minutes.',
  'example-pull': 'Pull-ups and dead hangs for a strong back.',
};

/** Everything in the starter library: the three original examples plus the new routines. */
export const TEMPLATES: Template[] = [...NEW_TEMPLATES, ...EXAMPLE_ROUTINES.map((routine) => ({ routine, blurb: EXAMPLE_BLURBS[routine.id] ?? '' }))];

/** A fresh, validated copy of a template to put in the user's routines (fixed id: adding twice never duplicates). */
export function templateCopy(tpl: Template): Routine {
  return sanitizeRoutine(JSON.parse(JSON.stringify(tpl.routine)), defaultRoutine());
}

/** Today's suggestion: one template per local calendar day (the day number comes from the local date,
 * so it changes at local midnight). If that one is already saved, the next unsaved one. Null when all are saved. */
export function templateOfDay(saved: Routine[], now: Date): Template | null {
  const day = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
  for (let k = 0; k < TEMPLATES.length; k++) {
    const tpl = TEMPLATES[(day + k) % TEMPLATES.length];
    if (!saved.some((x) => x.id === tpl.routine.id)) return tpl;
  }
  return null;
}
