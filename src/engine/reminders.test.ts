import { describe, expect, it } from 'vitest';
import { describeReminder, formatTime12, toggleDay } from './reminders';
import { DEFAULT_SETTINGS, sanitizeReminder, sanitizeSettings } from './storage';

describe('reminder schedule helpers', () => {
  it('toggles weekdays but never leaves none', () => {
    expect(toggleDay([1, 3, 5], 2)).toEqual([1, 2, 3, 5]);
    expect(toggleDay([1, 3, 5], 3)).toEqual([1, 5]);
    expect(toggleDay([4], 4)).toEqual([4]); // last one cannot be removed
    expect(toggleDay([0, 6], 3)).toEqual([0, 3, 6]);
  });

  it('formats times the 12 hour way', () => {
    expect(formatTime12('18:00')).toBe('6:00 PM');
    expect(formatTime12('00:05')).toBe('12:05 AM');
    expect(formatTime12('12:00')).toBe('12:00 PM');
    expect(formatTime12('09:30')).toBe('9:30 AM');
    expect(formatTime12('23:59')).toBe('11:59 PM');
  });

  it('describes the schedule, week starting Monday', () => {
    expect(describeReminder({ time: '18:00', days: [5, 1, 3] })).toBe('Mon, Wed, Fri at 6:00 PM');
    expect(describeReminder({ time: '07:00', days: [0, 6] })).toBe('Sat, Sun at 7:00 AM');
    expect(describeReminder({ time: '07:00', days: [0, 1, 2, 3, 4, 5, 6] })).toBe('Every day at 7:00 AM');
  });
});

describe('stored reminder settings are untrusted', () => {
  it('default is off, 6 PM Mon Wed Fri', () => {
    expect(DEFAULT_SETTINGS.reminder).toEqual({ enabled: false, time: '18:00', days: [1, 3, 5] });
  });

  it('bad values fall back; good ones are kept and tidied', () => {
    expect(sanitizeReminder(null)).toEqual({ enabled: false, time: '18:00', days: [1, 3, 5] });
    expect(sanitizeReminder({ enabled: 'yes', time: '25:99', days: 'all' })).toEqual({ enabled: false, time: '18:00', days: [1, 3, 5] });
    expect(sanitizeReminder({ enabled: true, time: '07:15', days: [6, 0, 6, 9, -1, 2.5, '3'] })).toEqual({ enabled: true, time: '07:15', days: [0, 6] });
    expect(sanitizeReminder({ time: '7:15' }).time).toBe('18:00'); // must be zero padded
    expect(sanitizeReminder({ days: [] }).days).toEqual([1, 3, 5]);
    expect(sanitizeSettings({ reminder: { enabled: true, time: '06:00', days: [2] } }).reminder).toEqual({ enabled: true, time: '06:00', days: [2] });
  });
});
