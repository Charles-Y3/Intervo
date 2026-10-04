import { describe, expect, it } from 'vitest';
import {
  NO_FILTERS,
  bucketize,
  buildEntry,
  dayKey,
  defaultGroup,
  exerciseNames,
  filterEntries,
  parseDay,
  rangeFor,
  routineOptions,
  sanitizeHistory,
  spanDays,
  summarize,
  worthLogging,
} from './history';
import type { HistoryEntry } from './history';
import { buildSteps } from './plan';
import { Runner } from './runner';
import type { Routine } from './types';

const routine = (over: Partial<Routine> = {}): Routine => ({
  id: 'r1',
  name: 'Leg day',
  exercises: [
    { id: 'a', name: 'Squats', workSec: 30 },
    { id: 'b', name: 'Plank', workSec: 45 },
  ],
  restBetweenExercisesSec: 10,
  restBetweenRoundsSec: 60,
  rounds: 2,
  prepSec: 0,
  ...over,
});

function run(r = routine()) {
  let t = 0;
  const runner = new Runner(buildSteps(r), () => t);
  runner.start();
  return { runner, advance: (ms: number) => (t += ms) };
}

describe('Runner.result (what was actually done)', () => {
  it('a full run completes every set and round', () => {
    const { runner, advance } = run();
    advance(60 * 60 * 1000);
    runner.tick();
    const res = runner.result();
    expect(res.work.length).toBe(4);
    expect(res.work.every((w) => w.complete)).toBe(true);
    expect(res.roundsDone).toBe(2);
  });

  it('ending early counts the partial set but not as complete', () => {
    const { runner, advance } = run();
    advance(30_000 + 10_000 + 12_000); // squats done, rest done, 12 s into plank
    runner.tick();
    const res = runner.result();
    expect(res.work[0]).toMatchObject({ name: 'Squats', complete: true, sec: 30 });
    expect(res.work[1].complete).toBe(false);
    expect(res.work[1].sec).toBeCloseTo(12, 0);
    expect(res.work[2].sec).toBe(0);
    expect(res.roundsDone).toBe(0);
  });

  it('skipping a set keeps the seconds done, and back() does not lose them', () => {
    const { runner, advance } = run();
    advance(20_000);
    runner.skip(); // 20 s of 30 s squats
    runner.back(); // under 2 s into rest -> returns to squats
    expect(runner.step.label).toBe('Squats');
    const res = runner.result();
    expect(res.work[0].sec).toBeCloseTo(20, 0);
    expect(res.work[0].complete).toBe(false);
  });

  it('pausing does not add seconds', () => {
    const { runner, advance } = run();
    advance(5_000);
    runner.pause();
    advance(120_000);
    expect(runner.result().work[0].sec).toBeCloseTo(5, 0);
  });
});

describe('buildEntry', () => {
  it('aggregates by exercise name, case-insensitively', () => {
    const r = routine({ exercises: [{ id: 'a', name: 'Squats', workSec: 30 }, { id: 'b', name: 'squats', workSec: 40 }] });
    const { runner, advance } = run(r);
    advance(60 * 60 * 1000);
    runner.tick();
    const e = buildEntry(r, runner.result(), 300, true, Date.UTC(2026, 9, 5, 12));
    expect(e.exercises).toHaveLength(1);
    expect(e.exercises[0]).toMatchObject({ sets: 4, workSec: 140, longestSec: 40 });
    expect(e.workSec).toBe(140);
    expect(e.completed).toBe(true);
    expect(e.roundsDone).toBe(2);
  });

  it('marks quick mode and ignores accidental starts', () => {
    const q = routine({ id: 'quick', name: 'Quick timer', exercises: [{ id: 'q', name: 'Plank', workSec: 30 }] });
    const { runner, advance } = run(q);
    expect(worthLogging(runner.result())).toBe(false);
    advance(3_500);
    expect(worthLogging(runner.result())).toBe(true);
    expect(buildEntry(q, runner.result(), 4, false, Date.UTC(2026, 9, 5)).mode).toBe('quick');
  });
});

