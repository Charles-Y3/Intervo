import { describe, expect, it } from 'vitest';
import { backupFileName, countsOf, makeBackup, mergeBackup, parseBackup } from './backup';
import type { BackupData } from './backup';
import { cueFor } from './cues';
import { EXAMPLE_ROUTINES, withExamples } from './examples';
import { buildEntry, lastDone, routineKey, routineOptions, sanitizeHistory, weeklyProgress, bucketize, hasWeightData, NO_FILTERS } from './history';
import type { HistoryEntry } from './history';
import { buildSteps, totalSeconds } from './plan';
import { Runner } from './runner';
import { DEFAULT_SETTINGS, clampWeight, defaultQuick, sanitizeAppState, sanitizeRoutine, sanitizeSettings } from './storage';
import type { Routine } from './types';

const base: Routine = {
  id: 'r1',
  name: 'Full',
  exercises: [
    { id: 'a', name: 'Squats', workSec: 30 },
    { id: 'b', name: 'Plank', workSec: 30 },
  ],
  restBetweenExercisesSec: 10,
  restBetweenRoundsSec: 60,
  rounds: 2,
  prepSec: 0,
  warmup: [
    { id: 'w1', name: 'Jacks', workSec: 20 },
    { id: 'w2', name: 'Arm circles', workSec: 20 },
  ],
  cooldown: [{ id: 'c1', name: 'Stretch', workSec: 45 }],
};

describe('warm-up and cool-down', () => {
  it('plays the warm-up first and the cool-down last, with rests between, none after the end', () => {
    const steps = buildSteps(base);
    expect(steps.map((s) => s.label)).toEqual([
      'Jacks', 'Rest', 'Arm circles', 'Rest', 'Squats', 'Rest', 'Plank', 'Rest', 'Squats', 'Rest', 'Plank', 'Rest', 'Stretch',
    ]);
    expect(steps[0]).toMatchObject({ section: 'warmup', round: 0 });
    expect(steps[steps.length - 1]).toMatchObject({ kind: 'work', section: 'cooldown' });
    expect(steps[4].section).toBeUndefined();
    expect(steps[7].kind).toBe('roundRest');
  });

  it('with no rest between exercises there are no rests around the blocks either', () => {
    const kinds = buildSteps({ ...base, restBetweenExercisesSec: 0 }).map((s) => s.kind);
    expect(kinds.filter((k) => k === 'rest')).toHaveLength(0);
  });

  it('absent or empty blocks change nothing', () => {
    const plain = buildSteps({ ...base, warmup: undefined, cooldown: [] });
    expect(plain.every((s) => !s.section)).toBe(true);
    expect(totalSeconds(plain)).toBe(2 * (30 + 10 + 30) + 60);
    expect(totalSeconds(buildSteps(base))).toBe(totalSeconds(plain) + 20 + 10 + 20 + 10 + 10 + 45);
  });

  it('rounds done ignore warm-up and cool-down', () => {
    let t = 0;
    const runner = new Runner(buildSteps(base), () => t);
    runner.start();
    t += 60 * 60 * 1000;
    runner.tick();
    const res = runner.result();
    expect(res.roundsDone).toBe(2);
    expect(res.work.filter((w) => w.section).map((w) => w.section)).toEqual(['warmup', 'warmup', 'cooldown']);
    // ended early in the warm-up: no rounds done
    t = 0;
    const early = new Runner(buildSteps(base), () => t);
    early.start();
    t += 25_000;
    early.tick();
    expect(early.result().roundsDone).toBe(0);
  });

  it('voice announces the sections', () => {
    const steps = buildSteps(base);
    expect(cueFor({ type: 'stepStart', index: 0 }, steps, DEFAULT_SETTINGS)?.speech).toBe('Warm-up. Jacks. Go');
    expect(cueFor({ type: 'stepStart', index: 2 }, steps, DEFAULT_SETTINGS)?.speech).toBe('Arm circles. Go');
    expect(cueFor({ type: 'stepStart', index: steps.length - 1 }, steps, DEFAULT_SETTINGS)?.speech).toBe('Cool-down. Stretch. Go');
  });

  it('stored blocks are clamped: max 10, non-arrays become empty', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ name: `E${i}`, workSec: 10 }));
    const r = sanitizeRoutine({ exercises: [{ name: 'a' }], warmup: many, cooldown: 'nope' }, defaultQuick());
    expect(r.warmup).toHaveLength(10);
    expect(r.cooldown).toEqual([]);
  });
});

