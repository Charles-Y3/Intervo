import { useEffect, useState } from 'react';
import { LIMITS } from '../engine/types';
import type { DistanceUnit, ExerciseKind } from '../engine/types';
import { S } from '../strings';
import { TimeField } from './TimeField';

/** Number input for reps. Keeps its own text so the box can be emptied while
 * typing; only valid values (1 to 999) are passed up, and it snaps back on blur. */
export function RepsInput({ value, onChange, label, className = '' }: { value: number; onChange: (n: number) => void; label: string; className?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      className={`textInput repsInput ${className}`}
      type="number"
      inputMode="numeric"
      min={1}
      max={LIMITS.maxReps}
      aria-label={label}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Math.round(Number(e.target.value));
        if (e.target.value.trim() !== '' && Number.isFinite(n) && n >= 1 && n <= LIMITS.maxReps) onChange(n);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

const REP_PRESETS = [5, 8, 10, 12, 15, 20];
const DISTANCE_PRESETS: Record<DistanceUnit, number[]> = { km: [0.4, 1, 3, 5, 10], mi: [0.25, 1, 2, 3, 5] };

/** Distance in the user's unit (decimals allowed). Keeps its own text so it can be cleared while typing. */
export function DistanceInput({ value, unit, onChange, label, className = '' }: { value: number; unit: DistanceUnit; onChange: (n: number) => void; label: string; className?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      className={`textInput repsInput ${className}`}
      type="number"
      inputMode="decimal"
      min={0.01}
      max={LIMITS.maxDistance}
      step={0.1}
      placeholder={unit}
      aria-label={label}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(n) && n >= 0.01 && n <= LIMITS.maxDistance) onChange(Math.round(n * 100) / 100);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

/** Target distance for a run or walk: presets for the chosen unit plus a typed value. */
export function DistanceField({ value, unit, onChange }: { value: number; unit: DistanceUnit; onChange: (n: number) => void }) {
  return (
    <div className="field">
      <div className="fieldHead">
        <span className="fieldLabel">{S.distancePerSet}</span>
        <span className="fieldValue">{unit}</span>
      </div>
      <div className="chips" role="group" aria-label={S.distancePerSet}>
        {DISTANCE_PRESETS[unit].map((p) => (
          <button key={p} className={`chip${value === p ? ' chipOn' : ''}`} aria-pressed={value === p} onClick={() => onChange(p)}>
            {p}
          </button>
        ))}
      </div>
      <DistanceInput value={value} unit={unit} onChange={onChange} label={S.distanceTyped} />
      <p className="muted">{S.distanceHint}</p>
    </div>
  );
}

/** Target reps per set: preset chips plus a typed value. */
export function RepsField({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="field">
      <div className="fieldHead">
        <span className="fieldLabel">{S.repsPerSet}</span>
      </div>
      <div className="chips" role="group" aria-label={S.repsPerSet}>
        {REP_PRESETS.map((p) => (
          <button key={p} className={`chip${value === p ? ' chipOn' : ''}`} aria-pressed={value === p} onClick={() => onChange(p)}>
            {p}
          </button>
        ))}
      </div>
      <RepsInput value={value} onChange={onChange} label={S.repsTyped} />
      <p className="muted">{S.repsHint}</p>
    </div>
  );
}

/** Quick mode: optionally run a countdown on a reps set. When it ends the app asks for the reps done. */
export function RepsTimeLimit({ timed, workSec, onTimed, onSec }: { timed: boolean; workSec: number; onTimed: (on: boolean) => void; onSec: (sec: number) => void }) {
  return (
    <div className="field">
      <div className="fieldHead">
        <span className="fieldLabel">{S.timeLimit}</span>
      </div>
      <div className="chips">
        <button className={`chip${!timed ? ' chipOn' : ''}`} aria-pressed={!timed} onClick={() => onTimed(false)}>
          {S.timeLimitOff}
        </button>
        <button className={`chip${timed ? ' chipOn' : ''}`} aria-pressed={timed} onClick={() => onTimed(true)}>
          {S.timeLimitOn}
        </button>
      </div>
      {timed && <TimeField label={S.timeLimitLabel(S.kindReps)} big value={workSec} presets={[20, 30, 45, 60, 90]} onChange={onSec} />}
      <p className="muted">{S.timeLimitHint}</p>
    </div>
  );
}

/** Timed or Reps. */
export function KindToggle({ value, onChange, compact = false }: { value: ExerciseKind; onChange: (k: ExerciseKind) => void; compact?: boolean }) {
  const items: [ExerciseKind, string][] = [
    ['timed', S.kindTimed],
    ['reps', S.kindReps],
    ['distance', S.kindDistance],
  ];
  return (
    <div className={compact ? 'chips kindCompact' : 'chips'} role="group" aria-label={S.exerciseType}>
      {items.map(([k, label]) => (
        <button key={k} className={`chip${value === k ? ' chipOn' : ''}`} aria-pressed={value === k} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}
