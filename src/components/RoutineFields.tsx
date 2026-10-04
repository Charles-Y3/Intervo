import { useState } from 'react';
import { formatShort } from '../engine/plan';
import { cleanName, newId } from '../engine/storage';
import { LIMITS } from '../engine/types';
import type { Exercise, Routine } from '../engine/types';
import { S } from '../strings';
import { ConfirmSheet } from './ConfirmSheet';
import { KindToggle, RepsInput } from './RepsField';
import { NumberPad, TimeField } from './TimeField';

const ROUND_REST_PRESETS = [30, 60, 120, 180];
const EXERCISE_REST_PRESETS = [0, 5, 10, 15, 20, 30];
const PREP_PRESETS = [0, 5, 10];

/** Rest between exercises (multi-exercise only), rest between rounds, rounds, get-ready.
 * Shared by Quick mode and the routine editor. */
export function TimingFields({ r, patch, multi }: { r: Routine; patch: (p: Partial<Routine>) => void; multi: boolean }) {
  return (
    <>
      {multi && (
        <TimeField
          label={S.restBetweenExercises}
          value={r.restBetweenExercisesSec}
          allowZero
          presets={EXERCISE_REST_PRESETS}
          onChange={(sec) => patch({ restBetweenExercisesSec: sec })}
        />
      )}

      <TimeField
        label={S.restBetweenRounds}
        value={r.restBetweenRoundsSec}
        allowZero
        presets={ROUND_REST_PRESETS}
        onChange={(sec) => patch({ restBetweenRoundsSec: sec })}
      />

      <div className="field">
        <div className="fieldHead">
          <span className="fieldLabel">{S.rounds}</span>
        </div>
        <div className="stepper">
          <button className="btn stepBtn" aria-label={`${S.rounds} −1`} onClick={() => patch({ rounds: Math.max(1, r.rounds - 1) })}>
            −
          </button>
          <span className="stepperValue" aria-live="polite">
            {r.rounds}
          </span>
          <button className="btn stepBtn" aria-label={`${S.rounds} +1`} onClick={() => patch({ rounds: Math.min(LIMITS.maxRounds, r.rounds + 1) })}>
            +
          </button>
        </div>
      </div>

      <TimeField label={S.getReady} value={r.prepSec} allowZero presets={PREP_PRESETS} onChange={(sec) => patch({ prepSec: Math.min(60, sec) })} />
    </>
  );
}

/** Ordered exercise rows: name, time or reps, Timed/Reps, move, remove (asks first). */
export function ExerciseList({ exercises, onChange }: { exercises: Exercise[]; onChange: (e: Exercise[]) => void }) {
  const [padFor, setPadFor] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Exercise | null>(null);
  const update = (id: string, p: Partial<Exercise>) => onChange(exercises.map((e) => (e.id === id ? { ...e, ...p } : e)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= exercises.length) return;
    const next = exercises.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="field">
      <div className="fieldHead">
        <span className="fieldLabel">{S.exercises}</span>
      </div>
      <ol className="exList">
        {exercises.map((ex, i) => (
          <li key={ex.id} className="exRow">
            <span className="exNum">{i + 1}</span>
            <input
              className="textInput exName"
              aria-label={`${S.exerciseName} ${i + 1}`}
              value={ex.name}
              maxLength={LIMITS.maxNameLength}
              onChange={(e) => update(ex.id, { name: e.target.value })}
              onBlur={(e) => update(ex.id, { name: cleanName(e.target.value, `Exercise ${i + 1}`) })}
            />
            {ex.kind === 'reps' ? (
              <RepsInput className="exTime" value={ex.reps ?? 10} label={`${ex.name}: ${S.repsTyped}`} onChange={(reps) => update(ex.id, { reps })} />
            ) : (
              <button className="btn exTime" onClick={() => setPadFor(ex.id)} aria-label={`${ex.name}: ${formatShort(ex.workSec)}. ${S.enterTime}`}>
                {formatShort(ex.workSec)}
              </button>
            )}
            <div className="exActions">
              <KindToggle compact value={ex.kind ?? 'timed'} onChange={(kind) => update(ex.id, { kind })} />
              <button className="iconBtn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${S.moveUp}: ${ex.name}`}>
                ↑
              </button>
              <button className="iconBtn" onClick={() => move(i, 1)} disabled={i === exercises.length - 1} aria-label={`${S.moveDown}: ${ex.name}`}>
                ↓
              </button>
              <button
                className="iconBtn"
                onClick={() => setRemoving(ex)}
                disabled={exercises.length <= 1}
                aria-label={`${S.removeExercise}: ${ex.name}`}
              >
                ×
              </button>
            </div>
            {padFor === ex.id && (
              <NumberPad
                title={ex.name}
                initial={ex.workSec}
                allowZero={false}
                onCancel={() => setPadFor(null)}
                onDone={(sec) => {
                  update(ex.id, { workSec: sec });
                  setPadFor(null);
                }}
              />
            )}
          </li>
        ))}
      </ol>
      {removing && (
        <ConfirmSheet
          title={S.confirmRemoveExerciseTitle}
          message={S.confirmRemoveExerciseBody(removing.name)}
          confirmLabel={S.removeExercise}
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            onChange(exercises.filter((e) => e.id !== removing.id));
            setRemoving(null);
          }}
        />
      )}
      <button
        className="btn addBtn"
        disabled={exercises.length >= LIMITS.maxExercises}
        onClick={() =>
          onChange([
            ...exercises,
            { id: newId(), name: `Exercise ${exercises.length + 1}`, workSec: exercises[exercises.length - 1]?.workSec ?? 30 },
          ])
        }
      >
        + {S.addExercise}
      </button>
    </div>
  );
}
