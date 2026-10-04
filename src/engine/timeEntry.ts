import { LIMITS } from './types';

/** Number-pad entry fills from the right like a phone timer:
 * "1","3","0" -> 1:30; "9","0" -> 0:90 -> 1:30. At most 4 digits. */
export function digitsToSeconds(digits: string): number {
  const d = digits.replace(/\D/g, '').slice(-4);
  if (d === '') return 0;
  const ss = Number(d.slice(-2));
  const mm = d.length > 2 ? Number(d.slice(0, -2)) : 0;
  return Math.min(LIMITS.maxSeconds, mm * 60 + ss);
}

export function pushDigit(digits: string, key: string): string {
  if (!/^\d{1,2}$/.test(key)) return digits;
  const next = (digits + key).replace(/^0+/, '');
  return next.slice(-4);
}

export function popDigit(digits: string): string {
  return digits.slice(0, -1);
}

/** Digits that would display the given seconds (for pre-filling the pad). */
export function secondsToDigits(sec: number): string {
  const s = Math.max(0, Math.min(LIMITS.maxSeconds, Math.round(sec)));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return mm === 0 ? (ss === 0 ? '' : String(ss)) : `${mm}${String(ss).padStart(2, '0')}`;
}
