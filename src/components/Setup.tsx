import { useState } from 'react';
import { EXAMPLE_ROUTINES } from '../engine/examples';
import { templateOfDay } from '../engine/templates';
import { lastDone } from '../engine/history';
import type { GoalProgress, HistoryEntry } from '../engine/history';
import { buildSteps, formatClock, hasRepSets, totalSeconds } from '../engine/plan';
import { cleanName, defaultRoutine, newId } from '../engine/storage';
import type { AppState, Mode, RoutineSort } from '../engine/storage';
import { LIMITS } from '../engine/types';
import type { DistanceUnit, Exercise, Routine, WeightUnit } from '../engine/types';
import { S } from '../strings';
import { GoalCard } from './GoalCard';
import { DistanceField, KindToggle, RepsField, RepsTimeLimit } from './RepsField';
import { RoutineEditor } from './RoutineEditor';
import { TimingFields, WeightInput } from './RoutineFields';
import { TemplateCard, TemplateLibrary } from './TemplateLibrary';
import { TimeField } from './TimeField';

interface Props {
  state: AppState;
  /** The routine library. */
  saved: Routine[];
  history: HistoryEntry[];
  goal: GoalProgress;
  unit: WeightUnit;
  distUnit: DistanceUnit;
  onState: (s: AppState) => void;
  onStart: (r: Routine) => void;
  /** Add a new routine or replace the one with the same id. */
  onUpsert: (r: Routine) => void;
  onDeleteSaved: (id: string) => void;
  onAddExamples: () => void;
  /** Copy a starter routine into the library. */
  onAddTemplate: (r: Routine) => void;
}

