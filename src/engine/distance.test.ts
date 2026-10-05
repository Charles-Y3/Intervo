import { describe, expect, it } from 'vitest';
import { cueFor } from './cues';
import { NO_FILTERS, bucketize, buildEntry, hasDistanceData, sanitizeHistory, summarize } from './history';
import type { HistoryEntry } from './history';
import { SEC_PER_DISTANCE_ESTIMATE, buildSteps, hasRepSets } from './plan';
import { Runner } from './runner';
import { DEFAULT_SETTINGS, clampDistance, defaultQuick, sanitizeRoutine, sanitizeSettings } from './storage';
import type { Routine, Settings } from './types';

const run5k: Routine = {
  id: 'run',
  name: 'Run day',
  exercises: [
    { id: 'a', name: 'Run', workSec: 30, kind: 'distance', distance: 5 },
    { id: 'b', name: 'Plank', workSec: 30 },
  ],
  restBetweenExercisesSec: 10,
  restBetweenRoundsSec: 60,
  rounds: 1,
  prepSec: 0,
};

function start(r = run5k) {
  let t = 0;
  const runner = new Runner(buildSteps(r), () => t);
  runner.start();
  return { runner, advance: (ms: number) => (t += ms) };
}

describe('distance sets in the plan', () => {
  it('become untimed steps with an estimated length', () => {
    const steps = buildSteps(run5k);
    expect(steps[0]).toMatchObject({ kind: 'work', label: 'Run', distance: 5, durationSec: 5 * SEC_PER_DISTANCE_ESTIMATE });
    expect(steps[0].reps).toBeUndefined();
    expect(hasRepSets(steps)).toBe(true); // the total is an estimate
    expect(hasRepSets(buildSteps({ ...run5k, exercises: [run5k.exercises[1]] }))).toBe(false);
  });
});

describe('Runner with a distance set', () => {
  it('never times out and has no countdown', () => {
    const { runner, advance } = start();
    const ev = [];
    for (let i = 0; i < 50; i++) {
      advance(60_000);
      ev.push(...runner.tick());
    }
    expect(runner.untimed).toBe(true);
    expect(runner.index).toBe(0);
    expect(ev).toEqual([]);
  });

  it('Done logs the confirmed distance with two decimals and the time taken', () => {
    const { runner, advance } = start();
    advance(1_680_000); // 28 min
    expect(runner.completeSet(4.876)).toEqual([{ type: 'stepStart', index: 1 }]);
    const w = runner.result().work[0];
    expect(w).toMatchObject({ name: 'Run', targetDistance: 5, distance: 4.88, complete: true, reps: 0, targetReps: 0 });
    expect(w.sec).toBeCloseTo(1680, 0);
  });

  it('skip records no distance; a negative amount is floored at 0', () => {
    const a = start();
    a.advance(5_000);
    a.runner.skip();
    expect(a.runner.result().work[0]).toMatchObject({ distance: 0, complete: false });
    const b = start();
    b.runner.completeSet(-3);
    expect(b.runner.result().work[0].distance).toBe(0);
  });

  it('a timed set is unaffected, and a reps amount is still whole', () => {
    const { runner } = start({ ...run5k, exercises: [{ id: 'r', name: 'Pull-ups', workSec: 30, kind: 'reps', reps: 8 }] });
    runner.completeSet(7.6);
    expect(runner.result().work[0]).toMatchObject({ reps: 8, distance: 0, targetDistance: 0 });
  });
});

describe('cues for distance', () => {
  const s = (over: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...over });
  const steps = buildSteps(run5k);
  it('says the distance in the chosen unit, singular for one', () => {
    expect(cueFor({ type: 'stepStart', index: 0 }, steps, s({}))?.speech).toBe('Run. 5 kilometers. Go');
    expect(cueFor({ type: 'stepStart', index: 0 }, steps, s({ distanceUnit: 'mi' }))?.speech).toBe('Run. 5 miles. Go');
    const one = buildSteps({ ...run5k, exercises: [{ id: 'a', name: 'Walk', workSec: 30, kind: 'distance', distance: 1 }] });
    expect(cueFor({ type: 'stepStart', index: 0 }, one, s({}))?.speech).toBe('Walk. 1 kilometer. Go');
    expect(cueFor({ type: 'stepStart', index: 0 }, one, s({ distanceUnit: 'mi' }))?.speech).toBe('Walk. 1 mile. Go');
  });
});

