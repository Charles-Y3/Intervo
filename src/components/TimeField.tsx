import { useState } from 'react';
import { digitsToSeconds, popDigit, pushDigit, secondsToDigits } from '../engine/timeEntry';
import { formatClock, formatShort } from '../engine/plan';
import { LIMITS } from '../engine/types';
import { S } from '../strings';
import { Sheet } from './Sheet';

interface Props {
  label: string;
  value: number;
  onChange: (sec: number) => void;
  presets: number[];
  /** Allow 0 (e.g. "no rest"). */
  allowZero?: boolean;
  /** Show the big value with -5/+5 buttons (for the main work time). */
  big?: boolean;
  /** Label for the 0 preset chip. */
  zeroLabel?: string;
}

/** A time setting: preset chips, a Custom chip that opens a number pad,
 * and (optionally) a large readout with -5 s / +5 s buttons. */
export function TimeField({ label, value, onChange, presets, allowZero, big, zeroLabel = S.none }: Props) {
  const [padOpen, setPadOpen] = useState(false);
  const min = allowZero ? 0 : 1;
  const isPreset = presets.includes(value);
  const step = (d: number) => onChange(Math.min(LIMITS.maxSeconds, Math.max(min, value + d)));

  return (
    <div className="field">
      <div className="fieldHead">
        <span className="fieldLabel">{label}</span>
        {!big && <span className="fieldValue">{value === 0 ? zeroLabel : formatShort(value)}</span>}
      </div>
      {big && (
        <div className="bigTime">
          <button className="btn stepBtn" onClick={() => step(-5)} aria-label={`${label} ${S.minusFive}`}>
            {S.minusFive}
          </button>
          <button className="bigTimeValue" onClick={() => setPadOpen(true)} aria-label={`${label}: ${formatClock(value)}. ${S.enterTime}`}>
            {formatClock(value)}
          </button>
          <button className="btn stepBtn" onClick={() => step(5)} aria-label={`${label} ${S.plusFive}`}>
            {S.plusFive}
          </button>
        </div>
      )}
      <div className="chips" role="group" aria-label={label}>
        {presets.map((p) => (
          <button
            key={p}
            className={`chip${value === p ? ' chipOn' : ''}`}
            aria-pressed={value === p}
            onClick={() => onChange(p)}
          >
            {p === 0 ? zeroLabel : formatShort(p)}
          </button>
        ))}
        <button className={`chip${!isPreset ? ' chipOn' : ''}`} aria-pressed={!isPreset} onClick={() => setPadOpen(true)}>
          {!isPreset && !big ? formatShort(value) : S.custom}
        </button>
      </div>
      {padOpen && (
        <NumberPad
          title={label}
          initial={value}
          allowZero={Boolean(allowZero)}
          onCancel={() => setPadOpen(false)}
          onDone={(sec) => {
            onChange(sec);
            setPadOpen(false);
          }}
        />
      )}
    </div>
  );
}

export function NumberPad({
  title,
  initial,
  allowZero,
  onDone,
  onCancel,
}: {
  title: string;
  initial: number;
  allowZero: boolean;
  onDone: (sec: number) => void;
  onCancel: () => void;
}) {
  const [digits, setDigits] = useState(secondsToDigits(initial));
  const [error, setError] = useState(false);
  const sec = digitsToSeconds(digits);

  function press(k: string) {
    setError(false);
    setDigits((d) => pushDigit(d, k));
  }
  function done() {
    if (sec < (allowZero ? 0 : 1)) {
      setError(true);
      return;
    }
    onDone(sec);
  }

  return (
    <Sheet title={`${S.enterTime}: ${title}`} onClose={onCancel}>
      <div className="padDisplay" aria-live="polite">
        {formatClock(sec)}
      </div>
      {error && (
        <p className="errorText" role="alert">
          {S.timeOutOfRange}
        </p>
      )}
      <div className="padGrid">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0'].map((k) => (
          <button key={k} className="btn padKey" onClick={() => press(k)}>
            {k}
          </button>
        ))}
        <button className="btn padKey" onClick={() => setDigits((d) => popDigit(d))} aria-label={S.backspace}>
          ⌫
        </button>
      </div>
      <div className="sheetActions">
        <button className="btn" onClick={onCancel}>
          {S.cancel}
        </button>
        <button className="btn btnPrimary" onClick={done}>
          {S.done}
        </button>
      </div>
    </Sheet>
  );
}
