import type { RunEvent, RunResult, Step } from './types';

/** Time-driven run state machine. It never counts ticks: every answer is
 * computed from the clock, so a throttled or frozen tab catches up to the
 * right step and each cue fires at most once. `now` is injectable for tests. */
export class Runner {
  index = 0;
  done = false;
  private startedAt = 0;
  private extraMs = 0;
  private pausedAt: number | null = null;
  private lastSec = Infinity;
  private halfwayFired = false;
  /** Most seconds ever completed in each step (survives skip/back). */
  private best: number[];
  /** Reps confirmed with Done, per step (0 = not done). */
  private repsDone: number[];
  private setDone: boolean[];

  constructor(
    readonly steps: Step[],
    private readonly now: () => number,
    /** Also emit a countdown event for every second of work steps (not only 3-2-1). */
    private readonly everySecondOnWork = false,
  ) {
    this.best = steps.map(() => 0);
    this.repsDone = steps.map(() => 0);
    this.setDone = steps.map(() => false);
  }

  /** The current step has no countdown: it ends when the user taps Done. */
  get untimed(): boolean {
    return this.step.reps !== undefined;
  }

  get paused(): boolean {
    return this.pausedAt !== null;
  }

  get step(): Step {
    return this.steps[Math.min(this.index, this.steps.length - 1)];
  }

  /** Begin step 0. Returns its start event. */
  start(): RunEvent[] {
    this.done = false;
    this.pausedAt = null;
    this.best = this.steps.map(() => 0);
    this.repsDone = this.steps.map(() => 0);
    this.setDone = this.steps.map(() => false);
    this.enter(0, this.now());
    return [{ type: 'stepStart', index: 0 }];
  }

  remainingMs(): number {
    if (this.untimed) return Infinity;
    const at = this.pausedAt ?? this.now();
    return this.step.durationSec * 1000 + this.extraMs - (at - this.startedAt);
  }

  /** Seconds spent in the current step so far (the count-up clock of a reps set). */
  elapsedSec(): number {
    const at = this.pausedAt ?? this.now();
    return Math.max(0, (at - this.startedAt) / 1000);
  }

  /** Whole seconds left, rounded up (what the big number shows). */
  remainingSec(): number {
    return Math.max(0, Math.ceil(this.remainingMs() / 1000));
  }

  /** 0..1 of the current step already used. */
  progress(): number {
    if (this.untimed) return 0;
    const total = this.step.durationSec * 1000 + this.extraMs;
    return total <= 0 ? 1 : Math.min(1, Math.max(0, 1 - this.remainingMs() / total));
  }

  pause(): void {
    if (this.pausedAt === null && !this.done) this.pausedAt = this.now();
  }

  resume(): void {
    if (this.pausedAt !== null) {
      this.startedAt += this.now() - this.pausedAt;
      this.pausedAt = null;
    }
  }

  /** Jump to the next step (or finish). */
  skip(): RunEvent[] {
    if (this.done) return [];
    if (this.index >= this.steps.length - 1) return this.finish();
    this.goto(this.index + 1);
    return [{ type: 'stepStart', index: this.index }];
  }

  /** Restart the current step if it has run >2 s, else go to the previous one. */
  back(): RunEvent[] {
    if (this.done) return [];
    const elapsed = this.elapsedSec() * 1000;
    this.goto(elapsed > 2000 || this.index === 0 ? this.index : this.index - 1);
    return [{ type: 'stepStart', index: this.index }];
  }

  /** User tapped Done on a reps set: log the reps and move on (or finish). */
  completeSet(reps: number): RunEvent[] {
    if (this.done || !this.untimed) return [];
    this.snap();
    this.repsDone[this.index] = Math.max(0, Math.round(reps));
    this.setDone[this.index] = true;
    if (this.index >= this.steps.length - 1) return this.finish();
    this.goto(this.index + 1);
    return [{ type: 'stepStart', index: this.index }];
  }

  addTime(sec: number): void {
    this.extraMs += sec * 1000;
  }

  /** Advance with the clock. Call often; safe to call rarely. */
  tick(): RunEvent[] {
    if (this.done || this.pausedAt !== null) return [];
    const events: RunEvent[] = [];
    let entered = false;
    for (;;) {
      const rem = this.remainingMs();
      if (rem > 0) break;
      if (this.index >= this.steps.length - 1) return this.finish();
      const stepEnd = this.startedAt + this.step.durationSec * 1000 + this.extraMs;
      this.best[this.index] = this.step.durationSec;
      this.enter(this.index + 1, stepEnd);
      entered = true;
    }
    // Only the step we landed in is announced; steps skipped by a freeze stay silent.
    if (entered) events.push({ type: 'stepStart', index: this.index });
    if (this.untimed) return events; // reps sets have no countdown, 3-2-1 or halfway

    const sec = this.remainingSec();
    const total = this.step.durationSec + this.extraMs / 1000;
    const wanted = sec <= 3 || (this.everySecondOnWork && this.step.kind === 'work');
    if (sec >= 1 && wanted && sec < this.lastSec && sec < total) {
      events.push({ type: 'countdown', sec, total: Math.round(total) });
    }
    this.lastSec = Math.min(this.lastSec, sec);

    if (!this.halfwayFired && this.step.kind === 'work' && total >= 20 && this.remainingMs() <= (total * 1000) / 2) {
      this.halfwayFired = true;
      events.push({ type: 'halfway' });
    }
    return events;
  }

  /** Seconds done so far in the current step, capped at its length. */
  private snap(): void {
    const at = this.pausedAt ?? this.now();
    const cap = this.untimed ? Infinity : this.step.durationSec;
    const secs = Math.min(cap, Math.max(0, (at - this.startedAt) / 1000));
    this.best[this.index] = Math.max(this.best[this.index], secs);
  }

  /** What was actually done, for the workout log. Safe to call any time. */
  result(): RunResult {
    if (!this.done) this.snap();
    const work = this.steps
      .map((st, i) => ({ st, i }))
      .filter(({ st }) => st.kind === 'work')
      .map(({ st, i }) => ({
        name: st.label,
        round: st.round,
        plannedSec: st.reps !== undefined ? 0 : st.durationSec,
        sec: Math.round(this.best[i] * 10) / 10,
        complete: st.reps !== undefined ? this.setDone[i] : this.best[i] >= st.durationSec - 0.05,
        targetReps: st.reps ?? 0,
        reps: st.reps !== undefined ? this.repsDone[i] : 0,
      }));
    const rounds = new Map<number, boolean>();
    for (const w of work) rounds.set(w.round, (rounds.get(w.round) ?? true) && w.complete);
    return { work, roundsDone: [...rounds.values()].filter(Boolean).length };
  }

  private finish(): RunEvent[] {
    if (this.index >= this.steps.length - 1) {
      if (!this.untimed && this.remainingMs() <= 0) this.best[this.index] = this.step.durationSec;
      else this.snap();
    }
    this.done = true;
    return [{ type: 'finish' }];
  }

  private goto(i: number): void {
    this.snap();
    const wasPaused = this.pausedAt !== null;
    const at = this.now();
    this.enter(i, at);
    this.pausedAt = wasPaused ? at : null;
  }

  private enter(i: number, at: number): void {
    this.index = i;
    this.startedAt = at;
    this.extraMs = 0;
    this.lastSec = Infinity;
    this.halfwayFired = false;
  }
}
