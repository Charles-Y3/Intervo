import { describe, expect, it } from 'vitest';
import { cueFor } from './cues';
import { buildEntry } from './history';
import { buildSteps, exerciseBlocks, formatSpoken, hasRepSets } from './plan';
import { Runner } from './runner';
import { DEFAULT_SETTINGS, normalizeGroups, sanitizeRoutine, defaultRoutine } from './storage';
import { TEMPLATES, templateCopy, templateOfDay } from './templates';
import type { Exercise, Routine, Settings } from './types';

const ex = (id: string, extra: Partial<Exercise> = {}): Exercise => ({ id, name: id.toUpperCase(), workSec: 30, ...extra });
const routine = (exercises: Exercise[], extra: Partial<Routine> = {}): Routine => ({
  id: 'r',
  name: 'R',
  exercises,
  restBetweenExercisesSec: 10,
  restBetweenRoundsSec: 60,
  rounds: 1,
  prepSec: 0,
  ...extra,
});
const labels = (r: Routine) => buildSteps(r).map((s) => (s.kind === 'work' ? s.label : `~${s.durationSec}`));
const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...over });

describe('spoken durations (never "2m", which the voice reads as two meters)', () => {
  it('uses whole words', () => {
    expect(formatSpoken(120)).toBe('2 minutes');
    expect(formatSpoken(60)).toBe('1 minute');
    expect(formatSpoken(90)).toBe('1 minute 30 seconds');
    expect(formatSpoken(1)).toBe('1 second');
    expect(formatSpoken(45)).toBe('45 seconds');
  });
  it('the rest announcement says minutes, not "2m"', () => {
    const steps = buildSteps(routine([ex('a'), ex('b')], { restBetweenExercisesSec: 120 }));
    const speech = cueFor({ type: 'stepStart', index: 1 }, steps, settings())?.speech ?? '';
    expect(speech).toBe('Rest 2 minutes. Next, B');
    expect(speech).not.toMatch(/\d[ms]\b/);
  });
});

describe('per-exercise rest', () => {
  it('overrides the rest after one exercise only', () => {
    expect(labels(routine([ex('a', { restAfterSec: 45 }), ex('b'), ex('c')]))).toEqual(['A', '~45', 'B', '~10', 'C']);
  });
  it('0 means no rest at all after that exercise', () => {
    expect(labels(routine([ex('a', { restAfterSec: 0 }), ex('b')]))).toEqual(['A', 'B']);
  });
  it('the last exercise of a round overrides the rest before the next round', () => {
    expect(labels(routine([ex('a'), ex('b', { restAfterSec: 90 })], { rounds: 2 }))).toEqual(['A', '~10', 'B', '~90', 'A', '~10', 'B']);
  });
  it('warm-up exercises can override their rest too', () => {
    const r = routine([ex('m')], { warmup: [ex('w1', { restAfterSec: 25 }), ex('w2')] });
    expect(labels(r)).toEqual(['W1', '~25', 'W2', '~10', 'M']);
  });
});

