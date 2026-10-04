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

  constructor(
    readonly steps: Step[],
    private readonly now: () => number,
    /** Also emit a countdown event for every second of work steps (not only 3-2-1). */
    private readonly everySecondOnWork = false,
  ) {
    this.best = steps.map(() => 0);
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
    this.enter(0, this.now());
    return [{ type: 'stepStart', index: 0 }];
  }

  remainingMs(): number {
    const at = this.pausedAt ?? this.now();
    return this.step.durationSec * 1000 + this.extraMs - (at - this.startedAt);
  }

  /** Whole seconds left, rounded up (what the big number shows). */
  remainingSec(): number {
    return Math.max(0, Math.ceil(this.remainingMs() / 1000));
  }

  /** 0..1 of the current step already used. */
  progress(): number {
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
    const elapsed = this.step.durationSec * 1000 + this.extraMs - this.remainingMs();
    this.goto(elapsed > 2000 || this.index === 0 ? this.index : this.index - 1);
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
    const secs = Math.min(this.step.durationSec, Math.max(0, (at - this.startedAt) / 1000));
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
        plannedSec: st.durationSec,
        sec: Math.round(this.best[i] * 10) / 10,
        complete: this.best[i] >= st.durationSec - 0.05,
      }));
    const rounds = new Map<number, boolean>();
    for (const w of work) rounds.set(w.round, (rounds.get(w.round) ?? true) && w.complete);
    return { work, roundsDone: [...rounds.values()].filter(Boolean).length };
  }

  private finish(): RunEvent[] {
    if (this.index >= this.steps.length - 1) {
      if (this.remainingMs() <= 0) this.best[this.index] = this.step.durationSec;
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
