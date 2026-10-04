import { cleanName, clampInt, newId } from './storage';
import { LIMITS } from './types';
import type { Routine, RunResult } from './types';

/** The workout log. One entry per workout, finished or ended early. Pure
 * functions only (filtering, grouping, chart data) so they are unit tested;
 * the History screen just draws what these return. Dates are the phone's
 * local time. */

export interface ExerciseStat {
  name: string;
  /** Work steps fully completed. */
  sets: number;
  /** Seconds of work actually done (partial sets count). */
  workSec: number;
  /** Length of the longest completed timed set, in seconds. */
  longestSec: number;
  /** Reps confirmed across all sets (rep exercises; 0 for timed). */
  reps: number;
  /** Most reps in a single set. */
  bestReps: number;
}

export interface HistoryEntry {
  id: string;
  /** Epoch ms when the workout ended. */
  at: number;
  routineName: string;
  mode: 'quick' | 'routine';
  rounds: number;
  roundsDone: number;
  /** Active time (pauses excluded), seconds. */
  totalSec: number;
  workSec: number;
  completed: boolean;
  exercises: ExerciseStat[];
}

const key = (name: string) => name.trim().toLowerCase();

export function buildEntry(routine: Routine, result: RunResult, totalSec: number, completed: boolean, at: number): HistoryEntry {
  const byName = new Map<string, ExerciseStat>();
  for (const w of result.work) {
    const k = key(w.name);
    const stat = byName.get(k) ?? { name: w.name, sets: 0, workSec: 0, longestSec: 0, reps: 0, bestReps: 0 };
    stat.workSec += w.sec;
    if (w.complete) {
      stat.sets += 1;
      stat.longestSec = Math.max(stat.longestSec, w.plannedSec);
    }
    if (w.targetReps > 0) {
      stat.reps += w.reps;
      stat.bestReps = Math.max(stat.bestReps, w.reps);
    }
    byName.set(k, stat);
  }
  const exercises = [...byName.values()].map((e) => ({ ...e, workSec: Math.round(e.workSec) }));
  return {
    id: newId(),
    at,
    routineName: routine.name,
    mode: routine.id === 'quick' ? 'quick' : 'routine',
    rounds: routine.rounds,
    roundsDone: result.roundsDone,
    totalSec: Math.round(totalSec),
    workSec: exercises.reduce((a, e) => a + e.workSec, 0),
    completed,
    exercises,
  };
}

/** Does any entry contain rep-based sets? Decides whether the rep metrics are offered. */
export function hasRepData(entries: HistoryEntry[]): boolean {
  return entries.some((e) => e.exercises.some((s) => s.reps > 0));
}

/** Worth logging? Ignores accidental starts (under 3 s of work). */
export function worthLogging(result: RunResult): boolean {
  return result.work.reduce((a, w) => a + w.sec, 0) >= 3;
}

// ---- reading from storage (untrusted) ----

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function sanitizeStat(v: unknown, i: number): ExerciseStat {
  const o = isRecord(v) ? v : {};
  return {
    name: cleanName(o.name, `Exercise ${i + 1}`),
    sets: clampInt(o.sets, 0, 9999, 0),
    workSec: clampInt(o.workSec, 0, 999999, 0),
    longestSec: clampInt(o.longestSec, 0, LIMITS.maxSeconds, 0),
    reps: clampInt(o.reps, 0, 999999, 0),
    bestReps: clampInt(o.bestReps, 0, LIMITS.maxReps, 0),
  };
}

export function sanitizeHistory(v: unknown): HistoryEntry[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: HistoryEntry[] = [];
  for (const item of v.slice(0, LIMITS.maxHistory)) {
    if (!isRecord(item)) continue;
    const at = typeof item.at === 'number' && Number.isFinite(item.at) ? Math.round(item.at) : NaN;
    // 2020-01-01 .. 2100-01-01: anything else is corrupt data, not a workout.
    if (!(at >= 1577836800000 && at <= 4102444800000)) continue;
    const id = typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 40 ? item.id : newId();
    if (seen.has(id)) continue;
    seen.add(id);
    const list = Array.isArray(item.exercises) ? item.exercises.slice(0, LIMITS.maxExercises) : [];
    out.push({
      id,
      at,
      routineName: cleanName(item.routineName, 'Workout'),
      mode: item.mode === 'quick' ? 'quick' : 'routine',
      rounds: clampInt(item.rounds, 1, LIMITS.maxRounds, 1),
      roundsDone: clampInt(item.roundsDone, 0, LIMITS.maxRounds, 0),
      totalSec: clampInt(item.totalSec, 0, 999999, 0),
      workSec: clampInt(item.workSec, 0, 999999, 0),
      completed: item.completed === true,
      exercises: list.map(sanitizeStat),
    });
  }
  return out.sort((a, b) => b.at - a.at);
}

// ---- dates ----

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse YYYY-MM-DD as a local date; undefined if not a real date. */
export function parseDay(s: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dayKey(d.getTime()) === s ? d : undefined;
}

export type RangePreset = '7' | '30' | '90' | 'all' | 'custom';

/** from/to as YYYY-MM-DD ('' = open ended) for a preset, counting back from today. */
export function rangeFor(preset: RangePreset, todayMs: number): { from: string; to: string } {
  if (preset === 'all' || preset === 'custom') return { from: '', to: '' };
  const d = new Date(todayMs);
  d.setDate(d.getDate() - (Number(preset) - 1));
  return { from: dayKey(d.getTime()), to: dayKey(todayMs) };
}

// ---- filtering ----

