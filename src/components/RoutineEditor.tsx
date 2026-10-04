import { useState } from 'react';
import { buildSteps, formatClock, hasRepSets, totalSeconds } from '../engine/plan';
import { cleanName } from '../engine/storage';
import { LIMITS } from '../engine/types';
import type { Routine } from '../engine/types';
import { S } from '../strings';
import { ConfirmSheet } from './ConfirmSheet';
import { ExerciseList, TimingFields } from './RoutineFields';
import { Sheet } from './Sheet';

interface Props {
  initial: Routine;
  isNew: boolean;
  onSave: (r: Routine) => void;
  onSaveAndStart: (r: Routine) => void;
  onDelete: (r: Routine) => void;
  onClose: () => void;
}

/** Popup for one routine: edit everything, then Save, Save and start, or Delete.
 * Closing with unsaved changes asks first; Delete always asks first. */
export function RoutineEditor({ initial, isNew, onSave, onSaveAndStart, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState<Routine>(initial);
  const [confirm, setConfirm] = useState<'discard' | 'delete' | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const patch = (p: Partial<Routine>) => setDraft((d) => ({ ...d, ...p }));
  const steps = buildSteps(draft);
  const estimated = hasRepSets(steps);
  const clean = (): Routine => ({ ...draft, name: cleanName(draft.name, S.defaultRoutineName) });

  return (
    <Sheet title={isNew ? S.newRoutine : S.editRoutine} onClose={() => (dirty ? setConfirm('discard') : onClose())}>
      <label className="dateLabel">
        <span className="fieldLabel">{S.routineName}</span>
        <input className="textInput" aria-label={S.routineName} value={draft.name} maxLength={LIMITS.maxNameLength} onChange={(e) => patch({ name: e.target.value })} />
      </label>

      <ExerciseList exercises={draft.exercises} onChange={(exercises) => patch({ exercises })} />
      <TimingFields r={draft} patch={patch} multi />

      <div className="stickyActions">
        <div className="startTotal">
          <span className="muted">{estimated ? S.totalEstimate : S.total}</span>{' '}
          <strong>
            {estimated ? '≈ ' : ''}
            {formatClock(totalSeconds(steps))}
          </strong>
        </div>
        <div className="editorButtons">
          {!isNew && (
            <button className="btn btnDangerOutline" onClick={() => setConfirm('delete')}>
              {S.deleteRoutine}
            </button>
          )}
          <button className="btn" onClick={() => onSave(clean())}>
            {S.saveRoutine}
          </button>
          <button className="btn btnPrimary" onClick={() => onSaveAndStart(clean())}>
            {S.saveAndStart}
          </button>
        </div>
      </div>

      {confirm === 'discard' && (
        <ConfirmSheet
          title={S.discardTitle}
          message={S.discardBody}
          confirmLabel={S.discard}
          cancelLabel={S.keepEditing}
          onCancel={() => setConfirm(null)}
          onConfirm={onClose}
        />
      )}
      {confirm === 'delete' && (
        <ConfirmSheet
          title={S.confirmDeleteRoutineTitle}
          message={S.confirmDeleteRoutineBody(initial.name)}
          confirmLabel={S.deleteRoutine}
          onCancel={() => setConfirm(null)}
          onConfirm={() => onDelete(initial)}
        />
      )}
    </Sheet>
  );
}