describe('supersets', () => {
  const trio = [ex('a', { group: 'g', sets: 2 }), ex('b', { group: 'g' }), ex('c', { group: 'g' })];
  it('plays every exercise back to back, then rests, for the number of sets', () => {
    expect(labels(routine(trio))).toEqual(['A', 'B', 'C', '~10', 'A', 'B', 'C']);
  });
  it('rest inside the superset only when asked, rest after it comes from the last exercise', () => {
    const r = routine([ex('a', { group: 'g', sets: 2, restAfterSec: 5 }), ex('b', { group: 'g', restAfterSec: 40 })]);
    expect(labels(r)).toEqual(['A', '~5', 'B', '~40', 'A', '~5', 'B']);
  });
  it('a superset followed by a normal exercise, over two rounds', () => {
    const r = routine([ex('a', { group: 'g' }), ex('b', { group: 'g' }), ex('c')], { rounds: 2 });
    expect(labels(r)).toEqual(['A', 'B', '~10', 'C', '~60', 'A', 'B', '~10', 'C']);
  });
  it('a lone group id is just a normal exercise', () => {
    expect(exerciseBlocks([ex('a', { group: 'g' }), ex('b')]).map((b) => b.superset)).toEqual([false, false]);
    expect(labels(routine([ex('a', { group: 'g', sets: 5 }), ex('b')]))).toEqual(['A', '~10', 'B']);
  });
  it('neighbours with different groups are two supersets, not one', () => {
    const r = routine([ex('a', { group: 'x' }), ex('b', { group: 'x' }), ex('c', { group: 'y' }), ex('d', { group: 'y' })]);
    expect(exerciseBlocks(r.exercises).map((b) => [b.from, b.to])).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });
  it('steps of one pass share a set id', () => {
    const steps = buildSteps(routine(trio));
    const ids = steps.filter((s) => s.kind === 'work').map((s) => s.setId);
    expect(ids).toEqual([1, 1, 1, 2, 2, 2]);
  });
  it('Extra set repeats the whole pass, not just the last exercise', () => {
    let t = 0;
    const runner = new Runner(buildSteps(routine(trio, { rounds: 1 })), () => t);
    runner.start();
    t += 30000; // A -> B
    runner.tick();
    expect(runner.canAddExtraSet()).toBe(false); // not on a superset exercise with more to come
    for (let i = 0; i < 100 && runner.index < runner.steps.length - 1; i++) {
      t += 5000;
      runner.tick();
    }
    // now on the last step (C of pass 2)
    expect(runner.index).toBe(runner.steps.length - 1);
    const before = runner.steps.length;
    runner.addExtraSet();
    const added = runner.steps.slice(before - 1 + 1);
    const names = runner.steps.map((s) => (s.kind === 'work' ? `${s.label}${s.extra ? '+' : ''}` : '~'));
    expect(runner.steps.length).toBeGreaterThan(before);
    expect(names.slice(-4)).toEqual(['~', 'A+', 'B+', 'C+']);
    expect(added.length).toBeGreaterThan(0);
  });
  it('a rest between exercises of a pass cannot be used for Extra set', () => {
    const r = routine([ex('a', { group: 'g', restAfterSec: 10 }), ex('b', { group: 'g' })]);
    let t = 0;
    const runner = new Runner(buildSteps(r), () => t);
    runner.start();
    t += 30000;
    runner.tick();
    expect(runner.step.kind).toBe('rest');
    expect(runner.canAddExtraSet()).toBe(false);
  });
});

describe('normalizing groups from storage', () => {
  it('drops lone groups, and keeps the sets count only on the first exercise', () => {
    const out = normalizeGroups([ex('a', { group: 'g', sets: 3 }), ex('b', { group: 'g', sets: 9 }), ex('c', { group: 'h', sets: 2 })]);
    expect(out[0]).toMatchObject({ group: 'g', sets: 3 });
    expect(out[1].group).toBe('g');
    expect(out[1].sets).toBeUndefined();
    expect(out[2].group).toBeUndefined();
    expect(out[2].sets).toBeUndefined();
  });
  it('sanitizeRoutine clamps hostile values and strips groups from warm-up and cool-down', () => {
    const hostile = {
      id: 'x',
      name: 'x',
      exercises: [
        { id: 'a', name: 'A', workSec: 30, group: 'g', sets: 9999, restAfterSec: -5, timed: true },
        { id: 'b', name: 'B', workSec: 30, kind: 'reps', group: 'g', timed: true, restAfterSec: 'abc' },
        { id: 'c', name: 'C', workSec: 30, restAfterSec: 99999999 },
      ],
      warmup: [{ id: 'w', name: 'W', workSec: 20, group: 'g', sets: 4 }],
      restBetweenExercisesSec: 10,
      restBetweenRoundsSec: 10,
      rounds: 1,
      prepSec: 0,
    };
    const r = sanitizeRoutine(hostile, defaultRoutine());
    expect(r.exercises[0].sets).toBe(20); // capped
    expect(r.exercises[0].restAfterSec).toBe(0); // negative -> 0
    expect(r.exercises[0].timed).toBeUndefined(); // timed only means something for reps
    expect(r.exercises[1].timed).toBe(true);
    expect(r.exercises[1].restAfterSec).toBe(0); // garbage -> 0, never NaN
    expect(r.exercises[2].restAfterSec).toBeLessThanOrEqual(99 * 60 + 59);
    expect(r.warmup?.[0].group).toBeUndefined();
    expect(r.warmup?.[0].sets).toBeUndefined();
  });
  it('old data without the new fields is unchanged', () => {
    const old = sanitizeRoutine({ id: 'o', name: 'Old', exercises: [{ id: 'a', name: 'A', workSec: 30 }], restBetweenExercisesSec: 5, restBetweenRoundsSec: 5, rounds: 1, prepSec: 0 }, defaultRoutine());
    expect('timed' in old.exercises[0]).toBe(false);
    expect('restAfterSec' in old.exercises[0]).toBe(false);
    expect('group' in old.exercises[0]).toBe(false);
  });
});