export interface Filters {
  from: string;
  to: string;
  /** Routine name, '' = all. */
  routine: string;
  /** Exercise name, '' = all. */
  exercise: string;
}

export const NO_FILTERS: Filters = { from: '', to: '', routine: '', exercise: '' };

export function filterEntries(entries: HistoryEntry[], f: Filters): HistoryEntry[] {
  const ex = key(f.exercise);
  return entries.filter((e) => {
    const day = dayKey(e.at);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    if (f.routine && e.routineName !== f.routine) return false;
    if (ex && !e.exercises.some((s) => key(s.name) === ex)) return false;
    return true;
  });
}

export function routineNames(entries: HistoryEntry[]): string[] {
  return [...new Set(entries.map((e) => e.routineName))].sort((a, b) => a.localeCompare(b));
}

/** Distinct exercise names (case-insensitive), most recently used spelling. */
export function exerciseNames(entries: HistoryEntry[]): string[] {
  const names = new Map<string, string>();
  for (const e of [...entries].sort((a, b) => a.at - b.at)) for (const s of e.exercises) names.set(key(s.name), s.name);
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

/** The numbers an entry contributes: just the chosen exercise, or everything. */
export function statsFor(e: HistoryEntry, exercise: string): { workSec: number; sets: number; longestSec: number; reps: number; bestReps: number } {
  const ex = key(exercise);
  const list = ex ? e.exercises.filter((s) => key(s.name) === ex) : e.exercises;
  return {
    workSec: list.reduce((a, s) => a + s.workSec, 0),
    sets: list.reduce((a, s) => a + s.sets, 0),
    longestSec: list.reduce((a, s) => Math.max(a, s.longestSec), 0),
    reps: list.reduce((a, s) => a + s.reps, 0),
    bestReps: list.reduce((a, s) => Math.max(a, s.bestReps), 0),
  };
}

export interface Summary {
  sessions: number;
  workSec: number;
  sets: number;
  reps: number;
}

export function summarize(entries: HistoryEntry[], exercise: string): Summary {
  let workSec = 0;
  let sets = 0;
  let reps = 0;
  for (const e of entries) {
    const s = statsFor(e, exercise);
    workSec += s.workSec;
    sets += s.sets;
    reps += s.reps;
  }
  return { sessions: entries.length, workSec, sets, reps };
}

// ---- chart data ----

export type Group = 'day' | 'week' | 'month';
export type Metric = 'time' | 'sets' | 'longest' | 'sessions' | 'reps' | 'bestReps';

export interface Bucket {
  /** Sort/ID key: YYYY-MM-DD (day, week start) or YYYY-MM. */
  key: string;
  /** Local start of the bucket, for labelling. */
  start: number;
  value: number;
}

function startOf(group: Group, ms: number): Date {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  if (group === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  if (group === 'month') d.setDate(1);
  return d;
}

function bucketKey(group: Group, d: Date): string {
  return group === 'month' ? dayKey(d.getTime()).slice(0, 7) : dayKey(d.getTime());
}

function next(group: Group, d: Date): Date {
  const n = new Date(d);
  if (group === 'day') n.setDate(n.getDate() + 1);
  else if (group === 'week') n.setDate(n.getDate() + 7);
  else n.setMonth(n.getMonth() + 1);
  return n;
}

const MAX_BUCKETS = 120;

/** Time series for the chart. Empty periods are included (value 0) so gaps
 * in training are visible. The span is the filter's date range when both
 * ends are set, otherwise first to last entry. Only the latest 120 buckets
 * are returned. */
export function bucketize(entries: HistoryEntry[], f: Filters, group: Group, metric: Metric): Bucket[] {
  if (entries.length === 0) return [];
  const times = entries.map((e) => e.at);
  const lo = f.from && parseDay(f.from) ? parseDay(f.from)!.getTime() : Math.min(...times);
  const hi = f.to && parseDay(f.to) ? parseDay(f.to)!.getTime() : Math.max(...times);

  const map = new Map<string, number>();
  for (const e of entries) {
    const k = bucketKey(group, startOf(group, e.at));
    const s = statsFor(e, f.exercise);
    const cur = map.get(k) ?? 0;
    if (metric === 'time') map.set(k, cur + s.workSec);
    else if (metric === 'sets') map.set(k, cur + s.sets);
    else if (metric === 'sessions') map.set(k, cur + 1);
    else if (metric === 'reps') map.set(k, cur + s.reps);
    else if (metric === 'bestReps') map.set(k, Math.max(cur, s.bestReps));
    else map.set(k, Math.max(cur, s.longestSec));
  }

  const out: Bucket[] = [];
  const end = startOf(group, Math.max(hi, lo)).getTime();
  for (let d = startOf(group, Math.min(lo, hi)); d.getTime() <= end && out.length < 5000; d = next(group, d)) {
    const k = bucketKey(group, d);
    out.push({ key: k, start: d.getTime(), value: map.get(k) ?? 0 });
  }
  return out.slice(-MAX_BUCKETS);
}

/** Sensible default grouping for a span of days. */
export function defaultGroup(spanDays: number): Group {
  return spanDays <= 31 ? 'day' : spanDays <= 182 ? 'week' : 'month';
}

export function spanDays(entries: HistoryEntry[], f: Filters): number {
  if (f.from && f.to) {
    const a = parseDay(f.from);
    const b = parseDay(f.to);
    if (a && b) return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
  }
  if (entries.length === 0) return 1;
  const t = entries.map((e) => e.at);
  return Math.max(1, Math.round((Math.max(...t) - Math.min(...t)) / 86400000) + 1);
}
