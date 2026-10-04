import { useRegisterSW } from 'virtual:pwa-register/react';
import { S } from '../strings';

/** Shows "a new version is waiting" as a banner. registerType is 'prompt'
 * so the service worker never swaps itself in silently mid-workout. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="updatePrompt" role="status">
      <p className="updatePromptText">{S.updateAvailable}</p>
      <div className="updatePromptActions">
        <button className="btn btnSmall btnPrimary" onClick={() => updateServiceWorker(true)}>
          {S.updateReload}
        </button>
        <button className="btn btnSmall" onClick={() => setNeedRefresh(false)}>
          {S.updateDismiss}
        </button>
      </div>
    </div>
  );
}