describe('timed reps', () => {
  const timedSquats = (extra: Partial<Routine> = {}) => routine([ex('s', { kind: 'reps', reps: 12, timed: true, workSec: 40 }), ex('p')], { restBetweenExercisesSec: 0, ...extra });
  const start = (r: Routine) => {
    let t = 0;
    const runner = new Runner(buildSteps(r), () => t);
    runner.start();
    return { runner, advance: (ms: number) => (t += ms) };
  };

  it('is a step with both a target and a real countdown', () => {
    const steps = buildSteps(timedSquats());
    expect(steps[0]).toMatchObject({ reps: 12, timedSec: 40, durationSec: 40 });
    expect(hasRepSets(steps)).toBe(false); // exact length, so no "≈"
    expect(buildSteps(routine([ex('s', { kind: 'reps', reps: 12, workSec: 40 })]))[0].timedSec).toBeUndefined();
  });
  it('has a countdown (not untimed)', () => {
    const { runner } = start(timedSquats());
    expect(runner.untimed).toBe(false);
    expect(runner.remainingSec()).toBe(40);
  });
  it('when time runs out it WAITS and asks, it does not move on or log 0', () => {
    const { runner, advance } = start(timedSquats());
    advance(40_000);
    const ev = runner.tick();
    expect(ev.map((e) => e.type)).toContain('timeUp');
    expect(runner.index).toBe(0);
    expect(runner.awaitingReps).toBe(true);
    advance(120_000); // a long wait changes nothing
    expect(runner.tick().map((e) => e.type)).not.toContain('timeUp'); // asked once only
    expect(runner.index).toBe(0);
    runner.completeSet(11);
    expect(runner.index).toBe(1);
    const w = runner.result().work[0];
    expect(w).toMatchObject({ reps: 11, targetReps: 12, complete: true, plannedSec: 40 });
    expect(w.sec).toBe(40);
  });
  it('a frozen tab does not skip the question', () => {
    const { runner, advance } = start(timedSquats());
    advance(10 * 60_000);
    runner.tick();
    expect(runner.index).toBe(0);
    expect(runner.awaitingReps).toBe(true);
  });
  it('as the very last step it still waits instead of finishing the workout', () => {
    const { runner, advance } = start(routine([ex('s', { kind: 'reps', reps: 12, timed: true, workSec: 20 })]));
    advance(25_000);
    const ev = runner.tick();
    expect(ev.map((e) => e.type)).toEqual(['timeUp']);
    expect(runner.done).toBe(false);
    expect(runner.completeSet(15).map((e) => e.type)).toEqual(['finish']);
    expect(runner.result().work[0].reps).toBe(15);
  });
  it('tapping Done before time is up logs the reps and the seconds actually used', () => {
    const { runner, advance } = start(timedSquats());
    advance(25_000);
    runner.tick();
    runner.completeSet(12);
    const w = runner.result().work[0];
    expect(w.reps).toBe(12);
    expect(w.sec).toBe(25);
    expect(w.complete).toBe(true);
  });
  it('+10 s after time is up starts a fresh 10 s countdown and asks again later', () => {
    const { runner, advance } = start(timedSquats());
    advance(45_000);
    runner.tick();
    expect(runner.awaitingReps).toBe(true);
    runner.addTime(10);
    expect(runner.awaitingReps).toBe(false);
    expect(runner.remainingSec()).toBe(10);
    advance(11_000);
    expect(runner.tick().map((e) => e.type)).toContain('timeUp');
    expect(runner.index).toBe(0);
  });
  it('skipping logs 0 reps and not complete', () => {
    const { runner, advance } = start(timedSquats());
    advance(5_000);
    runner.skip();
    const w = runner.result().work[0];
    expect(w).toMatchObject({ reps: 0, complete: false });
  });
  it('the voice announces the target and the time, and asks when time is up', () => {
    const steps = buildSteps(timedSquats());
    expect(cueFor({ type: 'stepStart', index: 0 }, steps, settings())?.speech).toBe('S. 12 reps in 40 seconds. Go');
    expect(cueFor({ type: 'timeUp' }, steps, settings())?.speech).toBe('Time. How many reps did you do?');
  });
  it('feeds history like any reps set', () => {
    const { runner, advance } = start(timedSquats());
    advance(40_000);
    runner.tick();
    runner.completeSet(10);
    const entry = buildEntry(timedSquats(), runner.result(), 60, false, 0);
    expect(entry.exercises[0]).toMatchObject({ reps: 10, bestReps: 10, sets: 1 });
  });
});

