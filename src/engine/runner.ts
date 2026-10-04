import type { RunEvent, Step } from './types';

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

  constructor(
    readonly steps: Step[],
    private readonly now: () => number,
  ) {}

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
      this.enter(this.index + 1, stepEnd);
      entered = true;
    }
    // Only the step we landed in is announced; steps skipped by a freeze stay silent.
    if (entered) events.push({ type: 'stepStart', index: this.index });

    const sec = this.remainingSec();
    const total = this.step.durationSec + this.extraMs / 1000;
    if (sec >= 1 && sec <= 3 && sec < this.lastSec && sec < total) events.push({ type: 'countdown', sec });
    this.lastSec = Math.min(this.lastSec, sec);

    if (!this.halfwayFired && this.step.kind === 'work' && total >= 20 && this.remainingMs() <= (total * 1000) / 2) {
      this.halfwayFired = true;
      events.push({ type: 'halfway' });
    }
    return events;
  }

  private finish(): RunEvent[] {
    this.done = true;
    return [{ type: 'finish' }];
  }

  private goto(i: number): void {
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
