import { useMemo, useState } from 'react';
import {
  bucketize,
  defaultGroup,
  exerciseNames,
  filterEntries,
  hasRepData,
  parseDay,
  rangeFor,
  routineNames,
  spanDays,
  statsFor,
  summarize,
} from '../engine/history';
import type { Filters, Group, HistoryEntry, Metric, RangePreset } from '../engine/history';
import { formatClock, formatShort } from '../engine/plan';
import { S } from '../strings';
import { BarChart } from './BarChart';
import { ConfirmSheet } from './ConfirmSheet';

interface Props {
  entries: HistoryEntry[];
  onDelete: (id: string) => void;
  onClear: () => void;
  onBack: () => void;
}

const PAGE = 30;

export function History({ entries, onDelete, onClear, onBack }: Props) {
  const [preset, setPreset] = useState<RangePreset>('30');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [routine, setRoutine] = useState('');
  const [exercise, setExercise] = useState('');
  const [metric, setMetric] = useState<Metric>('time');
  const [groupChoice, setGroupChoice] = useState<Group | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [confirm, setConfirm] = useState<{ kind: 'one'; entry: HistoryEntry } | { kind: 'all' } | null>(null);

  const now = Date.now();
  const range = preset === 'custom' ? custom : rangeFor(preset, now);
  const f: Filters = {
    from: parseDay(range.from) ? range.from : '',
    to: parseDay(range.to) ? range.to : '',
    routine,
    exercise,
  };
  const filtered = useMemo(() => filterEntries(entries, f), [entries, f.from, f.to, f.routine, f.exercise]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = spanDays(filtered, f);
  const group = groupChoice ?? defaultGroup(days);
  const buckets = useMemo(() => bucketize(filtered, f, group, metric), [filtered, f.from, f.to, f.exercise, group, metric]); // eslint-disable-line react-hooks/exhaustive-deps
  const sum = summarize(filtered, exercise);
  const dirty = routine !== '' || exercise !== '' || preset !== '30';

  const format = (v: number) => (metric === 'time' || metric === 'longest' ? formatShort(v) : String(Math.round(v)));
  const repData = hasRepData(entries);
  const metrics: [Metric, string][] = [
    ['time', S.metricTime],
    ['sets', S.metricSets],
    ['longest', S.metricLongest],
    ['sessions', S.metricSessions],
    ...(repData ? ([['reps', S.metricReps], ['bestReps', S.metricBestReps]] as [Metric, string][]) : []),
  ];
  const presets: [RangePreset, string][] = [
    ['7', S.last7],
    ['30', S.last30],
    ['90', S.last90],
    ['all', S.allTime],
    ['custom', S.customRange],
  ];
  const groups: [Group, string][] = [
    ['day', S.groupDay],
    ['week', S.groupWeek],
    ['month', S.groupMonth],
  ];

  return (
    <main className="page">
      <header className="header">
        <button className="btn btnSmall" onClick={onBack}>
          ← {S.back}
        </button>
        <h1 className="brand">{S.historyTitle}</h1>
      </header>

      {entries.length === 0 ? (
        <p className="field muted" data-testid="history-empty">
          {S.noHistory}
        </p>
      ) : (
        <>
          <div className={sum.reps > 0 ? 'stats3 stats4' : 'stats3'}>
            <div className="stat">
              <span className="muted">{S.statWorkouts}</span>
              <strong data-testid="stat-workouts">{sum.sessions}</strong>
            </div>
            <div className="stat">
              <span className="muted">{S.statWorkTime}</span>
              <strong>{formatShort(sum.workSec)}</strong>
            </div>
            <div className="stat">
              <span className="muted">{S.statSets}</span>
              <strong>{sum.sets}</strong>
            </div>
            {sum.reps > 0 && (
              <div className="stat">
                <span className="muted">{S.statReps}</span>
                <strong data-testid="stat-reps">{sum.reps}</strong>
              </div>
            )}
          </div>

          <section className="field" aria-label={S.filters}>
            <div className="fieldLabel">{S.dates}</div>
            <div className="chips" role="group" aria-label={S.dates}>
              {presets.map(([v, label]) => (
                <button
                  key={v}
                  className={`chip${preset === v ? ' chipOn' : ''}`}
                  aria-pressed={preset === v}
                  onClick={() => {
                    if (v === 'custom' && preset !== 'custom') setCustom({ from: range.from, to: range.to });
                    setPreset(v);
                    setShown(PAGE);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {preset === 'custom' && (
              <div className="dateRow">
                <label className="dateLabel">
                  {S.dateFrom}
                  <input className="textInput" type="date" aria-label={S.dateFrom} value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
                </label>
                <label className="dateLabel">
                  {S.dateTo}
                  <input className="textInput" type="date" aria-label={S.dateTo} value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
                </label>
              </div>
            )}
            <label className="dateLabel">
              {S.routineFilter}
              <select
                className="textInput"
                aria-label={S.routineFilter}
                value={routine}
                onChange={(e) => {
                  setRoutine(e.target.value);
                  setShown(PAGE);
                }}
              >
                <option value="">{S.allRoutines}</option>
                {routineNames(entries).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="dateLabel">
              {S.exerciseFilter}
              <select
                className="textInput"
                aria-label={S.exerciseFilter}
                value={exercise}
                onChange={(e) => {
                  setExercise(e.target.value);
                  setShown(PAGE);
                }}
              >
                <option value="">{S.allExercises}</option>
                {exerciseNames(entries).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            {dirty && (
              <button
                className="btn btnSmall"
                onClick={() => {
                  setPreset('30');
                  setRoutine('');
                  setExercise('');
                  setShown(PAGE);
                }}
              >
                {S.resetFilters}
              </button>
            )}
          </section>

          <section className="field" aria-label={S.progress}>
            <div className="fieldLabel">{S.progress}</div>
            <div className="chips" role="group" aria-label={S.progress}>
              {metrics.map(([v, label]) => (
                <button key={v} className={`chip${metric === v ? ' chipOn' : ''}`} aria-pressed={metric === v} onClick={() => setMetric(v)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="chips" role="group" aria-label={S.groupBy}>
              {groups.map(([v, label]) => (
                <button key={v} className={`chip${group === v ? ' chipOn' : ''}`} aria-pressed={group === v} onClick={() => setGroupChoice(v)}>
                  {label}
                </button>
              ))}
            </div>
            <BarChart
              key={`${f.from}|${f.to}|${routine}|${exercise}|${metric}|${group}`}
              buckets={buckets}
              group={group}
              format={format}
              metricLabel={metrics.find((m) => m[0] === metric)![1]}
              isTime={metric === 'time' || metric === 'longest'}
            />
          </section>

          {filtered.length === 0 ? (
            <p className="muted" data-testid="history-no-match">
              {S.noMatches}
            </p>
          ) : (
            <ul className="histList" aria-label={S.historyTitle}>
              {filtered.slice(0, shown).map((e) => {
                const mine = statsFor(e, exercise);
                return (
                  <li key={e.id} className="histItem" data-testid="history-item">
                    <div className="histTop">
                      <div>
                        <strong>{e.routineName}</strong>
                        <p className="muted">{new Date(e.at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                      </div>
                      <span className={`tag${e.completed ? ' tagOk' : ''}`}>{e.completed ? S.completedTag : S.partialTag}</span>
                    </div>
                    <p className="muted">
                      {S.roundsDone(e.roundsDone, e.rounds)} · {formatClock(e.totalSec)} · {S.statWorkTime.toLowerCase()} {formatShort(exercise ? mine.workSec : e.workSec)}
                    </p>
                    <p className="histEx">
                      {e.exercises
                        .filter((s) => !exercise || s.name.toLowerCase() === exercise.toLowerCase())
                        .map((s) =>
                          s.reps > 0
                            ? `${s.name} ${s.reps} ${S.repsUnit} · ${s.sets} sets (best ${s.bestReps})`
                            : `${s.name} ×${s.sets}${s.longestSec ? ` (${formatShort(s.longestSec)})` : ''}`,
                        )
                        .join(' · ')}
                    </p>
                    <button className="btn btnSmall" onClick={() => setConfirm({ kind: 'one', entry: e })} aria-label={`${S.deleteWorkout}: ${e.routineName}`}>
                      {S.deleteWorkout}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {filtered.length > shown && (
            <button className="btn" onClick={() => setShown((n) => n + PAGE)}>
              {S.showMore}
            </button>
          )}

          <button className="btn btnDangerOutline" onClick={() => setConfirm({ kind: 'all' })}>
            {S.clearHistory}
          </button>
        </>
      )}

      {confirm?.kind === 'one' && (
        <ConfirmSheet
          title={S.confirmDeleteWorkoutTitle}
          message={S.confirmDeleteWorkoutBody}
          confirmLabel={S.deleteWorkout}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            onDelete(confirm.entry.id);
            setConfirm(null);
          }}
        />
      )}
      {confirm?.kind === 'all' && (
        <ConfirmSheet
          title={S.confirmClearTitle}
          message={S.confirmClearBody(entries.length)}
          confirmLabel={S.clearHistory}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            onClear();
            setConfirm(null);
          }}
        />
      )}
    </main>
  );
}