describe('weight', () => {
  it('clamps to 0..999 with one decimal', () => {
    expect(clampWeight(-5)).toBe(0);
    expect(clampWeight('abc')).toBe(0);
    expect(clampWeight(NaN)).toBe(0);
    expect(clampWeight(1e9)).toBe(999);
    expect(clampWeight(12.34)).toBe(12.3);
    expect(clampWeight('2.5')).toBe(2.5);
  });

  it('flows from the exercise to the step, the result and the log', () => {
    const r: Routine = { ...base, warmup: [], cooldown: [], exercises: [{ id: 'a', name: 'Pull-ups', workSec: 30, kind: 'reps', reps: 8, weight: 10 }], rounds: 2 };
    expect(buildSteps(r)[0].weight).toBe(10);
    let t = 0;
    const runner = new Runner(buildSteps(r), () => t);
    runner.start();
    t += 20_000;
    runner.completeSet(8);
    expect(runner.result().work[0].weight).toBe(10);
    const e = buildEntry(r, runner.result(), 60, false, Date.UTC(2026, 9, 5), 'lb');
    expect(e.exercises[0].weight).toBe(10);
    expect(e.unit).toBe('lb');
    expect(hasWeightData([e])).toBe(true);
  });

  it('charts the heaviest weight per period', () => {
    const mk = (id: string, day: number, w: number): HistoryEntry => ({
      id, routineId: 'x', unit: 'kg', note: '', at: new Date(2026, 9, day, 9).getTime(), routineName: 'Pull', mode: 'routine', rounds: 1,
      roundsDone: 1, totalSec: 60, workSec: 30, completed: true,
      exercises: [{ name: 'Pull-ups', sets: 3, workSec: 30, longestSec: 0, reps: 24, bestReps: 8, weight: w }],
    });
    const b = bucketize([mk('1', 1, 0), mk('2', 8, 5), mk('3', 15, 7.5)], NO_FILTERS, 'week', 'weight');
    expect(b.map((x) => x.value)).toEqual([0, 5, 7.5]);
  });

  it('settings and routines carry units and weights through the sanitizers', () => {
    expect(sanitizeSettings({ units: 'lb' }).units).toBe('lb');
    expect(sanitizeSettings({ units: 'stone' }).units).toBe('kg');
    expect(sanitizeRoutine({ exercises: [{ name: 'a', weight: 7.5 }] }, defaultQuick()).exercises[0].weight).toBe(7.5);
  });
});