describe('starter library', () => {
  it('every template survives sanitizing unchanged in shape, and plays', () => {
    const ids = new Set<string>();
    for (const tpl of TEMPLATES) {
      expect(ids.has(tpl.routine.id)).toBe(false);
      ids.add(tpl.routine.id);
      const copy = templateCopy(tpl);
      expect(copy.id).toBe(tpl.routine.id);
      expect(copy.exercises.length).toBe(tpl.routine.exercises.length);
      expect(copy.rounds).toBe(tpl.routine.rounds);
      expect(buildSteps(copy).filter((s) => s.kind === 'work').length).toBeGreaterThan(0);
      expect(tpl.blurb.length).toBeGreaterThan(5);
    }
  });
  it('templateCopy is a fresh copy: editing it never changes the library', () => {
    const tpl = TEMPLATES[0];
    const copy = templateCopy(tpl);
    copy.exercises[0].name = 'Changed';
    expect(tpl.routine.exercises[0].name).not.toBe('Changed');
  });
  it('includes timed reps and a superset, so those features are easy to find', () => {
    expect(TEMPLATES.some((t) => t.routine.exercises.some((e) => e.timed))).toBe(true);
    expect(TEMPLATES.some((t) => exerciseBlocks(templateCopy(t).exercises).some((b) => b.superset))).toBe(true);
  });
  it('Try today is the same all day, changes by date, and skips saved ones', () => {
    const morning = templateOfDay([], new Date(2026, 9, 6, 7, 0));
    const evening = templateOfDay([], new Date(2026, 9, 6, 22, 30));
    expect(morning?.routine.id).toBe(evening?.routine.id);
    const nextDay = templateOfDay([], new Date(2026, 9, 7, 7, 0));
    expect(nextDay?.routine.id).not.toBe(morning?.routine.id);
    const saved = [{ ...templateCopy(morning!) }];
    expect(templateOfDay(saved, new Date(2026, 9, 6, 7, 0))?.routine.id).not.toBe(morning?.routine.id);
  });
  it('is null once everything is saved', () => {
    expect(templateOfDay(TEMPLATES.map((t) => templateCopy(t)), new Date(2026, 9, 6))).toBeNull();
  });
});
