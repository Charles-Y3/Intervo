import { LIMITS } from './types';
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
    base.reps = reps;
    if (ex.timed === true) {
      // Reps against the clock: a real countdown, then the app asks how many reps were done.
      base.timedSec = ex.workSec;
    } else {
      base.durationSec = reps * SEC_PER_REP_ESTIMATE;
    }
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

export interface ExerciseBlock {
  from: number;
  /** Inclusive. */
  to: number;
  /** Two or more neighbours sharing a group id. */
  superset: boolean;
}

/** Split a list into single exercises and supersets (runs of 2+ neighbours with the same group id). */
export function exerciseBlocks(list: Exercise[]): ExerciseBlock[] {
  const blocks: ExerciseBlock[] = [];
  let i = 0;
  while (i < list.length) {
    let j = i;
    const g = list[i].group;
    if (g) while (j + 1 < list.length && list[j + 1].group === g) j++;
    blocks.push({ from: i, to: j, superset: j > i });
    i = j + 1;
  }
  return blocks;
}

/** How many times a superset is played per round (stored on its first exercise). */
export function groupSets(list: Exercise[], block: ExerciseBlock): number {
  if (!block.superset) return 1;
  const n = Math.round(list[block.from].sets ?? 1);
  return Math.min(LIMITS.maxSets, Math.max(1, Number.isFinite(n) ? n : 1));
}

export function buildSteps(r: Routine): Step[] {
  const steps: Step[] = [];
  if (r.prepSec > 0) {
    steps.push({ kind: 'prep', durationSec: r.prepSec, label: 'Get ready', round: 0, exerciseIndex: -1 });
  }
  const betweenSec = r.restBetweenExercisesSec;
  const rest = (sec: number, round: number, kind: 'rest' | 'roundRest' = 'rest', setId?: number): void => {
    if (sec <= 0) return;
    const st: Step = { kind, durationSec: sec, label: 'Rest', round, exerciseIndex: -1 };
    if (setId !== undefined) st.setId = setId;
    steps.push(st);
  };

  // A block of exercises (warm-up or cool-down): short rests between them.
  const block = (list: Exercise[] | undefined, section: Section, round: number) => {
    (list ?? []).forEach((ex, i, all) => {
      steps.push(workStep(ex, round, i, section));
      if (i < all.length - 1) rest(ex.restAfterSec ?? betweenSec, round);
    });
  };

  block(r.warmup, 'warmup', 0);
  if (r.warmup?.length) rest(r.warmup[r.warmup.length - 1].restAfterSec ?? betweenSec, 0);

  const blocks = exerciseBlocks(r.exercises);
  let setCounter = 0;
  for (let round = 1; round <= r.rounds; round++) {
    blocks.forEach((b, bi) => {
      const members = r.exercises.slice(b.from, b.to + 1);
      const sets = groupSets(r.exercises, b);
      const lastBlock = bi === blocks.length - 1;
      for (let set = 1; set <= sets; set++) {
        const setId = b.superset ? ++setCounter : undefined;
        members.forEach((ex, mi) => {
          const st = workStep(ex, round, b.from + mi);
          if (setId !== undefined) st.setId = setId;
          steps.push(st);
          if (mi < members.length - 1) {
            // Inside a superset the exercises follow each other; rest only if asked for.
            rest(ex.restAfterSec ?? 0, round, 'rest', setId);
          } else if (set < sets) {
            rest(ex.restAfterSec ?? betweenSec, round);
          } else if (!lastBlock) {
            rest(ex.restAfterSec ?? betweenSec, round);
          } else if (round < r.rounds) {
            rest(ex.restAfterSec ?? r.restBetweenRoundsSec, round, 'roundRest');
          }
        });
      }
    });
  }

  if (r.cooldown?.length) {
    const lastMain = r.exercises[r.exercises.length - 1];
    rest(lastMain?.restAfterSec ?? betweenSec, r.rounds);
    block(r.cooldown, 'cooldown', r.rounds);
  }
  return steps;
}

export function hasRepSets(steps: Step[]): boolean {
  return steps.some((s) => (s.reps !== undefined || s.distance !== undefined) && s.timedSec === undefined);
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

/** Words for the speech engine: "2m" is read as "two meters", so say "2 minutes" instead. */
export function formatSpoken(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  const parts: string[] = [];
  if (m > 0) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`);
  if (rem > 0 || m === 0) parts.push(`${rem} ${rem === 1 ? 'second' : 'seconds'}`);
  return parts.join(' ');
}

/** The next work step after index (for "up next"), or undefined. */
export function nextWorkStep(steps: Step[], index: number): Step | undefined {
  for (let i = index + 1; i < steps.length; i++) if (steps[i].kind === 'work') return steps[i];
  return undefined;
}
