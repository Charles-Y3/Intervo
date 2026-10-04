import { S } from '../strings';
import { Sheet } from './Sheet';

/** Every delete in the app goes through this. Cancel is the first button and
 * the dialog opens focused on the dialog itself, never on the destructive button. */
export function ConfirmSheet({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet title={title} onClose={onCancel}>
      <p className="confirmText">{message}</p>
      <div className="sheetActions">
        <button className="btn" onClick={onCancel}>
          {cancelLabel ?? S.confirmCancel}
        </button>
        <button className="btn btnDanger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
