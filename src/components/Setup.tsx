import { useState } from 'react';
import { buildSteps, formatClock, formatShort, hasRepSets, totalSeconds } from '../engine/plan';
import { cleanName, newId } from '../engine/storage';
import type { AppState, Mode } from '../engine/storage';
import { LIMITS } from '../engine/types';
import type { Exercise, Routine } from '../engine/types';
import { S } from '../strings';
import { ConfirmSheet } from './ConfirmSheet';
import { KindToggle, RepsField, RepsInput } from './RepsField';
import { NumberPad, TimeField } from './TimeField';

interface Props {
  state: AppState;
  saved: Routine[];
  onState: (s: AppState) => void;
  onStart: (r: Routine) => void;
  onSave: (r: Routine) => void;
  onDeleteSaved: (id: string) => void;
}

const WORK_PRESETS = [10, 20, 30, 45, 60];
const ROUND_REST_PRESETS = [30, 60, 120, 180];
const EXERCISE_REST_PRESETS = [0, 5, 10, 15, 20, 30];
const PREP_PRESETS = [0, 5, 10];

export function Setup({ state, saved, onState, onStart, onSave, onDeleteSaved }: Props) {
  const { mode } = state;
  const r = mode === 'quick' ? state.quick : state.routine;
  const patch = (p: Partial<Routine>) => onState({ ...state, [mode]: { ...r, ...p } });
  const setMode = (m: Mode) => onState({ ...state, mode: m });
  const steps = buildSteps(r);
  const total = totalSeconds(steps);
  const estimated = hasRepSets(steps);
  const q0 = r.exercises[0];
  const [justSaved, setJustSaved] = useState(false);
  const [deleteSaved, setDeleteSaved] = useState<Routine | null>(null);

  return (
    <div className="setup">
      <div className="segmented" role="tablist" aria-label={`${S.quick} / ${S.routine}`}>
        {(['quick', 'routine'] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className={`seg${mode === m ? ' segOn' : ''}`} onClick={() => setMode(m)}>
            {m === 'quick' ? S.quick : S.routine}
          </button>
        ))}
      </div>

      {mode === 'quick' ? (
        <>
          <label className="field dateLabel">
            <span className="fieldLabel">{S.quickExercise}</span>
            <input
              className="textInput"
              value={r.exercises[0].name}
              placeholder={S.quickExercisePlaceholder}
              maxLength={LIMITS.maxNameLength}
              onChange={(e) => patch({ exercises: [{ ...r.exercises[0], name: e.target.value }] })}
              onBlur={(e) => patch({ exercises: [{ ...r.exercises[0], name: cleanName(e.target.value, 'Work') }] })}
            />
          </label>
          <div className="field">
            <div className="fieldLabel">{S.exerciseType}</div>
            <KindToggle value={q0.kind ?? 'timed'} onChange={(kind) => patch({ exercises: [{ ...q0, kind }] })} />
          </div>
          {q0.kind === 'reps' ? (
            <RepsField value={q0.reps ?? 10} onChange={(reps) => patch({ exercises: [{ ...q0, reps }] })} />
          ) : (
            <TimeField
              label={S.work}
              big
              value={q0.workSec}
              presets={WORK_PRESETS}
              onChange={(sec) => patch({ exercises: [{ ...q0, workSec: sec }] })}
            />
          )}
        </>
      ) : (
        <ExerciseList exercises={r.exercises} onChange={(exercises) => patch({ exercises })} />
      )}

      {mode === 'routine' && (
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

      {mode === 'routine' && (
        <div className="saveRow">
          <input
            className="textInput"
            aria-label={S.routineName}
            value={r.name}
            maxLength={LIMITS.maxNameLength}
            onChange={(e) => patch({ name: e.target.value })}
          />
          <button
            className="btn"
            onClick={() => {
              onSave({ ...r, id: newId(), name: cleanName(r.name, 'My routine') });
              setJustSaved(true);
              window.setTimeout(() => setJustSaved(false), 1500);
            }}
          >
            {justSaved ? S.saved : S.saveRoutine}
          </button>
        </div>
      )}

      {mode === 'routine' && (
        <div className="field">
          <div className="fieldHead">
            <span className="fieldLabel">{S.savedRoutines}</span>
          </div>
          {saved.length === 0 ? (
            <p className="muted">{S.noneSaved}</p>
          ) : (
            <ul className="savedList">
              {saved.map((s) => (
                <li key={s.id} className="savedItem">
                  <span className="savedName">{s.name}</span>
                  <span className="muted">{formatClock(totalSeconds(buildSteps(s)))}</span>
                  <button className="btn btnSmall" onClick={() => onState({ ...state, mode: 'routine', routine: { ...s, id: 'draft' } })}>
                    {S.loadRoutine}
                  </button>
                  <button className="btn btnSmall" onClick={() => setDeleteSaved(s)} aria-label={`${S.deleteRoutine}: ${s.name}`}>
                    {S.deleteRoutine}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {deleteSaved && (
        <ConfirmSheet
          title={S.confirmDeleteRoutineTitle}
          message={S.confirmDeleteRoutineBody(deleteSaved.name)}
          confirmLabel={S.deleteRoutine}
          onCancel={() => setDeleteSaved(null)}
          onConfirm={() => {
            onDeleteSaved(deleteSaved.id);
            setDeleteSaved(null);
          }}
        />
      )}

      <div className="startBar">
        <div className="startTotal">
          <span className="muted">{estimated ? S.totalEstimate : S.total}</span> <strong>{estimated ? '≈ ' : ''}{formatClock(total)}</strong>
        </div>
        <button className="btn btnPrimary btnStart" onClick={() => onStart(r)}>
          {mode === 'quick' ? S.start : S.startRoutine}
        </button>
      </div>
    </div>
  );
}

function ExerciseList({ exercises, onChange }: { exercises: Exercise[]; onChange: (e: Exercise[]) => void }) {
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