describe('sanitizeHistory (hostile input)', () => {
  it('drops garbage and clamps the rest', () => {
    const good = { id: 'x', at: Date.UTC(2026, 9, 5), routineName: 'A', exercises: [{ name: 'Plank', sets: 3, workSec: 90, longestSec: 30 }] };
    const out = sanitizeHistory([
      good,
      good, // duplicate id
      null,
      5,
      { at: 'now' },
      { at: 1 }, // 1970
      { at: 1e20 },
      { ...good, id: 'y', routineName: '<img onerror=1>', rounds: 1e9, workSec: -5, exercises: 'no' },
    ]);
    expect(out.map((e) => e.id).sort()).toEqual(['x', 'y']);
    const y = out.find((e) => e.id === 'y')!;
    expect(y.rounds).toBe(99);
    expect(y.workSec).toBe(0);
    expect(y.exercises).toEqual([]);
    expect(sanitizeHistory('nope')).toEqual([]);
    expect(sanitizeHistory({ a: 1 })).toEqual([]);
  });
  it('sorts newest first and caps the size', () => {
    const many = Array.from({ length: 1500 }, (_, i) => ({ id: `i${i}`, at: Date.UTC(2026, 0, 1) + i * 1000, routineName: 'A', exercises: [] }));
    const out = sanitizeHistory(many);
    expect(out.length).toBe(1000);
    expect(out[0].at).toBeGreaterThan(out[1].at);
  });
});

describe('dates', () => {
  it('parses only real days', () => {
    expect(parseDay('2026-10-05')).toBeDefined();
    expect(parseDay('2026-02-31')).toBeUndefined();
    expect(parseDay('10/5/2026')).toBeUndefined();
    expect(parseDay('')).toBeUndefined();
  });
  it('presets count back from today inclusive', () => {
    const today = new Date(2026, 9, 5, 15).getTime();
    expect(rangeFor('7', today)).toEqual({ from: '2026-09-29', to: '2026-10-05' });
    expect(rangeFor('all', today)).toEqual({ from: '', to: '' });
  });
});

const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h).getTime();
function entry(id: string, when: number, routineName: string, exercises: [string, number, number, number][], over: Partial<HistoryEntry> = {}): HistoryEntry {
  const ex = exercises.map(([name, sets, workSec, longestSec]) => ({ name, sets, workSec, longestSec, reps: 0, bestReps: 0, weight: 0 }));
  return {
    id,
    routineId: '',
    unit: 'kg',
    note: '',
    at: when,
    routineName,
    mode: 'routine',
    rounds: 3,
    roundsDone: 3,
    totalSec: 600,
    workSec: ex.reduce((a, e) => a + e.workSec, 0),
    completed: true,
    exercises: ex,
    ...over,
  };
}

const sample = [
  entry('1', at(2026, 10, 1), 'Leg day', [['Squats', 3, 90, 30], ['Plank', 3, 90, 30]]),
  entry('2', at(2026, 10, 3), 'Core', [['Plank', 3, 120, 40]]),
  entry('3', at(2026, 10, 8), 'Leg day', [['Squats', 3, 135, 45], ['Plank', 3, 135, 45]]),
  entry('4', at(2026, 10, 20), 'Core', [['plank', 3, 180, 60]]),
];

