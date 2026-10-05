import { buildSteps, formatClock, hasRepSets, totalSeconds } from '../engine/plan';
import { TEMPLATES, templateCopy } from '../engine/templates';
import type { Template } from '../engine/templates';
import { LIMITS } from '../engine/types';
import type { Routine } from '../engine/types';
import { S } from '../strings';
import { Sheet } from './Sheet';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function TemplateMeta({ tpl }: { tpl: Template }) {
  const steps = buildSteps(tpl.routine);
  return (
    <span className="muted">
      {plural(tpl.routine.exercises.length, 'exercise', 'exercises')} · {plural(tpl.routine.rounds, 'round', 'rounds')} · {hasRepSets(steps) ? '≈ ' : ''}
      {formatClock(totalSeconds(steps))}
    </span>
  );
}

/** One starter routine with an Add button. Added ones show "Added" and are disabled. */
export function TemplateCard({ tpl, saved, onAdd, today = false }: { tpl: Template; saved: Routine[]; onAdd: (r: Routine) => void; today?: boolean }) {
  const have = saved.some((x) => x.id === tpl.routine.id);
  const full = saved.length >= LIMITS.maxSavedRoutines;
  return (
    <li className={`tplCard${today ? ' tplToday' : ''}`} data-testid="template-card">
      <strong>{tpl.routine.name}</strong>
      <button className="btn btnPrimary" disabled={have || full} aria-label={S.addTemplateLabel(tpl.routine.name)} onClick={() => onAdd(templateCopy(tpl))}>
        {have ? S.addedTemplate : S.addTemplate}
      </button>
      <span className="muted">{tpl.blurb}</span>
      <TemplateMeta tpl={tpl} />
    </li>
  );
}

/** The starter-routine library: tap Add to copy one into the user's routines. */
export function TemplateLibrary({ saved, onAdd, onClose }: { saved: Routine[]; onAdd: (r: Routine) => void; onClose: () => void }) {
  return (
    <Sheet title={S.templatesTitle} onClose={onClose}>
      <p className="muted">{S.templatesIntro}</p>
      {saved.length >= LIMITS.maxSavedRoutines && <p className="errorText">{S.templateFull}</p>}
      <ul className="tplList" aria-label={S.templatesTitle}>
        {TEMPLATES.map((tpl) => (
          <TemplateCard key={tpl.routine.id} tpl={tpl} saved={saved} onAdd={onAdd} />
        ))}
      </ul>
    </Sheet>
  );
}
