import { sanitizeHistory } from './history';
import type { HistoryEntry } from './history';
import { sanitizeAppState, sanitizeSaved, sanitizeSettings } from './storage';
import type { AppState } from './storage';
import { LIMITS } from './types';
import type { Routine, Settings } from './types';

/** Everything the app stores on the phone, as one file you can keep or move. */
export interface BackupData {
  settings: Settings;
  state: AppState;
  saved: Routine[];
  history: HistoryEntry[];
}

export const MAX_BACKUP_BYTES = 5_000_000;

export function makeBackup(data: BackupData, nowMs: number): string {
  return JSON.stringify(
    { app: 'intervo', version: 1, exportedAt: nowMs, settings: data.settings, state: data.state, saved: data.saved, history: data.history },
    null,
    2,
  );
}

export function backupFileName(nowMs: number): string {
  const d = new Date(nowMs);
  const p = (n: number) => String(n).padStart(2, '0');
  return `intervo-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

export type ParseResult = { ok: true; data: BackupData; exportedAt: number } | { ok: false; error: string };

/** A backup file is untrusted input: size-checked, parsed, then every part
 * goes through the same sanitizers as data read from localStorage. */
export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: 'tooBig' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'notJson' };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, error: 'notBackup' };
  const o = raw as Record<string, unknown>;
  if (o.app !== 'intervo' || o.version !== 1) return { ok: false, error: 'notBackup' };
  const exportedAt = typeof o.exportedAt === 'number' && Number.isFinite(o.exportedAt) ? o.exportedAt : 0;
  return {
    ok: true,
    exportedAt,
    data: {
      settings: sanitizeSettings(o.settings),
      state: sanitizeAppState(o.state),
      saved: sanitizeSaved(o.saved),
      history: sanitizeHistory(o.history),
    },
  };
}

/** Add what is missing; never overwrite what is already on this phone. */
export function mergeBackup(current: BackupData, incoming: BackupData): BackupData {
  const haveRoutine = new Set(current.saved.map((r) => r.id));
  const haveEntry = new Set(current.history.map((e) => e.id));
  return {
    settings: current.settings,
    state: current.state,
    saved: [...current.saved, ...incoming.saved.filter((r) => !haveRoutine.has(r.id))].slice(0, LIMITS.maxSavedRoutines),
    history: [...current.history, ...incoming.history.filter((e) => !haveEntry.has(e.id))]
      .sort((a, b) => b.at - a.at)
      .slice(0, LIMITS.maxHistory),
  };
}

export interface BackupCounts {
  routines: number;
  workouts: number;
}

export function countsOf(d: BackupData): BackupCounts {
  return { routines: d.saved.length, workouts: d.history.length };
}
