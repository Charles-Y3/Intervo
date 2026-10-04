import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { S } from '../strings';

/** Open sheets, last = top-most. Escape closes only the top one, so a popup
 * inside the routine editor does not also close the editor. */
const openSheets: symbol[] = [];

/** Bottom sheet with a backdrop. Escape and backdrop tap close it. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const me = useRef(Symbol('sheet'));
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && openSheets[openSheets.length - 1] === me.current && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => {
    const id = me.current;
    openSheets.push(id);
    return () => {
      openSheets.splice(openSheets.indexOf(id), 1);
    };
  }, []);
  return (
    <div className="sheetBackdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheetHeader">
          <h2 className="sheetTitle">{title}</h2>
          <button className="iconBtn" onClick={onClose} aria-label={S.closeLabel}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
