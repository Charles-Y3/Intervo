import { canVibrate, speak, playBeep, vibrate } from '../engine/device';
import type { Settings, SoundMode, ThemeChoice } from '../engine/types';
import { S } from '../strings';
import { Sheet } from './Sheet';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
}

export function SettingsSheet({ settings, onChange, onClose }: Props) {
  const set = (p: Partial<Settings>) => onChange({ ...settings, ...p });
  const sounds: [SoundMode, string][] = [
    ['voice', S.soundVoice],
    ['beeps', S.soundBeeps],
    ['silent', S.soundSilent],
  ];
  const themes: [ThemeChoice, string][] = [
    ['auto', S.themeAuto],
    ['light', S.themeLight],
    ['dark', S.themeDark],
  ];
  const vib = canVibrate();

  return (
    <Sheet title={S.settings} onClose={onClose}>
      <div className="field">
        <div className="fieldLabel">{S.sound}</div>
        <div className="chips" role="group" aria-label={S.sound}>
          {sounds.map(([v, label]) => (
            <button
              key={v}
              className={`chip${settings.sound === v ? ' chipOn' : ''}`}
              aria-pressed={settings.sound === v}
              onClick={() => {
                set({ sound: v });
                // Sample on tap; this is also the user gesture that unlocks audio on iOS.
                if (v === 'voice') speak('Voice on');
                if (v === 'beeps') playBeep('go');
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="muted">{S.voiceNote}</p>
      </div>

      <label className="toggleRow">
        <span>{S.halfway}</span>
        <input type="checkbox" checked={settings.halfway} onChange={(e) => set({ halfway: e.target.checked })} />
      </label>
      <label className="toggleRow">
        <span>{S.sides}</span>
        <input type="checkbox" checked={settings.sides} onChange={(e) => set({ sides: e.target.checked })} />
      </label>
      <label className="toggleRow">
        <span>{S.vibration}</span>
        <input
          type="checkbox"
          checked={settings.vibrate && vib}
          disabled={!vib}
          onChange={(e) => {
            set({ vibrate: e.target.checked });
            if (e.target.checked) vibrate([100]);
          }}
        />
      </label>
      {!vib && <p className="muted">{S.vibrateUnsupported}</p>}

      <div className="field">
        <div className="fieldLabel">{S.theme}</div>
        <div className="chips" role="group" aria-label={S.theme}>
          {themes.map(([v, label]) => (
            <button key={v} className={`chip${settings.theme === v ? ' chipOn' : ''}`} aria-pressed={settings.theme === v} onClick={() => set({ theme: v })}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