describe('extra set', () => {
  const r: Routine = { ...base, warmup: [], cooldown: [], rounds: 1, restBetweenExercisesSec: 10 };

  it('is offered during a rest or on the last step, not during a timed set', () => {
    let t = 0;
    const runner = new Runner(buildSteps(r), () => t);
    runner.start();
    expect(runner.canAddExtraSet()).toBe(false); // squats running
    runner.skip();
    expect(runner.canAddExtraSet()).toBe(true); // rest
    runner.skip();
    expect(runner.canAddExtraSet()).toBe(true); // plank = last step
    expect(t).toBe(0);
  });

  it('inserts the same exercise after the current rest, with its own rest', () => {
    let t = 0;
    const runner = new Runner(buildSteps(r), () => t);
    runner.start();
    runner.skip(); // in the rest after squats
    runner.addExtraSet();
    expect(runner.steps.map((s) => `${s.label}${s.extra ? '*' : ''}`)).toEqual(['Squats', 'Rest', 'Squats*', 'Rest', 'Plank']);
    runner.skip();
    expect(runner.step).toMatchObject({ label: 'Squats', extra: true });
  });

  it('on the last step it adds a rest and then the set', () => {
    let t = 0;
    const runner = new Runner(buildSteps(r), () => t);
    runner.start();
    runner.skip();
    runner.skip(); // plank
    runner.addExtraSet();
    expect(runner.steps.map((s) => `${s.label}${s.extra ? '*' : ''}`)).toEqual(['Squats', 'Rest', 'Plank', 'Rest', 'Plank*']);
    t += 60 * 60 * 1000;
    expect(runner.tick()).toContainEqual({ type: 'finish' });
  });

  it('extra sets are logged as sets but never change rounds done', () => {
    let t = 0;
    const runner = new Runner(buildSteps(r), () => t);
    runner.start();
    runner.skip();
    runner.addExtraSet();
    t += 60 * 60 * 1000;
    runner.tick();
    const res = runner.result();
    expect(res.work.filter((w) => w.name === 'Squats')).toHaveLength(2);
    expect(res.work.find((w) => w.extra)).toBeDefined();
    expect(res.roundsDone).toBe(0); // squats (round 1) was skipped, plank done: round not complete
    const e = buildEntry(r, res, 100, true, Date.UTC(2026, 9, 5));
    expect(e.exercises.find((x) => x.name === 'Squats')!.sets).toBe(1); // only the extra set was completed
  });

  it('an unfinished extra set does not undo a round that was completed', () => {
    let t = 0;
    const runner = new Runner(buildSteps(r), () => t);
    runner.start();
    t += 30_000;
    runner.tick(); // squats done, in rest
    t += 10_000;
    runner.tick(); // plank (last step)
    runner.addExtraSet();
    t += 30_000;
    runner.tick(); // plank done, now in the rest before the extra set
    t += 10_000 + 5_000;
    runner.tick(); // 5 s into the extra set, then the user ends the workout
    expect(runner.step.extra).toBe(true);
    const res = runner.result();
    expect(res.roundsDone).toBe(1); // the real round is complete
    expect(res.work.find((w) => w.extra)!.complete).toBe(false);
  });

  it('does nothing when not allowed or finished', () => {
    let t = 0;
    const runner = new Runner(buildSteps(r), () => t);
    runner.start();
    const before = runner.steps.length;
    runner.addExtraSet(); // squats running: not allowed
    expect(runner.steps).toHaveLength(before);
    t += 60 * 60 * 1000;
    runner.tick();
    runner.addExtraSet(); // finished
    expect(runner.steps).toHaveLength(before);
  });
});

const entry = (id: string, at: number, over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id, routineId: 'rt', unit: 'kg', note: '', at, routineName: 'Leg day', mode: 'routine', rounds: 3, roundsDone: 3, totalSec: 600,
  workSec: 300, completed: true, exercises: [], ...over,
});

describe('routine identity in the log', () => {
  it('a renamed routine stays one filter choice, labelled with the newest name', () => {
    const list = [entry('1', 1000 + 1.7e12, { routineName: 'Legs' }), entry('2', 2000 + 1.7e12, { routineName: 'Leg day' }), entry('3', 3000 + 1.7e12, { routineId: 'other', routineName: 'Core' })];
    expect(routineOptions(list)).toEqual([
      { key: 'other', label: 'Core' },
      { key: 'rt', label: 'Leg day' },
    ]);
    expect(routineKey(entry('x', 1e12, { routineId: '', routineName: 'Old' }))).toBe('name:Old');
  });

  it('survives the sanitizer', () => {
    const [e] = sanitizeHistory([{ id: 'x', at: Date.UTC(2026, 9, 5), routineId: 'abc', unit: 'lb', note: 'felt strong‮', exercises: [] }]);
    expect(e).toMatchObject({ routineId: 'abc', unit: 'lb', note: 'felt strong' });
    const [old] = sanitizeHistory([{ id: 'y', at: Date.UTC(2026, 9, 5), routineName: 'Old', exercises: [] }]);
    expect(old).toMatchObject({ routineId: '', unit: 'kg', note: '' });
    expect(sanitizeHistory([{ id: 'z', at: Date.UTC(2026, 9, 5), note: 'x'.repeat(900) }])[0].note).toHaveLength(300);
  });
});

