import { useEffect, useMemo, useRef, useState } from 'react';
import { cueFor } from '../engine/cues';
import { createWakeLock, performCue, stopSpeaking } from '../engine/device';
import { buildSteps, formatClock, formatShort } from '../engine/plan';
import { Runner } from '../engine/runner';
import type { RunEvent, RunResult, Routine, Settings } from '../engine/types';
import { S } from '../strings';
import { Sheet } from './Sheet';

interface Props {
  routine: Routine;
  settings: Settings;
  /** Workout ran to the end. */
  onFinish: (result: RunResult, elapsedSec: number) => void;
  /** User ended it early; result holds what was done so far. */
  onExit: (result: RunResult, elapsedSec: number) => void;
}

const R = 90;
const CIRC = 2 * Math.PI * R;

export function Running({ routine, settings, onFinish, onExit }: Props) {
  const steps = useMemo(() => buildSteps(routine), [routine]);
  const [muted, setMuted] = useState(false);
  const [, setFrame] = useState(0);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const runnerRef = useRef<Runner | null>(null);
  const settingsRef = useRef(settings);
  const mutedRef = useRef(muted);
  const elapsedRef = useRef(0);
  const doneRef = useRef(false);
  settingsRef.current = settings;
  mutedRef.current = muted;

  const fire = (events: RunEvent[]) => {
    const eff: Settings = mutedRef.current ? { ...settingsRef.current, sound: 'silent', vibrate: false } : settingsRef.current;
    for (const ev of events) performCue(cueFor(ev, steps, eff), eff);
    if (events.some((e) => e.type === 'finish') && !doneRef.current) {
      doneRef.current = true;
      onFinish(runnerRef.current!.result(), Math.round(elapsedRef.current / 1000));
    }
  };
  const fireRef = useRef(fire);
  fireRef.current = fire;

  useEffect(() => {
    // Counting every second only makes sense when spoken, so beeps/silent keep 3-2-1.
    const every = settingsRef.current.countAloud === 'every' && settingsRef.current.sound === 'voice';
    const runner = new Runner(steps, () => performance.now(), every);
    runnerRef.current = runner;
    const wake = createWakeLock();
    wake.on();
    let last = performance.now();
    fireRef.current(runner.start());
    setFrame((f) => f + 1);
    const tick = () => {
      const now = performance.now();
      if (!runner.paused && !runner.done) elapsedRef.current += now - last;
      last = now;
      fireRef.current(runner.tick());
      setFrame((f) => f + 1);
    };
    const id = window.setInterval(tick, 100);
    const onVis = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      wake.off();
      stopSpeaking();
    };
  }, [steps]);

  const runner = runnerRef.current;
  if (!runner) return null;

  const step = runner.step;
  const sec = runner.remainingSec();
  const phase = step.kind === 'roundRest' ? 'rest' : step.kind;
  const next = steps[runner.index + 1];
  const leftTotal =
    steps.slice(runner.index + 1).reduce((a, s) => a + s.durationSec, 0) + runner.remainingMs() / 1000;
  const workSteps = steps.filter((s) => s.kind === 'work');
  const currentWorkNo = steps.slice(0, runner.index + 1).filter((s) => s.kind === 'work').length;
  const phaseName = phase === 'prep' ? S.prep : phase === 'work' ? S.workPhase : S.restPhase;
  const act = (events: RunEvent[]) => fire(events);
  // During rest/get-ready the big name is the exercise coming next; skip it
  // when it would just repeat the phase word (Quick mode's "Work").
  const shownName = step.kind === 'work' ? step.label : next && next.kind === 'work' ? next.label : '';
  const displayName = shownName.toLowerCase() === phaseName.toLowerCase() ? '' : shownName;

  return (
    <div className={`running phase-${phase}`}>
      <div className="runTop">
        <span>{step.round > 0 ? S.roundOf(step.round, routine.rounds) : S.prep}</span>
        {workSteps.length > 0 && <span>{S.stepOf(Math.max(1, currentWorkNo), workSteps.length)}</span>}
      </div>

      <div className="runPhase">{phaseName}</div>
      <div className="runName">{displayName}</div>

      <div className="ringWrap">
        <svg className="ring" viewBox="0 0 200 200" aria-hidden="true">
          <circle className="ringTrack" cx="100" cy="100" r={R} />
          <circle
            className="ringArc"
            cx="100"
            cy="100"
            r={R}
            strokeDasharray={`${CIRC * (1 - runner.progress())} ${CIRC}`}
            transform="rotate(-90 100 100)"
          />
        </svg>
        <div className="runTime" data-testid="time">
          {sec >= 600 ? formatClock(sec) : String(sec)}
        </div>
      </div>

      <div className="runNext">
        {next ? (
          <>
            <span className="muted">{S.upNext}</span>{' '}
            <strong>{next.kind === 'work' ? next.label : `${S.restPhase} ${formatShort(next.durationSec)}`}</strong>
          </>
        ) : (
          <strong>{S.finishNext}</strong>
        )}
      </div>

      <div className="runControls">
        <button className="roundBtn" onClick={() => act(runner.back())} aria-label={S.previous}>
          ⏮
        </button>
        <button
          className="roundBtn roundBtnBig"
          onClick={() => (runner.paused ? runner.resume() : runner.pause())}
          aria-label={runner.paused ? S.resume : S.pause}
        >
          {runner.paused ? '▶' : '⏸'}
        </button>
        <button className="roundBtn" onClick={() => act(runner.skip())} aria-label={S.skip}>
          ⏭
        </button>
      </div>
      <div className="runExtra">
        {phase === 'rest' && (
          <button className="btn btnGhost" onClick={() => runner.addTime(10)}>
            {S.addTen}
          </button>
        )}
      </div>

      <div className="runBottom">
        <button className="btn btnGhost" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>
          {muted ? S.soundSilent : settings.sound === 'voice' ? S.soundVoice : settings.sound === 'beeps' ? S.soundBeeps : S.soundSilent}
        </button>
        <span className="runLeft">
          {S.timeLeft} {formatClock(leftTotal)}
        </span>
        <button className="btn btnGhost" onClick={() => setConfirmEnd(true)}>
          {S.end}
        </button>
      </div>

      <div className="srOnly" role="status" aria-live="polite">
        {phaseName} {step.kind === 'work' ? step.label : ''}
      </div>

      {confirmEnd && (
        <Sheet title={S.endConfirm} onClose={() => setConfirmEnd(false)}>
          <p className="confirmText">{S.endSavedNote}</p>
          <div className="sheetActions">
            <button className="btn" onClick={() => setConfirmEnd(false)}>
              {S.endNo}
            </button>
            <button
              className="btn btnDanger"
              onClick={() => {
                if (doneRef.current) return;
                doneRef.current = true;
                onExit(runner.result(), Math.round(elapsedRef.current / 1000));
              }}
            >
              {S.endYes}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