const WORK_PRESETS = [10, 20, 30, 45, 60];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "today", "yesterday", "3 days ago", or "Oct 4". */
function relativeDay(at: number, now: number): string {
  const a = new Date(now);
  a.setHours(0, 0, 0, 0);
  const b = new Date(at);
  b.setHours(0, 0, 0, 0);
  const n = Math.round((a.getTime() - b.getTime()) / 86400000);
  if (n <= 0) return S.today;
  if (n === 1) return S.yesterday;
  if (n < 7) return S.daysAgo(n);
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function sortRoutines(saved: Routine[], history: HistoryEntry[], sort: RoutineSort, now: number): Routine[] {
  if (sort === 'added') return saved;
  if (sort === 'name') return [...saved].sort((a, b) => a.name.localeCompare(b.name));
  // Recent: most recently done first; routines never done keep their saved order after them.
  return saved
    .map((r, i) => ({ r, i, at: lastDone(history, r, now).at ?? -1 }))
    .sort((a, b) => b.at - a.at || a.i - b.i)
    .map((x) => x.r);
}

function copyOf(r: Routine): Routine {
  const fresh = (list?: Exercise[]) => (list ?? []).map((e) => ({ ...e, id: newId() }));
  return { ...r, id: newId(), name: cleanName(`${r.name} (${S.copySuffix})`, S.defaultRoutineName), exercises: fresh(r.exercises), warmup: fresh(r.warmup), cooldown: fresh(r.cooldown) };
}

export function Setup({ state, saved, history, goal, unit, distUnit, onState, onStart, onUpsert, onDeleteSaved, onAddExamples, onAddTemplate }: Props) {
  const { mode } = state;
  const setMode = (m: Mode) => onState({ ...state, mode: m });
  // null = closed; { routine, isNew } = editor open
  const [editing, setEditing] = useState<{ routine: Routine; isNew: boolean } | null>(null);
  const [library, setLibrary] = useState(false);
  const now = Date.now();
  const shown = sortRoutines(saved, history, state.sort, now);
  const today = templateOfDay(saved, new Date(now));
  const todayBlock = today && (
    <section className="field" aria-label={S.tryToday}>
      <div className="fieldHead">
        <span className="fieldLabel">{S.tryToday}</span>
      </div>
      <ul className="tplList" data-testid="try-today">
        <TemplateCard tpl={today} saved={saved} onAdd={onAddTemplate} today />
      </ul>
      <p className="muted">{S.tryTodayHint}</p>
    </section>
  );
  const missingExamples = EXAMPLE_ROUTINES.some((e) => !saved.some((s) => s.id === e.id));
  const sorts: [RoutineSort, string][] = [
    ['recent', S.sortRecent],
    ['name', S.sortName],
    ['added', S.sortAdded],
  ];

  return (
    <div className="setup">
      <GoalCard progress={goal} />

      <div className="segmented" role="tablist" aria-label={`${S.quick} / ${S.routine}`}>
        {(['quick', 'routine'] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className={`seg${mode === m ? ' segOn' : ''}`} onClick={() => setMode(m)}>
            {m === 'quick' ? S.quick : S.routine}
          </button>
        ))}
      </div>

      {mode === 'quick' ? (
        <QuickSetup state={state} unit={unit} distUnit={distUnit} onState={onState} onStart={onStart} />
      ) : (
        <>
          {saved.length === 0 && todayBlock}
          {saved.length === 0 ? (
            <p className="field muted" data-testid="no-routines">
              {S.noRoutines}
            </p>
          ) : (
            <>
              {saved.length >= 2 && (
                <div className="sortRow" role="group" aria-label={S.sortBy}>
                  <span className="muted">{S.sortBy}</span>
                  {sorts.map(([v, label]) => (
                    <button key={v} className={`chip${state.sort === v ? ' chipOn' : ''}`} aria-pressed={state.sort === v} onClick={() => onState({ ...state, sort: v })}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <ul className="routineList" aria-label={S.savedRoutines}>
                {shown.map((rt) => {
                  const steps = buildSteps(rt);
                  const last = lastDone(history, rt, now);
                  return (
                    <li key={rt.id} className="routineCard" data-testid="routine-card">
                      <button className="rcOpen" onClick={() => setEditing({ routine: rt, isNew: false })} aria-label={S.openRoutine(rt.name)}>
                        <strong className="rcName">{rt.name}</strong>
                        <span className="muted">
                          {plural(rt.exercises.length, 'exercise', 'exercises')} · {plural(rt.rounds, 'round', 'rounds')} · {hasRepSets(steps) ? '≈ ' : ''}
                          {formatClock(totalSeconds(steps))}
                        </span>
                        <span className="muted rcEx">{rt.exercises.map((e) => e.name).join(', ')}</span>
                        <span className="muted rcLast" data-testid="last-done">
                          {last.at === null ? S.lastDoneNever : S.lastDone(relativeDay(last.at, now), last.recent)}
                        </span>
                      </button>
                      <div className="rcSide">
                        <button className="btn btnPrimary rcStart" onClick={() => onStart(rt)} aria-label={S.startNamed(rt.name)}>
                          {S.start}
                        </button>
                        <button className="btn btnSmall" disabled={saved.length >= LIMITS.maxSavedRoutines} onClick={() => onUpsert(copyOf(rt))} aria-label={S.duplicateNamed(rt.name)}>
                          {S.duplicate}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {saved.length > 0 && todayBlock}
          <button
            className="btn addBtn"
            disabled={saved.length >= LIMITS.maxSavedRoutines}
            onClick={() => setEditing({ routine: { ...defaultRoutine(), id: newId(), name: S.newRoutine }, isNew: true })}
          >
            + {S.newRoutine}
          </button>
          <button className="btn btnGhostDark" onClick={() => setLibrary(true)}>
            {S.browseTemplates}
          </button>
          {missingExamples && (
            <button className="btn btnGhostDark" onClick={onAddExamples}>
              {S.addExamples}
            </button>
          )}
        </>
      )}

      {library && <TemplateLibrary saved={saved} onAdd={onAddTemplate} onClose={() => setLibrary(false)} />}

      {editing && (
        <RoutineEditor
          key={editing.routine.id}
          initial={editing.routine}
          isNew={editing.isNew}
          unit={unit}
          distUnit={distUnit}
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
          onDuplicate={(r) => {
            onUpsert(copyOf(r));
            setEditing(null);
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
function QuickSetup({ state, unit, distUnit, onState, onStart }: { state: AppState; unit: WeightUnit; distUnit: DistanceUnit; onState: (s: AppState) => void; onStart: (r: Routine) => void }) {
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
        <>
          <RepsField value={q0.reps ?? 10} onChange={(reps) => patch({ exercises: [{ ...q0, reps }] })} />
          <RepsTimeLimit
            timed={q0.timed === true}
            workSec={q0.workSec}
            onTimed={(on) => patch({ exercises: [{ ...q0, timed: on ? true : undefined }] })}
            onSec={(sec) => patch({ exercises: [{ ...q0, workSec: sec }] })}
          />
        </>
      ) : q0.kind === 'distance' ? (
        <DistanceField value={q0.distance ?? 5} unit={distUnit} onChange={(distance) => patch({ exercises: [{ ...q0, distance }] })} />
      ) : (
        <TimeField label={S.work} big value={q0.workSec} presets={WORK_PRESETS} onChange={(sec) => patch({ exercises: [{ ...q0, workSec: sec }] })} />
      )}
      {q0.kind !== 'distance' && (
      <div className="field">
        <div className="fieldHead">
          <span className="fieldLabel">{S.weightField}</span>
        </div>
        <WeightInput value={q0.weight ?? 0} unit={unit} label={S.weightField} onChange={(weight) => patch({ exercises: [{ ...q0, weight }] })} />
        <p className="muted">{S.weightHint(unit)}</p>
      </div>
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