describe('last done', () => {
  const now = new Date(2026, 9, 20, 12).getTime();
  const day = 86400000;
  it('finds the latest and counts the last 30 days, by id or (old entries) name', () => {
    const list = [
      entry('1', now - 2 * day),
      entry('2', now - 10 * day),
      entry('3', now - 45 * day),
      entry('4', now - 1 * day, { routineId: 'other' }),
      entry('5', now - 3 * day, { routineId: '', routineName: 'Leg day' }), // old entry, matched by name
    ];
    const r = lastDone(list, { id: 'rt', name: 'Leg day' }, now);
    expect(r.at).toBe(now - 2 * day);
    expect(r.recent).toBe(3);
    expect(lastDone([], { id: 'rt', name: 'Leg day' }, now)).toEqual({ at: null, recent: 0 });
  });
});

describe('weekly goal and streak', () => {
  // Monday 5 Oct 2026 is the start of "this week"; now = Wednesday.
  const now = new Date(2026, 9, 7, 12).getTime();
  const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9).getTime();
  const done = (id: string, when: number, completed = true) => entry(id, when, { completed });

  it('counts this week and the streak of earlier weeks', () => {
    const list = [
      done('a', at(2026, 10, 5)), done('b', at(2026, 10, 6)), // this week: 2
      done('c', at(2026, 9, 28)), done('d', at(2026, 9, 29)), done('e', at(2026, 9, 30)), // last week: 3
      done('f', at(2026, 9, 21)), done('g', at(2026, 9, 22)), done('h', at(2026, 9, 23)), // week before: 3
      done('i', at(2026, 9, 14)), // 4 weeks ago: only 1 -> streak stops
    ];
    expect(weeklyProgress(list, 3, now)).toEqual({ goal: 3, thisWeek: 2, streakWeeks: 2 });
  });

  it('this week counts once the goal is met', () => {
    const list = [done('a', at(2026, 10, 5)), done('b', at(2026, 10, 6)), done('c', at(2026, 10, 7)), done('d', at(2026, 9, 29)), done('e', at(2026, 9, 30)), done('f', at(2026, 9, 28))];
    expect(weeklyProgress(list, 3, now).streakWeeks).toBe(2);
  });

  it('a missed week breaks the streak; ended-early workouts and the future do not count', () => {
    const list = [done('a', at(2026, 9, 21)), done('b', at(2026, 9, 22)), done('c', at(2026, 9, 23)), done('x', at(2026, 10, 6), false), done('f', at(2026, 10, 20))];
    const p = weeklyProgress(list, 3, now);
    expect(p.thisWeek).toBe(0);
    expect(p.streakWeeks).toBe(0); // last week (28 Sep) was empty
  });

  it('Sunday belongs to the week that started on Monday', () => {
    const sunday = new Date(2026, 9, 11, 22).getTime();
    expect(weeklyProgress([done('a', sunday)], 1, sunday).thisWeek).toBe(1);
    expect(weeklyProgress([done('a', sunday)], 1, new Date(2026, 9, 12, 8).getTime()).thisWeek).toBe(0); // next Monday
  });

  it('goal 0 means off', () => {
    expect(weeklyProgress([done('a', at(2026, 10, 5))], 0, now)).toEqual({ goal: 0, thisWeek: 1, streakWeeks: 0 });
  });
});

