import { describe, expect, it } from 'vitest';
import { buildSteps, formatClock, formatShort, totalSeconds } from './plan';
import { Runner } from './runner';
import { cueFor } from './cues';
import {
  DEFAULT_SETTINGS,
  defaultQuick,
  sanitizeAppState,
  sanitizeRoutine,
  sanitizeSaved,
  sanitizeSettings,
} from './storage';
import { digitsToSeconds, popDigit, pushDigit, secondsToDigits } from './timeEntry';
import type { Routine, Settings } from './types';

function routine(over: Partial<Routine> = {}): Routine {
  return {
    id: 't',
    name: 'T',
    exercises: [
      { id: 'a', name: 'Squats', workSec: 30 },
      { id: 'b', name: 'Lunges', workSec: 30 },
    ],
    restBetweenExercisesSec: 10,
    restBetweenRoundsSec: 60,
    rounds: 2,
    prepSec: 5,
    ...over,
  };
}

const kinds = (r: Routine) => buildSteps(r).map((s) => s.kind[0] + (s.kind === 'roundRest' ? 'R' : ''));

describe('buildSteps', () => {
  it('rotates exercises with rests and no trailing rest', () => {
    expect(kinds(routine())).toEqual(['p', 'w', 'r', 'w', 'rR', 'w', 'r', 'w']);
  });
  it('skips rest between exercises when it is 0', () => {
    expect(kinds(routine({ restBetweenExercisesSec: 0 }))).toEqual(['p', 'w', 'w', 'rR', 'w', 'w']);
  });
  it('skips get-ready when 0', () => {
    expect(buildSteps(routine({ prepSec: 0 }))[0].kind).toBe('work');
  });
  it('single exercise: work, round rest, work, ... end on work', () => {
    const r = routine({ exercises: [{ id: 'a', name: 'Work', workSec: 30 }], rounds: 3, prepSec: 0 });
    expect(kinds(r)).toEqual(['w', 'rR', 'w', 'rR', 'w']);
  });
  it('totals correctly', () => {
    // 5 + (30+10+30) + 60 + (30+10+30) = 205
    expect(totalSeconds(buildSteps(routine()))).toBe(205);
  });
  it('numbers rounds and exercises', () => {
    const w = buildSteps(routine()).filter((s) => s.kind === 'work');
    expect(w.map((s) => [s.round, s.exerciseIndex])).toEqual([[1, 0], [1, 1], [2, 0], [2, 1]]);
  });
});

describe('formatting', () => {
  it('formats clocks and chips', () => {
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(0)).toBe('0:00');
    expect(formatShort(30)).toBe('30s');
    expect(formatShort(120)).toBe('2m');
    expect(formatShort(90)).toBe('1m 30s');
  });
});

function makeRunner(r = routine()) {
  let t = 0;
  const runner = new Runner(buildSteps(r), () => t);
  return { runner, advance: (ms: number) => (t += ms) };
}

describe('Runner', () => {
  it('moves through steps with the clock', () => {
    const { runner, advance } = makeRunner();
    runner.start();
    expect(runner.step.kind).toBe('prep');
    advance(5000);
    const ev = runner.tick();
    expect(runner.step.label).toBe('Squats');
    expect(ev).toContainEqual({ type: 'stepStart', index: 1 });
  });

  it('catches up after a freeze without replaying old cues', () => {
    const { runner, advance } = makeRunner();
    runner.start();
    advance(5000 + 30000 + 4000); // prep + work + 4s into rest
    const ev = runner.tick();
    expect(runner.step.kind).toBe('rest');
    expect(ev.filter((e) => e.type === 'stepStart')).toEqual([{ type: 'stepStart', index: 2 }]);
    expect(runner.remainingSec()).toBe(6);
  });

  it('counts 3,2,1 once each', () => {
    const { runner, advance } = makeRunner(routine({ prepSec: 0 }));
    runner.start();
    const secs: number[] = [];
    for (let i = 0; i < 300; i++) {
      advance(100);
      runner.tick().forEach((e) => e.type === 'countdown' && secs.push(e.sec));
      if (runner.index > 0) break;
    }
    expect(secs).toEqual([3, 2, 1]);
  });

  it('fires halfway once on long work steps only', () => {
    const { runner, advance } = makeRunner(routine({ prepSec: 0 }));
    runner.start();
    let count = 0;
    for (let i = 0; i < 280; i++) {
      advance(100);
      runner.tick().forEach((e) => e.type === 'halfway' && count++);
    }
    expect(count).toBe(1);
  });

  it('pause freezes the clock and resume continues', () => {
    const { runner, advance } = makeRunner();
    runner.start();
    advance(2000);
    runner.pause();
    advance(60000);
    expect(runner.tick()).toEqual([]);
    expect(runner.remainingSec()).toBe(3);
    runner.resume();
    advance(1000);
    expect(runner.remainingSec()).toBe(2);
  });

  it('skip while paused stays paused; back restarts or goes previous', () => {
    const { runner, advance } = makeRunner();
    runner.start();
    runner.pause();
    runner.skip();
    expect(runner.index).toBe(1);
    expect(runner.paused).toBe(true);
    runner.resume();
    advance(500);
    runner.back(); // under 2s in: previous step
    expect(runner.index).toBe(0);
    advance(3000);
    runner.back(); // over 2s in: restart same step
    expect(runner.index).toBe(0);
    expect(runner.remainingSec()).toBe(5);
  });

  it('addTime extends the current step', () => {
    const { runner, advance } = makeRunner();
    runner.start();
    runner.addTime(10);
    advance(5000);
    runner.tick();
    expect(runner.index).toBe(0);
    expect(runner.remainingSec()).toBe(10);
  });

  it('finishes exactly once', () => {
    const { runner, advance } = makeRunner();
    runner.start();
    advance(10 * 60 * 1000);
    expect(runner.tick()).toEqual([{ type: 'finish' }]);
    expect(runner.done).toBe(true);
    expect(runner.tick()).toEqual([]);
  });
});

