import { useEffect, useRef, useState } from 'react';
import { formatShort } from '../engine/plan';
import { cleanName, clampWeight, newId } from '../engine/storage';
import { LIMITS } from '../engine/types';
import type { Exercise, Routine, WeightUnit } from '../engine/types';
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

/** Optional extra weight. Empty = bodyweight (0). Keeps its own text so it can be cleared while typing. */
export function WeightInput({ value, unit, onChange, label, className = '' }: { value: number; unit: WeightUnit; onChange: (n: number) => void; label: string; className?: string }) {
  const show = (n: number) => (n > 0 ? String(n) : '');
  const [text, setText] = useState(show(value));
  useEffect(() => setText(show(value)), [value]);
  return (
    <input
      className={`textInput weightInput ${className}`}
      type="number"
      inputMode="decimal"
      min={0}
      max={LIMITS.maxWeight}
      step={0.5}
      placeholder={unit}
      aria-label={label}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(clampWeight(e.target.value));
      }}
      onBlur={() => setText(show(value))}
    />
  );
}

interface ListProps {
  exercises: Exercise[];
  onChange: (e: Exercise[]) => void;
  unit: WeightUnit;
  /** Heading (default: Exercises). */
  title?: string;
  /** Prefix of each name field's accessible label, so lists stay distinguishable. */
  namePrefix?: string;
  addLabel?: string;
  /** Fewest exercises allowed (1 for the main list, 0 for warm-up/cool-down). */
  minCount?: number;
  maxCount?: number;
  className?: string;
}

/** Ordered exercise rows: drag handle (or arrow keys), name, time or reps, Timed/Reps,
 * extra weight, remove (asks first). */
export function ExerciseList({
  exercises,
  onChange,
  unit,
  title = S.exercises,
  namePrefix = S.exerciseName,
  addLabel = S.addExercise,
  minCount = 1,
  maxCount = LIMITS.maxExercises,
  className = '',
}: ListProps) {
  const [padFor, setPadFor] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Exercise | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const update = (id: string, p: Partial<Exercise>) => onChange(exercises.map((e) => (e.id === id ? { ...e, ...p } : e)));

  const moveTo = (id: string, to: number) => {
    const from = exercises.findIndex((e) => e.id === id);
    if (from < 0 || to < 0 || to >= exercises.length || to === from) return;
    const next = exercises.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  // Where the pointer is decides the slot: the first row whose middle is below it.
  const dragMove = (id: string, clientY: number) => {
    const rects = exercises.map((e) => rows.current.get(e.id)?.getBoundingClientRect());
    let to = rects.findIndex((r) => r !== undefined && clientY < r.top + r.height / 2);
    if (to === -1) to = exercises.length - 1;
    moveTo(id, to);
  };

  // Listen on the window while dragging: reordering moves the row's DOM node, which
  // drops pointer capture on the handle, so handle-level events would stop after one swap.
  useEffect(() => {
    if (!dragId) return;
    const move = (e: PointerEvent) => dragMove(dragId, e.clientY);
    const end = () => setDragId(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  });

  return (
    <div className={`field ${className}`}>
      <div className="fieldHead">
        <span className="fieldLabel">{title}</span>
      </div>
      <ol className="exList">
        {exercises.map((ex, i) => (
          <li
            key={ex.id}
            className={`exRow${dragId === ex.id ? ' exRowDragging' : ''}`}
            ref={(el) => {
              if (el) rows.current.set(ex.id, el);
              else rows.current.delete(ex.id);
            }}
          >
            <button
              className="dragHandle"
              aria-label={S.reorder(ex.name)}
              ref={(el) => {
                if (el) handles.current.set(ex.id, el);
                else handles.current.delete(ex.id);
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                setDragId(ex.id);
              }}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                e.preventDefault();
                moveTo(ex.id, i + (e.key === 'ArrowUp' ? -1 : 1));
                window.requestAnimationFrame(() => handles.current.get(ex.id)?.focus());
              }}
            >
              ≡
            </button>
            <input
              className="textInput exName"
              aria-label={`${namePrefix} ${i + 1}`}
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
            <div className="exExtras">
              <KindToggle compact value={ex.kind ?? 'timed'} onChange={(kind) => update(ex.id, { kind })} />
              <WeightInput value={ex.weight ?? 0} unit={unit} label={S.weightLabel(ex.name, unit)} onChange={(weight) => update(ex.id, { weight })} />
              <button
                className="iconBtn"
                onClick={() => setRemoving(ex)}
                disabled={exercises.length <= minCount}
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
        disabled={exercises.length >= maxCount}
        onClick={() =>
          onChange([
            ...exercises,
            { id: newId(), name: `Exercise ${exercises.length + 1}`, workSec: exercises[exercises.length - 1]?.workSec ?? 30 },
          ])
        }
      >
        + {addLabel}
      </button>
    </div>
  );
}
