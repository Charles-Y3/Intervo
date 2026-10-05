import { useEffect, useState } from 'react';
import { canVibrate, playBeep, setVoicePreference, speak, vibrate } from '../engine/device';
import type { CountMode, Settings, SoundMode, ThemeChoice, VoicePref } from '../engine/types';
import { englishVoices, genderOf, pickVoice } from '../engine/voices';
import { S } from '../strings';
import type { BackupData } from '../engine/backup';
import { BackupSection } from './BackupSection';
import { RemindersSection } from './RemindersSection';
import { Sheet } from './Sheet';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
  /** Everything on this phone, and how to replace it (for Backup). */
  backup: { data: BackupData; onRestore: (next: BackupData) => void };
}

type Tab = 'sound' | 'workout' | 'reminders' | 'general';

export function SettingsSheet({ settings, onChange, onClose, backup }: Props) {
  const [tab, setTab] = useState<Tab>('sound');
  const tabs: [Tab, string][] = [
    ['sound', S.tabSound],
    ['workout', S.tabWorkout],
    ['reminders', S.tabReminders],
    ['general', S.tabGeneral],
  ];
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
  const voices = useVoices();
  const english = englishVoices(voices);
  const counts: [CountMode, string][] = [
    ['last3', S.countLast3],
    ['every', S.countEvery],
  ];
  const prefs: [VoicePref, string][] = [
    ['auto', S.voiceAuto],
    ['female', S.voiceFemale],
    ['male', S.voiceMale],
  ];
  const noMatch =
    voices.length > 0 && settings.voicePref !== 'auto' && !settings.voiceName && !pickVoice(voices, settings.voicePref, '');

  // Apply immediately so the test phrase uses the voice that was just chosen.
  const chooseVoice = (voicePref: VoicePref, voiceName: string) => {
    set({ voicePref, voiceName });
    setVoicePreference(voicePref, voiceName);
    speak(S.voiceTestPhrase);
  };

  return (
    <Sheet title={S.settings} onClose={onClose}>
      <div className="tabBar" role="tablist" aria-label={S.settingsSections}>
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" id={`settings-tab-${id}`} aria-selected={tab === id} aria-controls="settings-panel" className={`seg${tab === id ? ' segOn' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${tab}`} className="tabPanel">
      {tab === 'sound' && (
      <>
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

      {settings.sound === 'voice' && (
        <>
          <div className="field">
            <div className="fieldLabel">{S.countAloud}</div>
            <div className="chips" role="group" aria-label={S.countAloud}>
              {counts.map(([v, label]) => (
                <button key={v} className={`chip${settings.countAloud === v ? ' chipOn' : ''}`} aria-pressed={settings.countAloud === v} onClick={() => set({ countAloud: v })}>
                  {label}
                </button>
              ))}
            </div>
            {settings.countAloud === 'every' && <p className="muted">{S.countNote}</p>}
          </div>

          <div className="field">
            <div className="fieldLabel">{S.voiceLabel}</div>
            <div className="chips" role="group" aria-label={S.voiceLabel}>
              {prefs.map(([v, label]) => (
                <button
                  key={v}
                  className={`chip${settings.voicePref === v && !settings.voiceName ? ' chipOn' : ''}`}
                  aria-pressed={settings.voicePref === v && !settings.voiceName}
                  onClick={() => chooseVoice(v, '')}
                >
                  {label}
                </button>
              ))}
            </div>
            {noMatch && (
              <p className="muted" role="status">
                {settings.voicePref === 'female' ? S.voiceNoMatch : S.voiceNoMatchMale}
              </p>
            )}
            {english.length > 0 ? (
              <select
                className="textInput"
                aria-label={S.voiceList}
                value={english.some((v) => v.name === settings.voiceName) ? settings.voiceName : ''}
                onChange={(e) => chooseVoice(settings.voicePref, e.target.value)}
              >
                <option value="">{S.voiceList}</option>
                {english.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name}
                    {genderOf(v) === 'female' ? ' (female)' : genderOf(v) === 'male' ? ' (male)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <p className="muted">{S.voiceNone}</p>
            )}
            <button className="btn btnSmall" onClick={() => speak(S.voiceTestPhrase)}>
              {S.voiceTest}
            </button>
          </div>
        </>
      )}

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
      </>
      )}

      {tab === 'workout' && (
      <>
      <div className="field">
        <div className="fieldLabel">{S.weeklyGoal}</div>
        <div className="chips" role="group" aria-label={S.weeklyGoal}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
            <button key={n} className={`chip${settings.weeklyGoal === n ? ' chipOn' : ''}`} aria-pressed={settings.weeklyGoal === n} onClick={() => set({ weeklyGoal: n })}>
              {n === 0 ? S.goalOff : n}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="fieldLabel">{S.distanceUnitLabel}</div>
        <div className="chips" role="group" aria-label={S.distanceUnitLabel}>
          {(['km', 'mi'] as const).map((u) => (
            <button key={u} className={`chip${settings.distanceUnit === u ? ' chipOn' : ''}`} aria-pressed={settings.distanceUnit === u} onClick={() => set({ distanceUnit: u })}>
              {u}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="fieldLabel">{S.units}</div>
        <div className="chips" role="group" aria-label={S.units}>
          {(['kg', 'lb'] as const).map((u) => (
            <button key={u} className={`chip${settings.units === u ? ' chipOn' : ''}`} aria-pressed={settings.units === u} onClick={() => set({ units: u })}>
              {u}
            </button>
          ))}
        </div>
      </div>

      </>
      )}

      {tab === 'reminders' && <RemindersSection reminder={settings.reminder} onChange={(reminder) => set({ reminder })} />}

      {tab === 'general' && (
      <>
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
      <BackupSection data={backup.data} onRestore={backup.onRestore} />
      </>
      )}
      </div>
    </Sheet>
  );
}

/** Voices load asynchronously in most browsers; re-read when they arrive. */
function useVoices(): SpeechSynthesisVoice[] {
  const read = () => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis.getVoices() : []);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(read);
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const update = () => setVoices(window.speechSynthesis.getVoices());
    update();
    window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);
  return voices;
}