describe('filters', () => {
  it('by date range (inclusive)', () => {
    const f = { ...NO_FILTERS, from: '2026-10-03', to: '2026-10-08' };
    expect(filterEntries(sample, f).map((e) => e.id)).toEqual(['2', '3']);
  });
  it('by routine', () => {
    expect(filterEntries(sample, { ...NO_FILTERS, routine: 'name:Core' }).map((e) => e.id)).toEqual(['2', '4']);
  });
  it('by exercise, ignoring case', () => {
    expect(filterEntries(sample, { ...NO_FILTERS, exercise: 'PLANK' }).map((e) => e.id)).toEqual(['1', '2', '3', '4']);
    expect(filterEntries(sample, { ...NO_FILTERS, exercise: 'squats' }).map((e) => e.id)).toEqual(['1', '3']);
  });
  it('combines filters', () => {
    const f = { from: '2026-10-02', to: '2026-10-31', routine: 'name:Core', exercise: 'plank' };
    expect(filterEntries(sample, f).map((e) => e.id)).toEqual(['2', '4']);
  });
  it('lists distinct names', () => {
    expect(routineOptions(sample).map((o) => o.label)).toEqual(['Core', 'Leg day']);
    expect(exerciseNames(sample)).toEqual(['plank', 'Squats']); // newest spelling of plank wins
  });
});

describe('summary uses only the chosen exercise', () => {
  it('all vs one exercise', () => {
    expect(summarize(sample, '')).toEqual({ sessions: 4, workSec: 90 + 90 + 120 + 135 + 135 + 180, sets: 18, reps: 0 });
    expect(summarize(filterEntries(sample, { ...NO_FILTERS, exercise: 'Squats' }), 'Squats')).toEqual({ sessions: 2, workSec: 225, sets: 6, reps: 0 });
  });
});

describe('bucketize', () => {
  it('daily series fills empty days with 0', () => {
    const f = { ...NO_FILTERS, from: '2026-10-01', to: '2026-10-04' };
    const b = bucketize(filterEntries(sample, f), f, 'day', 'time');
    expect(b.map((x) => [x.key, x.value])).toEqual([
      ['2026-10-01', 180],
      ['2026-10-02', 0],
      ['2026-10-03', 120],
      ['2026-10-04', 0],
    ]);
  });

  it('weekly buckets start on Monday and sum entries', () => {
    // 1 Oct 2026 is a Thursday: week of Mon 28 Sep holds entries 1 and 2; Mon 5 Oct is empty; Mon 5? entry 3 (Thu 8 Oct) is week of 5 Oct.
    const b = bucketize(sample, NO_FILTERS, 'week', 'time');
    expect(b.map((x) => x.key)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']);
    expect(b.map((x) => x.value)).toEqual([300, 270, 0, 180]);
  });

  it('monthly buckets', () => {
    const b = bucketize(sample, NO_FILTERS, 'month', 'sessions');
    expect(b.map((x) => [x.key, x.value])).toEqual([['2026-10', 4]]);
  });

  it('exercise filter charts only that exercise: longest plank rises over time', () => {
    const f = { ...NO_FILTERS, exercise: 'plank' };
    const b = bucketize(filterEntries(sample, f), f, 'week', 'longest');
    expect(b.map((x) => x.value)).toEqual([40, 45, 0, 60]);
  });

  it('sets metric', () => {
    const f = { ...NO_FILTERS, exercise: 'Squats' };
    const b = bucketize(filterEntries(sample, f), f, 'month', 'sets');
    expect(b[0].value).toBe(6);
  });

  it('returns nothing for no entries and caps the length', () => {
    expect(bucketize([], NO_FILTERS, 'day', 'time')).toEqual([]);
    const f = { ...NO_FILTERS, from: '2025-01-01', to: '2026-12-31' };
    expect(bucketize(sample, f, 'day', 'time').length).toBe(120);
  });

  it('day keys use local time', () => {
    expect(dayKey(new Date(2026, 9, 5, 23, 30).getTime())).toBe('2026-10-05');
  });

  it('picks a sensible default grouping', () => {
    expect(defaultGroup(7)).toBe('day');
    expect(defaultGroup(90)).toBe('week');
    expect(defaultGroup(400)).toBe('month');
    expect(spanDays(sample, NO_FILTERS)).toBe(20);
  });
});
