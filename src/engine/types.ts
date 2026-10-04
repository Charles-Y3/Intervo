export interface Exercise {
  id: string;
  name: string;
  workSec: number;
}

/** One workout. Quick mode is a Routine with a single exercise. */
export interface Routine {
  id: string;
  name: string;
  exercises: Exercise[];
  restBetweenExercisesSec: number;
  restBetweenRoundsSec: number;
  rounds: number;
  prepSec: number;
}

export type StepKind = 'prep' | 'work' | 'rest' | 'roundRest';

export interface Step {
  kind: StepKind;
  durationSec: number;
  /** Exercise name for work steps; "Get ready" / "Rest" otherwise. */
  label: string;
  /** 1-based round number this step belongs to (0 for prep). */
  round: number;
  /** 0-based exercise index for work steps, -1 otherwise. */
  exerciseIndex: number;
}

export type SoundMode = 'voice' | 'beeps' | 'silent';
export type ThemeChoice = 'auto' | 'light' | 'dark';

export interface Settings {
  sound: SoundMode;
  vibrate: boolean;
  halfway: boolean;
  sides: boolean;
  theme: ThemeChoice;
}

export type RunEvent =
  | { type: 'stepStart'; index: number }
  | { type: 'countdown'; sec: number }
  | { type: 'halfway' }
  | { type: 'finish' };

export const LIMITS = {
  maxSeconds: 99 * 60 + 59,
  maxRounds: 99,
  maxExercises: 30,
  maxNameLength: 40,
  maxSavedRoutines: 50,
} as const;
