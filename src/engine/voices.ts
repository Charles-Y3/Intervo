import type { VoicePref } from './types';

/** Browsers expose no voice gender, so we infer it from the voice name
 * (Samantha, Zira, "Google UK English Female", ...). Unknown names stay
 * "unknown", and the settings screen also offers an exact voice list so the
 * user is never stuck with a wrong guess. */
export interface VoiceInfo {
  name: string;
  lang: string;
  voiceURI?: string;
}

const FEMALE_NAMES = new Set([
  'samantha', 'karen', 'moira', 'tessa', 'victoria', 'susan', 'zira', 'hazel', 'aria', 'jenny', 'libby',
  'sonia', 'michelle', 'allison', 'ava', 'fiona', 'serena', 'kate', 'joanna', 'emma', 'ivy', 'kendra',
  'kimberly', 'salli', 'amy', 'nicole', 'olivia', 'catherine', 'heather', 'linda', 'jane', 'siri',
  'nora', 'natasha', 'clara', 'ana', 'mia', 'ruth', 'matilda', 'grace', 'molly', 'evelyn', 'nova',
]);

const MALE_NAMES = new Set([
  'daniel', 'alex', 'fred', 'david', 'mark', 'guy', 'ryan', 'george', 'oliver', 'arthur', 'tom', 'thomas',
  'james', 'richard', 'rishi', 'aaron', 'matthew', 'brian', 'russell', 'joey', 'justin', 'eric',
  'christopher', 'roger', 'gordon', 'liam', 'william', 'reed', 'neil', 'steffan',
]);

export function genderOf(v: VoiceInfo): 'female' | 'male' | 'unknown' {
  const s = `${v.name} ${v.voiceURI ?? ''}`.toLowerCase();
  if (/female|woman/.test(s)) return 'female';
  if (/(^|[^a-z])male/.test(s)) return 'male';
  const tokens = s.split(/[^a-z]+/).filter(Boolean);
  if (tokens.some((t) => FEMALE_NAMES.has(t))) return 'female';
  if (tokens.some((t) => MALE_NAMES.has(t))) return 'male';
  return 'unknown';
}

export function isEnglish(v: VoiceInfo): boolean {
  return /^en([-_]|$)/i.test(v.lang);
}

/** English voices for the picker, sorted by name. */
export function englishVoices<T extends VoiceInfo>(voices: T[]): T[] {
  return voices.filter(isEnglish).sort((a, b) => a.name.localeCompare(b.name));
}

function langRank(lang: string): number {
  const l = lang.toLowerCase().replace('_', '-');
  if (l === 'en-us') return 0;
  if (l === 'en-gb') return 1;
  return 2;
}

/** The voice to use, or undefined to let the browser use its default.
 * An exact chosen name wins (if still installed); otherwise the best
 * English voice of the preferred gender. */
export function pickVoice<T extends VoiceInfo>(voices: T[], pref: VoicePref, name: string): T | undefined {
  if (name) {
    const exact = voices.find((v) => v.name === name);
    if (exact) return exact;
  }
  if (pref === 'auto') return undefined;
  const matches = englishVoices(voices).filter((v) => genderOf(v) === pref);
  matches.sort((a, b) => langRank(a.lang) - langRank(b.lang));
  return matches[0];
}
