import { useEffect, useState } from 'react';
import { Finish } from './components/Finish';
import { Running } from './components/Running';
import { SettingsSheet } from './components/SettingsSheet';
import { Setup } from './components/Setup';
import { UpdatePrompt } from './components/UpdatePrompt';
import { unlockAudio } from './engine/device';
import { sanitizeAppState, sanitizeSaved, sanitizeSettings, readJson, writeJson } from './engine/storage';
import type { AppState } from './engine/storage';
import type { Routine, Settings } from './engine/types';
import { LIMITS } from './engine/types';
import { useInstallPrompt } from './hooks';
import { S } from './strings';

type Screen = { name: 'setup' } | { name: 'running'; routine: Routine; run: number } | { name: 'finish'; routine: Routine; elapsedSec: number };

export default function App() {
  const [state, setState] = useState<AppState>(() => sanitizeAppState(readJson('state')));
  const [settings, setSettings] = useState<Settings>(() => sanitizeSettings(readJson('settings')));
  const [saved, setSaved] = useState<Routine[]>(() => sanitizeSaved(readJson('saved')));
  const [screen, setScreen] = useState<Screen>({ name: 'setup' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { canInstall, promptInstall } = useInstallPrompt();

  useEffect(() => writeJson('state', state), [state]);
  useEffect(() => writeJson('settings', settings), [settings]);
  useEffect(() => writeJson('saved', saved), [saved]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  const start = (routine: Routine) => {
    unlockAudio(); // must happen inside the tap for iOS
    setScreen((s) => ({ name: 'running', routine, run: s.name === 'running' ? s.run + 1 : 1 }));
  };

  if (screen.name === 'running') {
    return (
      <Running
        key={screen.run}
        routine={screen.routine}
        settings={settings}
        onFinish={(elapsedSec) => setScreen({ name: 'finish', routine: screen.routine, elapsedSec })}
        onExit={() => setScreen({ name: 'setup' })}
      />
    );
  }

  if (screen.name === 'finish') {
    const routine = screen.routine;
    return (
      <main className="page">
        <Finish elapsedSec={screen.elapsedSec} rounds={routine.rounds} onAgain={() => start(routine)} onBack={() => setScreen({ name: 'setup' })} />
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
