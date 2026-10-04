import { formatClock } from '../engine/plan';
import { S } from '../strings';

export function Finish({ elapsedSec, rounds, onAgain, onBack, onHistory }: { elapsedSec: number; rounds: number; onAgain: () => void; onBack: () => void; onHistory: () => void }) {
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
