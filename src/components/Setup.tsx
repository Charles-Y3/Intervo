import { useState } from 'react';
import { buildSteps, formatClock, hasRepSets, totalSeconds } from '../engine/plan';
import { cleanName, defaultRoutine, newId } from '../engine/storage';
import type { AppState, Mode } from '../engine/storage';
import { LIMITS } from '../engine/types';
import type { Routine } from '../engine/types';
import { S } from '../strings';
import { KindToggle, RepsField } from './RepsField';
import { RoutineEditor } from './RoutineEditor';
import { TimingFields } from './RoutineFields';
import { TimeField } from './TimeField';

interface Props {
  state: AppState;
  /** The routine library. */
  saved: Routine[];
  onState: (s: AppState) => void;
  onStart: (r: Routine) => void;
  /** Add a new routine or replace the one with the same id. */
  onUpsert: (r: Routine) => void;
  onDeleteSaved: (id: string) => void;
}

const WORK_PRESETS = [10, 20, 30, 45, 60];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function Setup({ state, saved, onState, onStart, onUpsert, onDeleteSaved }: Props) {
  const { mode } = state;
  const setMode = (m: Mode) => onState({ ...state, mode: m });
  // null = closed; { routine, isNew } = editor open
  const [editing, setEditing] = useState<{ routine: Routine; isNew: boolean } | null>(null);

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
        <QuickSetup state={state} onState={onState} onStart={onStart} />
      ) : (
        <>
          {saved.length === 0 ? (
            <p className="field muted" data-testid="no-routines">
              {S.noRoutines}
            </p>
          ) : (
            <ul className="routineList" aria-label={S.savedRoutines}>
              {saved.map((rt) => {
                const steps = buildSteps(rt);
                return (
                  <li key={rt.id} className="routineCard" data-testid="routine-card">
                    <button className="rcOpen" onClick={() => setEditing({ routine: rt, isNew: false })} aria-label={S.openRoutine(rt.name)}>
                      <strong className="rcName">{rt.name}</strong>
                      <span className="muted">
                        {plural(rt.exercises.length, 'exercise', 'exercises')} · {plural(rt.rounds, 'round', 'rounds')} · {hasRepSets(steps) ? '≈ ' : ''}
                        {formatClock(totalSeconds(steps))}
                      </span>
                      <span className="muted rcEx">{rt.exercises.map((e) => e.name).join(', ')}</span>
                    </button>
                    <button className="btn btnPrimary rcStart" onClick={() => onStart(rt)} aria-label={S.startNamed(rt.name)}>
                      {S.start}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            className="btn addBtn"
            disabled={saved.length >= LIMITS.maxSavedRoutines}
            onClick={() => setEditing({ routine: { ...defaultRoutine(), id: newId(), name: S.newRoutine }, isNew: true })}
          >
            + {S.newRoutine}
          </button>
        </>
      )}

      {editing && (
        <RoutineEditor
          key={editing.routine.id}
          initial={editing.routine}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onSave={(r) => {
            onUpsert(r);
            setEditing(null);
          }}
          onSaveAndStart={(r) => {
            onUpsert(r);
            setEditing(null);
            onStart(r);
          }}
          onDelete={(r) => {
            onDeleteSaved(r.id);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/** Quick mode: one exercise, tweak and go. */
function QuickSetup({ state, onState, onStart }: { state: AppState; onState: (s: AppState) => void; onStart: (r: Routine) => void }) {
  const r = state.quick;
  const patch = (p: Partial<Routine>) => onState({ ...state, quick: { ...r, ...p } });
  const q0 = r.exercises[0];
  const steps = buildSteps(r);
  const estimated = hasRepSets(steps);

  return (
    <>
      <label className="field dateLabel">
        <span className="fieldLabel">{S.quickExercise}</span>
        <input
          className="textInput"
          value={q0.name}
          placeholder={S.quickExercisePlaceholder}
          maxLength={LIMITS.maxNameLength}
          onChange={(e) => patch({ exercises: [{ ...q0, name: e.target.value }] })}
          onBlur={(e) => patch({ exercises: [{ ...q0, name: cleanName(e.target.value, 'Work') }] })}
        />
      </label>
      <div className="field">
        <div className="fieldLabel">{S.exerciseType}</div>
        <KindToggle value={q0.kind ?? 'timed'} onChange={(kind) => patch({ exercises: [{ ...q0, kind }] })} />
      </div>
      {q0.kind === 'reps' ? (
        <RepsField value={q0.reps ?? 10} onChange={(reps) => patch({ exercises: [{ ...q0, reps }] })} />
      ) : (
        <TimeField label={S.work} big value={q0.workSec} presets={WORK_PRESETS} onChange={(sec) => patch({ exercises: [{ ...q0, workSec: sec }] })} />
      )}

      <TimingFields r={r} patch={patch} multi={false} />

      <div className="startBar">
        <div className="startTotal">
          <span className="muted">{estimated ? S.totalEstimate : S.total}</span>{' '}
          <strong>
            {estimated ? '≈ ' : ''}
            {formatClock(totalSeconds(steps))}
          </strong>
        </div>
        <button className="btn btnPrimary btnStart" onClick={() => onStart(r)}>
          {S.start}
        </button>
      </div>
    </>
  );
}
