import { describe, expect, it } from 'vitest';
import { cueFor } from './cues';
import { NO_FILTERS, bucketize, buildEntry, hasRepData, sanitizeHistory, statsFor, summarize } from './history';
import type { HistoryEntry } from './history';
import { SEC_PER_REP_ESTIMATE, buildSteps, hasRepSets, totalSeconds } from './plan';
import { Runner } from './runner';
import { DEFAULT_SETTINGS, sanitizeRoutine, defaultQuick } from './storage';
import type { Routine } from './types';

const pullups: Routine = {
  id: 'r',
  name: 'Pull day',
  exercises: [
    { id: 'a', name: 'Pull-ups', workSec: 30, kind: 'reps', reps: 12 },
    { id: 'b', name: 'Plank', workSec: 30 },
  ],
  restBetweenExercisesSec: 10,
  restBetweenRoundsSec: 60,
  rounds: 2,
  prepSec: 0,
};

function run(r = pullups) {
  let t = 0;
  const runner = new Runner(buildSteps(r), () => t);
  runner.start();
  return { runner, advance: (ms: number) => (t += ms) };
}

describe('rep steps in the plan', () => {
  it('a reps exercise becomes an untimed step with an estimated length', () => {
    const steps = buildSteps(pullups);
    expect(steps[0]).toMatchObject({ kind: 'work', label: 'Pull-ups', reps: 12, durationSec: 12 * SEC_PER_REP_ESTIMATE });
    expect(steps[2].reps).toBeUndefined(); // plank stays timed
    expect(hasRepSets(steps)).toBe(true);
    expect(hasRepSets(buildSteps({ ...pullups, exercises: [pullups.exercises[1]] }))).toBe(false);
    expect(totalSeconds(steps)).toBeGreaterThan(0);
  });
});

describe('Runner with a reps set', () => {
  it('never auto-advances, has no countdown or halfway cues', () => {
    const { runner, advance } = run();
    const events = [];
    for (let i = 0; i < 100; i++) {
      advance(60_000); // 100 minutes
      events.push(...runner.tick());
    }
    expect(runner.index).toBe(0);
    expect(runner.untimed).toBe(true);
    expect(events).toEqual([]);
    expect(runner.progress()).toBe(0);
    expect(runner.elapsedSec()).toBeCloseTo(6000, 0);
  });

  it('Done logs the confirmed reps and moves to the rest', () => {
    const { runner, advance } = run();
    advance(31_000);
    const ev = runner.completeSet(10); // aimed at 12, managed 10
    expect(ev).toEqual([{ type: 'stepStart', index: 1 }]);
    expect(runner.step.kind).toBe('rest');
    const w = runner.result().work[0];
    expect(w).toMatchObject({ name: 'Pull-ups', targetReps: 12, reps: 10, complete: true });
    expect(w.sec).toBeCloseTo(31, 0);
  });

  it('skipping a reps set records no reps and is not complete', () => {
    const { runner, advance } = run();
    advance(5_000);
    runner.skip();
    const w = runner.result().work[0];
    expect(w).toMatchObject({ reps: 0, complete: false });
    expect(w.sec).toBeCloseTo(5, 0);
  });

  it('completeSet does nothing on a timed step', () => {
    const { runner } = run();
    runner.skip(); // reps set -> rest
    runner.skip(); // rest -> plank (timed)
    expect(runner.untimed).toBe(false);
    expect(runner.completeSet(5)).toEqual([]);
    expect(runner.index).toBe(2);
  });

  it('pause freezes the count-up clock', () => {
    const { runner, advance } = run();
    advance(4_000);
    runner.pause();
    advance(60_000);
    expect(runner.elapsedSec()).toBeCloseTo(4, 0);
  });

  it('back() restarts a reps set that has run over 2 s without losing the time', () => {
    const { runner, advance } = run();
    advance(9_000);
    runner.back();
    expect(runner.index).toBe(0);
    expect(runner.elapsedSec()).toBeCloseTo(0, 0);
    expect(runner.result().work[0].sec).toBeCloseTo(9, 0);
  });

  it('Done on the very last step finishes the workout', () => {
    const r: Routine = { ...pullups, exercises: [pullups.exercises[0]], rounds: 1 };
    const { runner, advance } = run(r);
    advance(20_000);
    expect(runner.completeSet(12)).toEqual([{ type: 'finish' }]);
    expect(runner.done).toBe(true);
    expect(runner.result().roundsDone).toBe(1);
  });

  it('a mixed routine runs end to end: reps, timed, rounds', () => {
    const { runner, advance } = run();
    for (let round = 0; round < 2; round++) {
      runner.completeSet(12);
      advance(10_000);
      runner.tick(); // rest ends
      advance(30_000);
      runner.tick(); // plank ends (or into round rest)
      if (round === 0) {
        advance(60_000);
        runner.tick(); // round rest ends
      }
    }
    const res = runner.result();
    expect(res.roundsDone).toBe(2);
    expect(res.work.map((w) => w.reps)).toEqual([12, 0, 12, 0]);
  });
});