describe('backup and restore', () => {
  const data: BackupData = {
    settings: { ...DEFAULT_SETTINGS, units: 'lb', weeklyGoal: 3 },
    state: sanitizeAppState({ mode: 'routine', sort: 'name' }),
    saved: [{ ...base, id: 'keep' }],
    history: [entry('h1', Date.UTC(2026, 9, 5), { note: 'good' })],
  };

  it('round-trips everything', () => {
    const res = parseBackup(makeBackup(data, Date.UTC(2026, 9, 6)));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.exportedAt).toBe(Date.UTC(2026, 9, 6));
    expect(res.data.settings.units).toBe('lb');
    expect(res.data.settings.weeklyGoal).toBe(3);
    expect(res.data.state.sort).toBe('name');
    expect(res.data.saved[0].warmup).toHaveLength(2);
    expect(res.data.history[0].note).toBe('good');
    expect(countsOf(res.data)).toEqual({ routines: 1, workouts: 1 });
  });

  it('rejects files that are not an Intervo backup', () => {
    expect(parseBackup('not json')).toEqual({ ok: false, error: 'notJson' });
    expect(parseBackup('[1,2]')).toEqual({ ok: false, error: 'notBackup' });
    expect(parseBackup('{"app":"other","version":1}')).toEqual({ ok: false, error: 'notBackup' });
    expect(parseBackup('{"app":"intervo","version":2}')).toEqual({ ok: false, error: 'notBackup' });
    expect(parseBackup('x'.repeat(5_000_001))).toEqual({ ok: false, error: 'tooBig' });
  });

  it('sanitizes hostile contents like any other stored data', () => {
    const evil = JSON.stringify({
      app: 'intervo', version: 1, exportedAt: 'x',
      settings: { sound: 'loud', weeklyGoal: 1e9 },
      saved: [{ id: 's', name: '<script>', exercises: 'no', rounds: -4 }],
      history: [{ at: 5 }, { id: 'ok', at: Date.UTC(2026, 9, 5), exercises: [{ name: 'p', reps: 1e12 }] }],
    });
    const res = parseBackup(evil);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.exportedAt).toBe(0);
    expect(res.data.settings.sound).toBe('voice');
    expect(res.data.settings.weeklyGoal).toBe(7);
    expect(res.data.saved[0].rounds).toBe(1);
    expect(res.data.history).toHaveLength(1);
    expect(res.data.history[0].exercises[0].reps).toBe(999999);
  });

  it('merge adds what is missing and never overwrites what is here', () => {
    const incoming: BackupData = {
      settings: { ...DEFAULT_SETTINGS, units: 'kg' },
      state: sanitizeAppState({}),
      saved: [{ ...base, id: 'keep', name: 'Changed elsewhere' }, { ...base, id: 'new', name: 'New one' }],
      history: [entry('h1', Date.UTC(2026, 9, 5), { note: 'other phone' }), entry('h2', Date.UTC(2026, 9, 6))],
    };
    const m = mergeBackup(data, incoming);
    expect(m.saved.map((r) => r.id)).toEqual(['keep', 'new']);
    expect(m.saved[0].name).toBe('Full'); // current wins
    expect(m.history.map((e) => e.id)).toEqual(['h2', 'h1']); // newest first, no duplicate
    expect(m.history.find((e) => e.id === 'h1')!.note).toBe('good');
    expect(m.settings.units).toBe('lb'); // settings stay as they are
  });

  it('names the file by date', () => {
    expect(backupFileName(new Date(2026, 9, 5, 12).getTime())).toBe('intervo-backup-2026-10-05.json');
  });
});

describe('example routines', () => {
  it('are valid, unique and add only once', () => {
    expect(new Set(EXAMPLE_ROUTINES.map((r) => r.id)).size).toBe(EXAMPLE_ROUTINES.length);
    for (const r of EXAMPLE_ROUTINES) {
      expect(buildSteps(r).length).toBeGreaterThan(0);
      expect(sanitizeRoutine(r, defaultQuick())).toMatchObject({ id: r.id, name: r.name, rounds: r.rounds });
    }
    const once = withExamples([], 50);
    expect(once).toHaveLength(EXAMPLE_ROUTINES.length);
    expect(withExamples(once, 50)).toHaveLength(EXAMPLE_ROUTINES.length);
    expect(withExamples([{ ...base, id: 'mine' }], 50)[0].id).toBe('mine'); // yours stay first
    expect(withExamples([], 2)).toHaveLength(2); // respects the limit
  });
});

describe('app state', () => {
  it('sort defaults to recent and validates', () => {
    expect(sanitizeAppState({}).sort).toBe('recent');
    expect(sanitizeAppState({ sort: 'name' }).sort).toBe('name');
    expect(sanitizeAppState({ sort: 'zzz' }).sort).toBe('recent');
  });
  it('goal is clamped 0..7', () => {
    expect(sanitizeSettings({ weeklyGoal: -3 }).weeklyGoal).toBe(0);
    expect(sanitizeSettings({ weeklyGoal: 4.4 }).weeklyGoal).toBe(4);
  });
});
