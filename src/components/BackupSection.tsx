import { useRef, useState } from 'react';
import { MAX_BACKUP_BYTES, backupFileName, countsOf, makeBackup, mergeBackup, parseBackup } from '../engine/backup';
import type { BackupData } from '../engine/backup';
import { S } from '../strings';
import { ConfirmSheet } from './ConfirmSheet';
import { Sheet } from './Sheet';

interface Props {
  /** Everything currently on this phone. */
  data: BackupData;
  /** Replace the app's data with this. */
  onRestore: (next: BackupData) => void;
}

const ERRORS: Record<string, string> = {
  notJson: S.backupErrNotJson,
  notBackup: S.backupErrNotBackup,
  tooBig: S.backupErrTooBig,
};

/** Save everything to a file, or restore from one (merge or replace). */
export function BackupSection({ data, onRestore }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [incoming, setIncoming] = useState<{ data: BackupData; exportedAt: number } | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);

  async function exportFile() {
    setDone(false);
    const now = Date.now();
    const text = makeBackup(data, now);
    const name = backupFileName(now);
    // Phones: the share sheet lets you save to Files, Drive, email. Desktop: plain download.
    try {
      const file = new File([text], name, { type: 'application/json' });
      if (window.matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Intervo backup' });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // user closed the share sheet
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function onFile(file: File | undefined) {
    setError('');
    setDone(false);
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      setError(S.backupErrTooBig);
      return;
    }
    const res = parseBackup(await file.text());
    if (!res.ok) {
      setError(ERRORS[res.error] ?? S.backupErrNotBackup);
      return;
    }
    setIncoming({ data: res.data, exportedAt: res.exportedAt });
  }

  const close = () => {
    setIncoming(null);
    setConfirmReplace(false);
    if (fileInput.current) fileInput.current.value = '';
  };

  const counts = incoming ? countsOf(incoming.data) : null;
  const when = incoming && incoming.exportedAt > 0 ? new Date(incoming.exportedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  return (
    <div className="field">
      <div className="fieldLabel">{S.backupTitle}</div>
      <p className="muted">{S.backupHint}</p>
      <div className="chips">
        <button className="btn btnSmall" onClick={() => void exportFile()}>
          {S.backupExport}
        </button>
        <button className="btn btnSmall" onClick={() => fileInput.current?.click()}>
          {S.backupImport}
        </button>
        <input
          ref={fileInput}
          className="srOnly"
          type="file"
          accept="application/json,.json"
          aria-label={S.backupFile}
          tabIndex={-1}
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>
      {error && (
        <p className="errorText" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="okText" role="status">
          {S.restoreDone}
        </p>
      )}

      {incoming && counts && (
        <Sheet title={S.restoreTitle} onClose={close}>
          <p className="confirmText">{S.restoreSummary(counts.routines, counts.workouts, when)}</p>
          <button
            className="btn btnPrimary"
            onClick={() => {
              onRestore(mergeBackup(data, incoming.data));
              setDone(true);
              close();
            }}
          >
            {S.restoreMerge}
          </button>
          <p className="muted">{S.restoreMergeHint}</p>
          <button className="btn btnDangerOutline" onClick={() => setConfirmReplace(true)}>
            {S.restoreReplace}
          </button>
          <p className="muted">{S.restoreReplaceHint}</p>
          <button className="btn" onClick={close}>
            {S.confirmCancel}
          </button>
          {confirmReplace && (
            <ConfirmSheet
              title={S.restoreReplaceTitle}
              message={S.restoreReplaceBody}
              confirmLabel={S.restoreReplace}
              onCancel={() => setConfirmReplace(false)}
              onConfirm={() => {
                onRestore(incoming.data);
                setDone(true);
                close();
              }}
            />
          )}
        </Sheet>
      )}
    </div>
  );
}
