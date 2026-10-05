import type { Exercise, Routine, Section, Step } from './types';

/** Flatten a routine into the exact sequence of countdowns to run.
 * Rules: optional get-ready first; a short rest between exercises inside a
 * round; a longer rest between rounds; never a rest after the very last
 * work step. A rest of 0 seconds is skipped entirely. */
/** Rough seconds per rep, only used for the "total" estimate of rep sets. */
export const SEC_PER_REP_ESTIMATE = 3;
/** Rough seconds per km or mile (a 6 minute pace), only for the "total" estimate of distance sets. */
export const SEC_PER_DISTANCE_ESTIMATE = 360;

function workStep(ex: Exercise, round: number, exerciseIndex: number, section?: Section): Step {
  const base: Step = { kind: 'work', durationSec: ex.workSec, label: ex.name, round, exerciseIndex };
  if (ex.kind === 'reps') {
    const reps = ex.reps ?? 10;
    base.durationSec = reps * SEC_PER_REP_ESTIMATE;
    base.reps = reps;
  }
  if (ex.kind === 'distance') {
    const distance = ex.distance ?? 5;
    base.durationSec = Math.round(distance * SEC_PER_DISTANCE_ESTIMATE);
    base.distance = distance;
  }
  if (section) base.section = section;
  if (ex.weight !== undefined && ex.weight > 0) base.weight = ex.weight;
  return base;
}

export function buildSteps(r: Routine): Step[] {
  const steps: Step[] = [];
  if (r.prepSec > 0) {
    steps.push({ kind: 'prep', durationSec: r.prepSec, label: 'Get ready', round: 0, exerciseIndex: -1 });
  }
  const betweenSec = r.restBetweenExercisesSec;
  const rest = (round: number): Step => ({ kind: 'rest', durationSec: betweenSec, label: 'Rest', round, exerciseIndex: -1 });

  // A block of exercises (warm-up or cool-down): short rests between them.
  const block = (list: Exercise[] | undefined, section: Section, round: number) => {
    (list ?? []).forEach((ex, i, all) => {
      steps.push(workStep(ex, round, i, section));
      if (i < all.length - 1 && betweenSec > 0) steps.push(rest(round));
    });
  };

  block(r.warmup, 'warmup', 0);
  if (r.warmup?.length && betweenSec > 0) steps.push(rest(0));

  const lastExercise = r.exercises.length - 1;
  for (let round = 1; round <= r.rounds; round++) {
    r.exercises.forEach((ex, i) => {
      steps.push(workStep(ex, round, i));
      if (i < lastExercise) {
        if (betweenSec > 0) steps.push(rest(round));
      } else if (round < r.rounds && r.restBetweenRoundsSec > 0) {
        steps.push({ kind: 'roundRest', durationSec: r.restBetweenRoundsSec, label: 'Rest', round, exerciseIndex: -1 });
      }
    });
  }

  if (r.cooldown?.length) {
    if (betweenSec > 0) steps.push(rest(r.rounds));
    block(r.cooldown, 'cooldown', r.rounds);
  }
  return steps;
}

export function hasRepSets(steps: Step[]): boolean {
  return steps.some((s) => s.reps !== undefined || s.distance !== undefined);
}

export function totalSeconds(steps: Step[]): number {
  return steps.reduce((sum, s) => sum + s.durationSec, 0);
}

/** "1:05" style; used for the big countdown and totals. */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

/** Short human form for chips: 30s, 1m, 1m 30s. */
export function formatShort(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}

/** The next work step after index (for "up next"), or undefined. */
export function nextWorkStep(steps: Step[], index: number): Step | undefined {
  for (let i = index + 1; i < steps.length; i++) if (steps[i].kind === 'work') return steps[i];
  return undefined;
}
