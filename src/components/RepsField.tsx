import { useEffect, useState } from 'react';
import { LIMITS } from '../engine/types';
import type { ExerciseKind } from '../engine/types';
import { S } from '../strings';

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

/** Timed or Reps. */
export function KindToggle({ value, onChange, compact = false }: { value: ExerciseKind; onChange: (k: ExerciseKind) => void; compact?: boolean }) {
  const items: [ExerciseKind, string][] = [
    ['timed', S.kindTimed],
    ['reps', S.kindReps],
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
