import type { GoalProgress } from '../engine/history';
import { S } from '../strings';

/** "This week: 2 of 3 workouts" with one dot per workout, and the streak. */
export function GoalCard({ progress }: { progress: GoalProgress }) {
  const { goal, thisWeek, streakWeeks } = progress;
  if (goal <= 0) return null;
  const met = thisWeek >= goal;
  return (
    <section className="goalCard" aria-label={S.goalThisWeek} data-testid="goal-card">
      <div className="goalRow">
        <span className="fieldLabel">{S.goalThisWeek}</span>
        <strong data-testid="goal-progress">{met ? S.goalReached : S.goalProgress(thisWeek, goal)}</strong>
      </div>
      <div className="goalDots" aria-hidden="true">
        {Array.from({ length: goal }, (_, i) => (
          <span key={i} className={`goalDot${i < thisWeek ? ' goalDotOn' : ''}`} />
        ))}
      </div>
      <p className="muted" data-testid="goal-streak">
        {streakWeeks > 0 ? S.goalStreak(streakWeeks) : S.goalNoStreak}
      </p>
    </section>
  );
}