describe('cues for reps', () => {
  const steps = buildSteps(pullups);
  it('says the rep count', () => {
    expect(cueFor({ type: 'stepStart', index: 0 }, steps, DEFAULT_SETTINGS)?.speech).toBe('Pull-ups. 12 reps. Go');
    const one = buildSteps({ ...pullups, exercises: [{ id: 'a', name: 'Muscle-up', workSec: 30, kind: 'reps', reps: 1 }] });
    expect(cueFor({ type: 'stepStart', index: 0 }, one, DEFAULT_SETTINGS)?.speech).toBe('Muscle-up. 1 rep. Go');
  });
});

describe('logging reps', () => {
  it('totals reps and best set across sets and rounds; only done sets count', () => {
    const { runner, advance } = run();
    advance(20_000);
    runner.completeSet(12); // round 1
    runner.skip(); // rest
    runner.skip(); // plank
    runner.skip(); // round rest
    advance(25_000);
    runner.completeSet(9); // round 2, fell short
    const e = buildEntry(pullups, runner.result(), 120, false, Date.UTC(2026, 9, 5));
    const pu = e.exercises.find((x) => x.name === 'Pull-ups')!;
    expect(pu).toMatchObject({ reps: 21, bestReps: 12, sets: 2, longestSec: 0 });
    expect(hasRepData([e])).toBe(true);
  });

  const mk = (id: string, day: number, reps: number, best: number): HistoryEntry => ({
    id,
    routineId: '',
    unit: 'kg',
    note: '',
    at: new Date(2026, 9, day, 9).getTime(),
    routineName: 'Pull day',
    mode: 'routine',
    rounds: 3,
    roundsDone: 3,
    totalSec: 300,
    workSec: 100,
    completed: true,
    exercises: [{ name: 'Pull-ups', sets: 3, workSec: 100, longestSec: 0, reps, bestReps: best, weight: 0 }],
  });
  const list = [mk('1', 1, 24, 9), mk('2', 8, 30, 11), mk('3', 15, 36, 12)];

  it('charts total reps and best set over time', () => {
    const total = bucketize(list, NO_FILTERS, 'week', 'reps');
    expect(total.map((b) => b.value)).toEqual([24, 30, 36]);
    const best = bucketize(list, { ...NO_FILTERS, exercise: 'pull-ups' }, 'week', 'bestReps');
    expect(best.map((b) => b.value)).toEqual([9, 11, 12]);
    expect(summarize(list, '').reps).toBe(90);
    expect(statsFor(list[2], 'Pull-ups').bestReps).toBe(12);
  });

  it('timed-only history offers no rep metrics', () => {
    expect(hasRepData([])).toBe(false);
  });

  it('sanitizer clamps rep fields from storage', () => {
    const [e] = sanitizeHistory([{ id: 'x', at: Date.UTC(2026, 9, 5), exercises: [{ name: 'P', reps: -4, bestReps: 1e12 }] }]);
    expect(e.exercises[0].reps).toBe(0);
    expect(e.exercises[0].bestReps).toBe(999);
  });
});

describe('exercise kind from storage', () => {
  it('defaults to timed and clamps reps', () => {
    const r = sanitizeRoutine({ exercises: [{ name: 'a' }, { name: 'b', kind: 'reps', reps: 5000 }, { name: 'c', kind: 'weird', reps: -1 }] }, defaultQuick());
    expect(r.exercises.map((e) => e.kind)).toEqual(['timed', 'reps', 'timed']);
    expect(r.exercises.map((e) => e.reps)).toEqual([10, 999, 1]);
  });
});
