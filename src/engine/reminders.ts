import type { ReminderSettings } from './types';

/** Monday first, the way a week is usually shown. Values are JS weekdays (0 = Sunday). */
export const WEEK_ORDER: { day: number; label: string }[] = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
];

/** Toggle a weekday, never leaving the list empty (a reminder needs at least one day). */
export function toggleDay(days: number[], day: number): number[] {
  if (days.includes(day)) return days.length > 1 ? days.filter((d) => d !== day) : days;
  return [...days, day].sort((a, b) => a - b);
}

/** "6:00 PM" from "18:00". */
export function formatTime12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "Mon, Wed, Fri at 6:00 PM", or "Every day at 6:00 PM". */
export function describeReminder(r: Pick<ReminderSettings, 'time' | 'days'>): string {
  const names = WEEK_ORDER.filter((w) => r.days.includes(w.day)).map((w) => w.label);
  const when = names.length === 7 ? 'Every day' : names.join(', ');
  return `${when} at ${formatTime12(r.time)}`;
}
