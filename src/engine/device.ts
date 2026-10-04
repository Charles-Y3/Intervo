import type { Beep, Cue } from './cues';
import type { Settings, VoicePref } from './types';
import { pickVoice } from './voices';

/** Phone hardware: beeps, speech, vibration, screen wake lock. Every call is
 * best-effort and swallows errors, so an unsupported feature never breaks a
 * workout. Audio and speech must be unlocked inside a user tap (iOS). */

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

const BEEPS: Record<Beep, { freq: number[]; dur: number; gain: number }> = {
  tick: { freq: [660], dur: 0.12, gain: 0.35 },
  go: { freq: [880, 1175], dur: 0.2, gain: 0.45 },
  rest: { freq: [523, 392], dur: 0.2, gain: 0.4 },
  half: { freq: [740], dur: 0.15, gain: 0.35 },
  done: { freq: [523, 659, 784, 1047], dur: 0.2, gain: 0.45 },
};

export function playBeep(kind: Beep): void {
  const c = audioCtx();
  if (!c) return;
  try {
    const { freq, dur, gain } = BEEPS[kind];
    freq.forEach((f, i) => {
      const t0 = c.currentTime + i * dur * 0.9;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    });
  } catch {
    /* ignore */
  }
}

let voicePref: VoicePref = 'auto';
let voiceName = '';

/** Set from the app whenever the voice settings change. */
export function setVoicePreference(pref: VoicePref, name: string): void {
  voicePref = pref;
  voiceName = name;
}

export function speak(text: string, volume = 1): void {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(window.speechSynthesis.getVoices(), voicePref, voiceName);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? 'en-US';
    u.rate = 1.05;
    u.volume = volume;
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}

export function stopSpeaking(): void {
  try {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

/** Call from the Start tap. */
export function unlockAudio(): void {
  audioCtx();
  speak(' ', 0);
}

export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function vibrate(pattern: number[]): void {
  try {
    if (canVibrate()) navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

export function performCue(cue: Cue | null, _settings: Settings): void {
  if (!cue) return;
  if (cue.beep) playBeep(cue.beep);
  if (cue.speech) speak(cue.speech);
  if (cue.vibrate) vibrate(cue.vibrate);
}

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

/** Keep the screen on while a workout runs; re-acquire after the tab returns. */
export function createWakeLock() {
  let sentinel: WakeLockSentinelLike | null = null;
  let wanted = false;

  async function acquire() {
    try {
      const wl = (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock;
      if (wl && !sentinel) sentinel = await wl.request('screen');
    } catch {
      sentinel = null;
    }
  }
  function onVisible() {
    if (document.visibilityState === 'visible' && wanted) {
      sentinel = null;
      void acquire();
    }
  }
  return {
    on() {
      wanted = true;
      document.addEventListener('visibilitychange', onVisible);
      void acquire();
    },
    off() {
      wanted = false;
      document.removeEventListener('visibilitychange', onVisible);
      const s = sentinel;
      sentinel = null;
      if (s) void s.release().catch(() => undefined);
    },
  };
}
