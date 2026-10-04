import { formatShort, nextWorkStep } from './plan';
import type { RunEvent, Settings, Step } from './types';

export type Beep = 'tick' | 'go' | 'rest' | 'half' | 'done';

export interface Cue {
  /** Spoken only when sound mode is "voice". */
  speech?: string;
  /** Played when sound mode is "voice" or "beeps". */
  beep?: Beep;
  vibrate?: number[];
}

/** Turn a run event into what the phone should say, play and buzz.
 * Pure, so the wording and the sound-mode rules are unit tested. */
export function cueFor(ev: RunEvent, steps: Step[], settings: Settings): Cue | null {
  if (settings.sound === 'silent' && !settings.vibrate) return null;
  const cue = rawCue(ev, steps, settings);
  if (!cue) return null;
  const out: Cue = {};
  if (settings.sound === 'voice' && cue.speech) out.speech = cue.speech;
  if (settings.sound !== 'silent' && cue.beep) {
    // In voice mode the spoken word carries the cue; keep only short ticks.
    if (settings.sound === 'beeps' || ev.type === 'countdown' || !cue.speech) out.beep = cue.beep;
  }
  if (settings.vibrate && cue.vibrate) out.vibrate = cue.vibrate;
  return out.speech || out.beep || out.vibrate ? out : null;
}

function rawCue(ev: RunEvent, steps: Step[], settings: Settings): Cue | null {
  switch (ev.type) {
    case 'countdown':
      if (ev.sec > 3) {
        // Counting every second: voice mode only, and not in the first 2 s of a
        // step, so the "Squats. Go" announcement is not cut off by a number.
        if (settings.sound !== 'voice' || settings.countAloud !== 'every' || ev.total - ev.sec < 2) return null;
        return { speech: String(ev.sec) };
      }
      return { speech: String(ev.sec), beep: 'tick', vibrate: [60] };
    case 'halfway':
      if (settings.sides) return { speech: 'Switch sides', beep: 'half', vibrate: [120, 80, 120] };
      if (settings.halfway) return { speech: 'Halfway', beep: 'half', vibrate: [80] };
      return null;
    case 'finish':
      return { speech: 'Workout complete. Well done', beep: 'done', vibrate: [300, 100, 300] };
    case 'stepStart': {
      const step = steps[ev.index];
      if (!step) return null;
      const multiRound = steps.some((s) => s.round > 1);
      switch (step.kind) {
        case 'prep': {
          const first = nextWorkStep(steps, ev.index);
          return { speech: first ? `Get ready. First, ${first.label}` : 'Get ready', beep: 'rest', vibrate: [100] };
        }
        case 'work': {
          const firstOfRound = !step.section && step.exerciseIndex === 0 && step.round > 1 && multiRound;
          const what = step.reps !== undefined ? `${step.label}. ${step.reps} ${step.reps === 1 ? 'rep' : 'reps'}` : step.label;
          const lead = step.section && step.exerciseIndex === 0 ? (step.section === 'warmup' ? 'Warm-up. ' : 'Cool-down. ') : '';
          return {
            speech: lead + (firstOfRound ? `Round ${step.round}. ${what}. Go` : `${what}. Go`),
            beep: 'go',
            vibrate: [250],
          };
        }
        case 'rest':
        case 'roundRest': {
          const next = nextWorkStep(steps, ev.index);
          const lead = step.kind === 'roundRest' ? 'Round complete. Rest' : 'Rest';
          return {
            speech: next ? `${lead} ${formatShort(step.durationSec)}. Next, ${next.label}` : lead,
            beep: 'rest',
            vibrate: [100, 80, 100],
          };
        }
      }
    }
  }
}
