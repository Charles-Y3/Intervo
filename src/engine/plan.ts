import type { Routine, Step } from './types';

/** Flatten a routine into the exact sequence of countdowns to run.
 * Rules: optional get-ready first; a short rest between exercises inside a
 * round; a longer rest between rounds; never a rest after the very last
 * work step. A rest of 0 seconds is skipped entirely. */
export function buildSteps(r: Routine): Step[] {
  const steps: Step[] = [];
  if (r.prepSec > 0) {
    steps.push({ kind: 'prep', durationSec: r.prepSec, label: 'Get ready', round: 0, exerciseIndex: -1 });
  }
  const lastExercise = r.exercises.length - 1;
  for (let round = 1; round <= r.rounds; round++) {
    r.exercises.forEach((ex, i) => {
      steps.push({ kind: 'work', durationSec: ex.workSec, label: ex.name, round, exerciseIndex: i });
      if (i < lastExercise) {
        if (r.restBetweenExercisesSec > 0) {
          steps.push({ kind: 'rest', durationSec: r.restBetweenExercisesSec, label: 'Rest', round, exerciseIndex: -1 });
        }
      } else if (round < r.rounds && r.restBetweenRoundsSec > 0) {
        steps.push({ kind: 'roundRest', durationSec: r.restBetweenRoundsSec, label: 'Rest', round, exerciseIndex: -1 });
      }
    });
  }
  return steps;
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
