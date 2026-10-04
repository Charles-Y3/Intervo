import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { S } from '../strings';

/** Bottom sheet with a backdrop. Escape and backdrop tap close it. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
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
