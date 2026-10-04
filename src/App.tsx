import { useEffect, useMemo, useState } from 'react';
import { Finish } from './components/Finish';
import { History } from './components/History';
import { Running } from './components/Running';
import { SettingsSheet } from './components/SettingsSheet';
import { Setup } from './components/Setup';
import { UpdatePrompt } from './components/UpdatePrompt';
import { setVoicePreference, unlockAudio } from './engine/device';
import type { BackupData } from './engine/backup';
import { withExamples } from './engine/examples';
import { buildEntry, sanitizeHistory, weeklyProgress, worthLogging } from './engine/history';
import type { HistoryEntry } from './engine/history';
import { cleanText, sanitizeAppState, sanitizeSaved, sanitizeSettings, readJson, writeJson } from './engine/storage';
import type { AppState } from './engine/storage';
import type { RunResult, Routine, Settings } from './engine/types';
import { LIMITS } from './engine/types';
import { useInstallPrompt } from './hooks';
import { syncReminders } from './services/push';
import { S } from './strings';

type Screen = { name: 'setup' } | { name: 'history' } | { name: 'running'; routine: Routine; run: number } | { name: 'finish'; routine: Routine; elapsedSec: number; entryId: string | null };

export default function App() {
  const [state, setState] = useState<AppState>(() => sanitizeAppState(readJson('state')));
  const [settings, setSettings] = useState<Settings>(() => sanitizeSettings(readJson('settings')));
  const [saved, setSaved] = useState<Routine[]>(() => sanitizeSaved(readJson('saved')));
  const [history, setHistory] = useState<HistoryEntry[]>(() => sanitizeHistory(readJson('history')));
  const [screen, setScreen] = useState<Screen>({ name: 'setup' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { canInstall, promptInstall } = useInstallPrompt();

  // Reminders: each time the app opens, re-send the schedule. This keeps the time zone
  // current after travel and quietly restores a server record that was lost.
  useEffect(() => {
    if (settings.reminder.enabled) void syncReminders(settings.reminder);
    // Once per app open, using the settings loaded at startup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => writeJson('state', state), [state]);
  useEffect(() => writeJson('settings', settings), [settings]);
  useEffect(() => setVoicePreference(settings.voicePref, settings.voiceName), [settings.voicePref, settings.voiceName]);
  useEffect(() => writeJson('saved', saved), [saved]);
  useEffect(() => writeJson('history', history), [history]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  const start = (routine: Routine) => {
    unlockAudio(); // must happen inside the tap for iOS
    setScreen((s) => ({ name: 'running', routine, run: s.name === 'running' ? s.run + 1 : 1 }));
  };

  /** Log a workout; returns the new entry's id (or null if it was too short to log). */
  const log = (routine: Routine, result: RunResult, elapsedSec: number, completed: boolean): string | null => {
    if (!worthLogging(result)) return null;
    const entry = buildEntry(routine, result, elapsedSec, completed, Date.now(), settings.units);
    setHistory((list) => [entry, ...list].slice(0, LIMITS.maxHistory));
    return entry.id;
  };

  const goal = useMemo(() => weeklyProgress(history, settings.weeklyGoal, Date.now()), [history, settings.weeklyGoal]);
  const backupData: BackupData = { settings, state, saved, history };
  const restore = (next: BackupData) => {
    setSettings({ ...next.settings, reminder: { ...next.settings.reminder, enabled: false } });
    setState(next.state);
    setSaved(next.saved);
    setHistory(next.history);
  };

  if (screen.name === 'history') {
    return (
      <History
        entries={history}
        onDelete={(id) => setHistory((list) => list.filter((e) => e.id !== id))}
        onClear={() => setHistory([])}
        onBack={() => setScreen({ name: 'setup' })}
      />
    );
  }

  if (screen.name === 'running') {
    return (
      <Running
        key={screen.run}
        routine={screen.routine}
        settings={settings}
        onFinish={(result, elapsedSec) => {
          const entryId = log(screen.routine, result, elapsedSec, true);
          setScreen({ name: 'finish', routine: screen.routine, elapsedSec, entryId });
        }}
        onExit={(result, elapsedSec) => {
          log(screen.routine, result, elapsedSec, false);
          setScreen({ name: 'setup' });
        }}
      />
    );
  }

  if (screen.name === 'finish') {
    const routine = screen.routine;
    const entryId = screen.entryId;
    return (
      <main className="page">
        <Finish
          elapsedSec={screen.elapsedSec}
          rounds={routine.rounds}
          onAgain={() => start(routine)}
          onBack={() => setScreen({ name: 'setup' })}
          onHistory={() => setScreen({ name: 'history' })}
          onNote={(text) => setHistory((list) => list.map((e) => (e.id === entryId ? { ...e, note: cleanText(text, '', LIMITS.maxNote) } : e)))}
        />
      </main>
    );
  }

  return (
    <main className="page">
      <UpdatePrompt />
      <header className="header">
        <h1 className="brand">{S.appName}</h1>
        <div className="headerActions">
          {canInstall && (
            <button className="btn btnSmall" onClick={() => void promptInstall()}>
              {S.install}
            </button>
          )}
          <button className="btn btnSmall" onClick={() => setScreen({ name: 'history' })}>
            {S.history}
          </button>
          <button className="btn btnSmall" onClick={() => setSettingsOpen(true)}>
            {S.settings}
          </button>
        </div>
      </header>
      <Setup
        state={state}
        saved={saved}
        history={history}
        goal={goal}
        unit={settings.units}
        onAddExamples={() => setSaved((list) => withExamples(list, LIMITS.maxSavedRoutines))}
        onState={setState}
        onStart={start}
        onUpsert={(r) =>
          setSaved((list) => (list.some((x) => x.id === r.id) ? list.map((x) => (x.id === r.id ? r : x)) : [r, ...list].slice(0, LIMITS.maxSavedRoutines)))
        }
        onDeleteSaved={(id) => setSaved((list) => list.filter((x) => x.id !== id))}
      />
      {settingsOpen && <SettingsSheet settings={settings} onChange={setSettings} onClose={() => setSettingsOpen(false)} backup={{ data: backupData, onRestore: restore }} />}
    </main>
  );
}
