import { useEffect, useState } from 'react';
import { Finish } from './components/Finish';
import { History } from './components/History';
import { Running } from './components/Running';
import { SettingsSheet } from './components/SettingsSheet';
import { Setup } from './components/Setup';
import { UpdatePrompt } from './components/UpdatePrompt';
import { setVoicePreference, unlockAudio } from './engine/device';
import { buildEntry, sanitizeHistory, worthLogging } from './engine/history';
import type { HistoryEntry } from './engine/history';
import { sanitizeAppState, sanitizeSaved, sanitizeSettings, readJson, writeJson } from './engine/storage';
import type { AppState } from './engine/storage';
import type { RunResult, Routine, Settings } from './engine/types';
import { LIMITS } from './engine/types';
import { useInstallPrompt } from './hooks';
import { S } from './strings';

type Screen = { name: 'setup' } | { name: 'history' } | { name: 'running'; routine: Routine; run: number } | { name: 'finish'; routine: Routine; elapsedSec: number };

export default function App() {
  const [state, setState] = useState<AppState>(() => sanitizeAppState(readJson('state')));
  const [settings, setSettings] = useState<Settings>(() => sanitizeSettings(readJson('settings')));
  const [saved, setSaved] = useState<Routine[]>(() => sanitizeSaved(readJson('saved')));
  const [history, setHistory] = useState<HistoryEntry[]>(() => sanitizeHistory(readJson('history')));
  const [screen, setScreen] = useState<Screen>({ name: 'setup' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { canInstall, promptInstall } = useInstallPrompt();

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

  const log = (routine: Routine, result: RunResult, elapsedSec: number, completed: boolean) => {
    if (!worthLogging(result)) return;
    const entry = buildEntry(routine, result, elapsedSec, completed, Date.now());
    setHistory((list) => [entry, ...list].slice(0, LIMITS.maxHistory));
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
          log(screen.routine, result, elapsedSec, true);
          setScreen({ name: 'finish', routine: screen.routine, elapsedSec });
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
    return (
      <main className="page">
        <Finish elapsedSec={screen.elapsedSec} rounds={routine.rounds} onAgain={() => start(routine)} onBack={() => setScreen({ name: 'setup' })} onHistory={() => setScreen({ name: 'history' })} />
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
        onState={setState}
        onStart={start}
        onSave={(r) => setSaved((list) => [r, ...list].slice(0, LIMITS.maxSavedRoutines))}
        onDeleteSaved={(id) => setSaved((list) => list.filter((x) => x.id !== id))}
      />
      {settingsOpen && <SettingsSheet settings={settings} onChange={setSettings} onClose={() => setSettingsOpen(false)} />}
    </main>
  );
}
