import { useEffect, useRef, useState } from 'react';
import { WEEK_ORDER, describeReminder, toggleDay } from '../engine/reminders';
import type { ReminderSettings } from '../engine/types';
import { disableReminders, enableReminders, isPushSupported, isSubscribed, showTestNotification, syncReminders } from '../services/push';
import type { Failure } from '../services/push';
import { S } from '../strings';

type Status = 'idle' | 'working' | 'ok' | 'lost' | 'tested' | 'test-failed' | Failure;

const MESSAGES: Partial<Record<Status, string>> = {
  unsupported: S.remindersUnsupported,
  denied: S.remindersDenied,
  'not-configured': S.remindersNotConfigured,
  failed: S.remindersFailed,
  lost: S.remindersLost,
  tested: S.remindersTestSent,
  'test-failed': S.remindersTestFailed,
};

/** Workout reminders: on/off, time, weekdays. Turning it on asks the phone for notification
 * permission and registers the schedule with the server; changes while on are re-sent. */
export function RemindersSection({ reminder, onChange }: { reminder: ReminderSettings; onChange: (r: ReminderSettings) => void }) {
  const supported = isPushSupported();
  const [status, setStatus] = useState<Status>(supported ? 'idle' : 'unsupported');
  const timer = useRef<number | undefined>(undefined);

  // Settings can say "on" while the browser says otherwise (permission revoked, data cleared).
  useEffect(() => {
    if (!reminder.enabled || !supported) return;
    let alive = true;
    void (async () => {
      if (await isSubscribed()) return alive ? setStatus('ok') : undefined;
      const res = await syncReminders(reminder); // re-subscribe quietly if permission is still granted
      if (!alive) return;
      if (res.ok) setStatus('ok');
      else {
        setStatus('lost');
        onChange({ ...reminder, enabled: false });
      }
    })();
    return () => {
      alive = false;
      window.clearTimeout(timer.current);
    };
    // Only on open: later changes go through update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle(on: boolean) {
    setStatus('working');
    if (!on) {
      await disableReminders();
      onChange({ ...reminder, enabled: false });
      setStatus('idle');
      return;
    }
    // Must start inside the tap: browsers only show the permission prompt for a user gesture.
    const res = await enableReminders(reminder);
    if (res.ok) {
      onChange({ ...reminder, enabled: true });
      setStatus('ok');
    } else setStatus(res.reason);
  }

  function update(next: ReminderSettings) {
    onChange(next);
    if (!next.enabled) return;
    window.clearTimeout(timer.current);
    // Wait for the finger to stop tapping days before telling the server.
    timer.current = window.setTimeout(async () => {
      const res = await syncReminders(next);
      setStatus(res.ok ? 'ok' : res.reason);
    }, 500);
  }

  const message = MESSAGES[status];

  return (
    <div className="field" data-testid="reminders">
      <div className="fieldLabel">{S.remindersTitle}</div>
      <label className="toggleRow">
        <span>{S.remindersToggle}</span>
        <input
          type="checkbox"
          checked={reminder.enabled}
          disabled={!supported || status === 'working'}
          onChange={(e) => void toggle(e.target.checked)}
        />
      </label>

      <label className="dateLabel">
        {S.remindersTime}
        <input
          className="textInput"
          type="time"
          aria-label={S.remindersTime}
          value={reminder.time}
          onChange={(e) => e.target.value && update({ ...reminder, time: e.target.value })}
        />
      </label>

      <div className="chips" role="group" aria-label={S.remindersDays}>
        {WEEK_ORDER.map(({ day, label }) => (
          <button
            key={day}
            className={`chip${reminder.days.includes(day) ? ' chipOn' : ''}`}
            aria-pressed={reminder.days.includes(day)}
            onClick={() => update({ ...reminder, days: toggleDay(reminder.days, day) })}
          >
            {label}
          </button>
        ))}
      </div>

      {reminder.enabled && status === 'ok' && (
        <p className="okText" role="status" data-testid="reminder-status">
          {S.remindersOn(describeReminder(reminder))}
        </p>
      )}
      {message && (
        <p className={status === 'tested' ? 'okText' : 'errorText'} role="status" data-testid="reminder-message">
          {message}
        </p>
      )}
      {reminder.enabled && (
        <button
          className="btn btnSmall"
          onClick={async () => setStatus((await showTestNotification()) ? 'tested' : 'test-failed')}
        >
          {S.remindersTest}
        </button>
      )}
      <p className="muted">{S.remindersPrivacy}</p>
    </div>
  );
}
