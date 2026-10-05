export type ExerciseKind = 'timed' | 'reps' | 'distance';
/** Optional blocks played once before round 1 / after the last round. */
export type Section = 'warmup' | 'cooldown';
export type WeightUnit = 'kg' | 'lb';
export type DistanceUnit = 'km' | 'mi';

export interface Exercise {
  id: string;
  name: string;
  /** Timed: the countdown length. Reps: unused (kept valid so switching kind is lossless). */
  workSec: number;
  /** Undefined means timed. */
  kind?: ExerciseKind;
  /** Target reps per set (reps exercises). */
  reps?: number;
  /** Extra weight (or 0 / undefined for none), in the unit chosen in Settings. */
  weight?: number;
  /** Target distance for run/walk exercises, in the distance unit chosen in Settings. */
  distance?: number;
  /** Reps exercises only: also run a countdown of workSec. When time is up the app asks how many reps were done. */
  timed?: boolean;
  /** Rest after this exercise, in seconds. Undefined = the routine's default for that spot. */
  restAfterSec?: number;
  /** Exercises that are next to each other and share a group id form a superset (A, B, C, A, B, C ...). */
  group?: string;
  /** Superset only, read from the first exercise of the group: how many times the group is played per round. */
  sets?: number;
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
  /** Played once before round 1 (optional). */
  warmup?: Exercise[];
  /** Played once after the last round (optional). */
  cooldown?: Exercise[];
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
  /** Target reps. Present = an untimed set that ends when the user taps Done;
   * durationSec is then only an estimate for the "total" line. */
  reps?: number;
  /** Target distance. Like reps, makes an untimed set that ends when the user taps Done. */
  distance?: number;
  /** Set for warm-up and cool-down steps (not part of the numbered rounds). */
  section?: Section;
  /** Extra weight for this set, if any. */
  weight?: number;
  /** Reps set with a countdown: the length of it. The step then ends when time is up and the reps are confirmed. */
  timedSec?: number;
  /** Steps of one pass through a superset share this number (rests inside it too). */
  setId?: number;
  /** Added mid-workout with "Extra set"; never counts toward rounds done. */
  extra?: boolean;
}

export type SoundMode = 'voice' | 'beeps' | 'silent';
export type ThemeChoice = 'auto' | 'light' | 'dark';

/** last3 = count only 3-2-1 before each step ends; every = also count every
 * second out loud during work steps (voice mode only). */
export type CountMode = 'last3' | 'every';
/** Which kind of spoken voice to prefer. "auto" = the phone's default. */
export type VoicePref = 'auto' | 'female' | 'male';

/** A repeating workout reminder, delivered as a push notification by the server. */
export interface ReminderSettings {
  enabled: boolean;
  /** "HH:MM", 24 hour, in this phone's own time zone. */
  time: string;
  /** 0 = Sunday ... 6 = Saturday. */
  days: number[];
}

export interface Settings {
  sound: SoundMode;
  vibrate: boolean;
  halfway: boolean;
  sides: boolean;
  theme: ThemeChoice;
  countAloud: CountMode;
  voicePref: VoicePref;
  /** Exact voice name chosen from the list; "" = pick by voicePref. */
  voiceName: string;
  units: WeightUnit;
  /** Workouts per week to aim for; 0 = no goal. */
  weeklyGoal: number;
  reminder: ReminderSettings;
  distanceUnit: DistanceUnit;
}

export type RunEvent =
  | { type: 'stepStart'; index: number }
  /** sec = whole seconds left; total = length of the current step in seconds. */
  | { type: 'countdown'; sec: number; total: number }
  | { type: 'halfway' }
  /** A timed reps set ran out of time and is waiting for the user to say how many reps they did. */
  | { type: 'timeUp' }
  | { type: 'finish' };

export const LIMITS = {
  maxSeconds: 99 * 60 + 59,
  maxRounds: 99,
  maxExercises: 30,
  maxNameLength: 40,
  maxSavedRoutines: 50,
  maxHistory: 1000,
  maxReps: 999,
  maxDistance: 999,
  maxSectionExercises: 10,
  maxWeight: 999,
  maxNote: 300,
  maxSets: 20,
} as const;

/** What a run actually completed (for the workout log). */
export interface RunResult {
  work: {
    name: string;
    round: number;
    /** Countdown length (0 for reps sets). */
    plannedSec: number;
    /** Seconds actually spent. */
    sec: number;
    complete: boolean;
    /** Reps sets: target and reps the user confirmed (0 if skipped). 0/0 for timed. */
    targetReps: number;
    reps: number;
    /** Extra weight used (0 = none). */
    weight: number;
    /** Distance sets: target and the distance the user confirmed (0 if skipped). 0/0 otherwise. */
    targetDistance: number;
    distance: number;
    section?: Section;
    extra: boolean;
  }[];
  roundsDone: number;
}
