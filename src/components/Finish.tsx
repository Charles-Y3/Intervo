import { useState } from 'react';
import { formatClock } from '../engine/plan';
import { LIMITS } from '../engine/types';
import { S } from '../strings';

interface Props {
  elapsedSec: number;
  rounds: number;
  onAgain: () => void;
  onBack: () => void;
  onHistory: () => void;
  /** Save a short note on this workout's log entry. */
  onNote: (text: string) => void;
}

export function Finish({ elapsedSec, rounds, onAgain, onBack, onHistory, onNote }: Props) {
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);

  return (
    <div className="finish">
      <h1 className="finishTitle">{S.finished}</h1>
      <div className="finishStats">
        <div className="stat">
          <span className="muted">{S.finishedTime}</span>
          <strong data-testid="finish-time">{formatClock(elapsedSec)}</strong>
        </div>
        <div className="stat">
          <span className="muted">{S.finishedRounds}</span>
          <strong>{rounds}</strong>
        </div>
      </div>
      <p className="muted">{S.savedToHistory}</p>

      <div className="field finishNote">
        <label className="fieldLabel" htmlFor="workout-note">
          {S.noteTitle}
        </label>
        <textarea
          id="workout-note"
          className="noteBox"
          aria-label={S.noteLabel}
          placeholder={S.notePlaceholder}
          maxLength={LIMITS.maxNote}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setSaved(false);
          }}
        />
        <button
          className="btn btnSmall"
          onClick={() => {
            onNote(note);
            setSaved(true);
          }}
        >
          {S.noteSave}
        </button>
        {saved && (
          <p className="okText" role="status">
            {S.noteSaved}
          </p>
        )}
      </div>

      <button className="btn btnPrimary btnStart" onClick={onAgain}>
        {S.again}
      </button>
      <button className="btn" onClick={onHistory}>
        {S.viewProgress}
      </button>
      <button className="btn" onClick={onBack}>
        {S.backHome}
      </button>
    </div>
  );
}