describe('logging distance and pace', () => {
  const entry = (id: string, day: number, distance: number, distanceSec: number): HistoryEntry => ({
    id, routineId: 'run', unit: 'kg', distUnit: 'km', note: '', at: new Date(2026, 9, day, 7).getTime(), routineName: 'Run day',
    mode: 'routine', rounds: 1, roundsDone: 1, totalSec: distanceSec, workSec: distanceSec, completed: true,
    exercises: [{ name: 'Run', sets: 1, workSec: distanceSec, longestSec: 0, reps: 0, bestReps: 0, weight: 0, distance, distanceSec }],
  });

  it('only completed distance sets count toward pace time', () => {
    const { runner, advance } = start({ ...run5k, rounds: 2, exercises: [run5k.exercises[0]] });
    advance(1_800_000);
    runner.completeSet(5); // 5 km in 30 min
    runner.skip(); // rest
    advance(600_000);
    runner.skip(); // second run skipped after 10 min
    const e = buildEntry(run5k, runner.result(), 2400, false, Date.UTC(2026, 9, 5), 'kg', 'mi');
    expect(e.exercises[0]).toMatchObject({ distance: 5, distanceSec: 1800, sets: 1 });
    expect(e.distUnit).toBe('mi');
    expect(hasDistanceData([e])).toBe(true);
  });

  it('charts total distance and average pace per period', () => {
    const list = [entry('1', 1, 5, 1800), entry('2', 2, 5, 1500), entry('3', 9, 10, 3000)];
    expect(bucketize(list, NO_FILTERS, 'week', 'distance').map((b) => b.value)).toEqual([10, 10]);
    // week 1: 10 km in 3300 s = 330 s/km; week 2: 300 s/km
    expect(bucketize(list, NO_FILTERS, 'week', 'pace').map((b) => b.value)).toEqual([330, 300]);
    expect(summarize(list, '').distance).toBe(20);
  });

  it('pace is 0 (not a division error) for periods with no running', () => {
    const none = { ...entry('x', 1, 0, 0) };
    expect(bucketize([none], NO_FILTERS, 'day', 'pace').map((b) => b.value)).toEqual([0]);
    expect(hasDistanceData([none])).toBe(false);
  });
});

describe('stored distance values are untrusted', () => {
  it('clamps', () => {
    expect(clampDistance(5.255, 1)).toBe(5.26);
    expect(clampDistance(0, 5)).toBe(5);
    expect(clampDistance(-2, 5)).toBe(5);
    expect(clampDistance('abc', 5)).toBe(5);
    expect(clampDistance(1e9, 5)).toBe(999);
    expect(clampDistance(0.001, 5)).toBe(0.01);
  });

  it('exercise kind, settings and history entries', () => {
    const r = sanitizeRoutine({ exercises: [{ name: 'Run', kind: 'distance', distance: 21.1 }, { name: 'x', kind: 'swim' }, { name: 'y', kind: 'distance', distance: 'far' }] }, defaultQuick());
    expect(r.exercises.map((e) => e.kind)).toEqual(['distance', 'timed', 'distance']);
    expect(r.exercises.map((e) => e.distance)).toEqual([21.1, 5, 5]);
    expect(sanitizeSettings({ distanceUnit: 'mi' }).distanceUnit).toBe('mi');
    expect(sanitizeSettings({ distanceUnit: 'furlong' }).distanceUnit).toBe('km');
    const [e] = sanitizeHistory([{ id: 'h', at: Date.UTC(2026, 9, 5), distUnit: 'mi', exercises: [{ name: 'Run', distance: 1e12, distanceSec: -4 }] }]);
    expect(e.distUnit).toBe('mi');
    expect(e.exercises[0]).toMatchObject({ distance: 999, distanceSec: 0 });
    expect(sanitizeHistory([{ id: 'o', at: Date.UTC(2026, 9, 5), exercises: [{ name: 'Old' }] }])[0]).toMatchObject({ distUnit: 'km', exercises: [{ distance: 0, distanceSec: 0 }] });
  });
});