describe('cueFor', () => {
  const steps = buildSteps(routine());
  const s = (over: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...over });

  it('is silent in silent mode (without vibration)', () => {
    expect(cueFor({ type: 'stepStart', index: 1 }, steps, s({ sound: 'silent' }))).toBeNull();
  });
  it('voice mode speaks the exercise and next', () => {
    expect(cueFor({ type: 'stepStart', index: 1 }, steps, s({}))?.speech).toBe('Squats. Go');
    expect(cueFor({ type: 'stepStart', index: 2 }, steps, s({}))?.speech).toBe('Rest 10s. Next, Lunges');
  });
  it('beeps mode never speaks', () => {
    const c = cueFor({ type: 'stepStart', index: 1 }, steps, s({ sound: 'beeps' }));
    expect(c?.speech).toBeUndefined();
    expect(c?.beep).toBe('go');
  });
  it('announces the round number from round 2', () => {
    const i = steps.findIndex((x) => x.round === 2 && x.exerciseIndex === 0);
    expect(cueFor({ type: 'stepStart', index: i }, steps, s({}))?.speech).toBe('Round 2. Squats. Go');
  });
  it('halfway only when enabled; sides wording wins', () => {
    expect(cueFor({ type: 'halfway' }, steps, s({}))).toBeNull();
    expect(cueFor({ type: 'halfway' }, steps, s({ halfway: true }))?.speech).toBe('Halfway');
    expect(cueFor({ type: 'halfway' }, steps, s({ halfway: true, sides: true }))?.speech).toBe('Switch sides');
  });
  it('vibration works with sound silent', () => {
    expect(cueFor({ type: 'countdown', sec: 2 }, steps, s({ sound: 'silent', vibrate: true }))?.vibrate).toBeDefined();
  });
});

describe('time entry', () => {
  it('fills from the right', () => {
    expect(digitsToSeconds('130')).toBe(90);
    expect(digitsToSeconds('90')).toBe(90);
    expect(digitsToSeconds('5')).toBe(5);
    expect(digitsToSeconds('')).toBe(0);
    expect(digitsToSeconds('9999')).toBe(99 * 60 + 59);
  });
  it('push/pop keep at most 4 digits and ignore junk', () => {
    expect(pushDigit('', '0')).toBe('');
    expect(pushDigit('1234', '5')).toBe('2345');
    expect(pushDigit('1', 'x')).toBe('1');
    expect(popDigit('123')).toBe('12');
  });
  it('round-trips seconds', () => {
    for (const sec of [5, 30, 60, 90, 600, 3599]) expect(digitsToSeconds(secondsToDigits(sec))).toBe(sec);
  });
});

describe('storage sanitizers (hostile input)', () => {
  it('survives garbage', () => {
    for (const bad of [null, undefined, 5, 'x', [], { exercises: 'no' }, { rounds: NaN }]) {
      const r = sanitizeRoutine(bad, defaultQuick());
      expect(r.exercises.length).toBeGreaterThan(0);
      expect(r.rounds).toBeGreaterThanOrEqual(1);
    }
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSaved('nope')).toEqual([]);
  });
  it('clamps numbers and names', () => {
    const r = sanitizeRoutine(
      {
        name: '<img src=x onerror=alert(1)>'.repeat(10),
        rounds: 1e9,
        prepSec: -5,
        restBetweenRoundsSec: 'abc',
        exercises: [{ name: 'a‮b\u0000c', workSec: -1 }, ...Array(100).fill({ name: 'x', workSec: 1e12 })],
      },
      defaultQuick(),
    );
    expect(r.rounds).toBe(99);
    expect(r.prepSec).toBe(0);
    expect(r.restBetweenRoundsSec).toBe(60);
    expect(r.exercises.length).toBe(30);
    expect(r.exercises[0].name).toBe('abc');
    expect(r.exercises[0].workSec).toBe(1);
    expect(r.exercises[1].workSec).toBe(99 * 60 + 59);
    expect(r.name.length).toBeLessThanOrEqual(40);
  });
  it('quick mode keeps exactly one exercise; bad sound mode falls back', () => {
    const st = sanitizeAppState({ mode: 'quick', quick: { exercises: [{ name: 'a' }, { name: 'b' }] } });
    expect(st.quick.exercises.length).toBe(1);
    expect(sanitizeSettings({ sound: 'loud' }).sound).toBe('voice');
  });
  it('dedupes saved routine ids', () => {
    const one = { id: 'x', name: 'A', exercises: [{ name: 'e', workSec: 5 }] };
    expect(sanitizeSaved([one, one]).length).toBe(1);
  });
});
