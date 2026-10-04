import { LIMITS } from './types';
import type { CountMode, Exercise, Routine, Settings, SoundMode, ThemeChoice, VoicePref } from './types';

/** Everything read from localStorage is untrusted (old versions, edited by
 * hand, another tab). Each sanitizer clamps or replaces bad values with
 * defaults and never throws. Names are plain text only; React escapes them. */

export const DEFAULT_SETTINGS: Settings = {
  sound: 'voice',
  vibrate: false,
  halfway: false,
  sides: false,
  theme: 'auto',
  countAloud: 'last3',
  voicePref: 'auto',
  voiceName: '',
};

let idCounter = 0;
export function newId(): string {
  idCounter += 1;
  return `${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultQuick(): Routine {
  return {
    id: 'quick',
    name: 'Quick timer',
    exercises: [{ id: 'quick-1', name: 'Work', workSec: 30 }],
    restBetweenExercisesSec: 0,
    restBetweenRoundsSec: 60,
    rounds: 5,
    prepSec: 5,
  };
}

export function defaultRoutine(): Routine {
  return {
    id: 'draft',
    name: 'My routine',
    exercises: [
      { id: newId(), name: 'Exercise 1', workSec: 30 },
      { id: newId(), name: 'Exercise 2', workSec: 30 },
      { id: newId(), name: 'Exercise 3', workSec: 30 },
    ],
    restBetweenExercisesSec: 10,
    restBetweenRoundsSec: 120,
    rounds: 3,
    prepSec: 5,
  };
}

export function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function cleanText(v: unknown, fallback: string, max: number): string {
  if (typeof v !== 'string') return fallback;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, '').trim().slice(0, max);
  return s === '' ? fallback : s;
}

export function cleanName(v: unknown, fallback: string): string {
  return cleanText(v, fallback, LIMITS.maxNameLength);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function sanitizeExercise(v: unknown, i: number): Exercise {
  const o = isRecord(v) ? v : {};
  return {
    id: typeof o.id === 'string' && o.id.length > 0 && o.id.length <= 40 ? o.id : newId(),
    name: cleanName(o.name, `Exercise ${i + 1}`),
    workSec: clampInt(o.workSec, 1, LIMITS.maxSeconds, 30),
    kind: o.kind === 'reps' ? 'reps' : 'timed',
    reps: clampInt(o.reps, 1, LIMITS.maxReps, 10),
  };
}

export function sanitizeRoutine(v: unknown, fallback: Routine): Routine {
  if (!isRecord(v)) return fallback;
  const list = Array.isArray(v.exercises) ? v.exercises.slice(0, LIMITS.maxExercises) : [];
  const exercises = list.map(sanitizeExercise);
  return {
    id: typeof v.id === 'string' && v.id.length > 0 && v.id.length <= 40 ? v.id : fallback.id,
    name: cleanName(v.name, fallback.name),
    exercises: exercises.length > 0 ? exercises : fallback.exercises,
    restBetweenExercisesSec: clampInt(v.restBetweenExercisesSec, 0, LIMITS.maxSeconds, fallback.restBetweenExercisesSec),
    restBetweenRoundsSec: clampInt(v.restBetweenRoundsSec, 0, LIMITS.maxSeconds, fallback.restBetweenRoundsSec),
    rounds: clampInt(v.rounds, 1, LIMITS.maxRounds, fallback.rounds),
    prepSec: clampInt(v.prepSec, 0, 60, fallback.prepSec),
  };
}

const SOUNDS: SoundMode[] = ['voice', 'beeps', 'silent'];
const THEMES: ThemeChoice[] = ['auto', 'light', 'dark'];
const COUNTS: CountMode[] = ['last3', 'every'];
const VOICE_PREFS: VoicePref[] = ['auto', 'female', 'male'];

export function sanitizeSettings(v: unknown): Settings {
  const o = isRecord(v) ? v : {};
  return {
    sound: SOUNDS.includes(o.sound as SoundMode) ? (o.sound as SoundMode) : DEFAULT_SETTINGS.sound,
    vibrate: o.vibrate === true,
    halfway: o.halfway === true,
    sides: o.sides === true,
    theme: THEMES.includes(o.theme as ThemeChoice) ? (o.theme as ThemeChoice) : DEFAULT_SETTINGS.theme,
    countAloud: COUNTS.includes(o.countAloud as CountMode) ? (o.countAloud as CountMode) : DEFAULT_SETTINGS.countAloud,
    voicePref: VOICE_PREFS.includes(o.voicePref as VoicePref) ? (o.voicePref as VoicePref) : DEFAULT_SETTINGS.voicePref,
    voiceName: typeof o.voiceName === 'string' ? cleanText(o.voiceName, '', 120) : '',
  };
}

export function sanitizeSaved(v: unknown): Routine[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: Routine[] = [];
  for (const item of v.slice(0, LIMITS.maxSavedRoutines)) {
    const r = sanitizeRoutine(item, defaultRoutine());
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

export type Mode = 'quick' | 'routine';

/** Quick mode's working copy. Routines live in the saved list, not here. */
export interface AppState {
  mode: Mode;
  quick: Routine;
}

export function sanitizeAppState(v: unknown): AppState {
  const o = isRecord(v) ? v : {};
  const quick = sanitizeRoutine(o.quick, defaultQuick());
  // Quick mode is always exactly one exercise.
  quick.exercises = quick.exercises.slice(0, 1);
  return {
    mode: o.mode === 'routine' ? 'routine' : 'quick',
    quick,
  };
}

const KEY = 'intervo:';

export function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(KEY + key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(KEY + key, JSON.stringify(value));
  } catch {
    /* storage unavailable or full: the app still works, it just won't remember */
  }
}
