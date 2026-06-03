import type { CodeKind, VizData } from '@/lib/codes/types';
import type { DisplayMode } from '@/stores/useAppStore';
import type { Locale } from '@/locales/LocaleContext';

/**
 * Cross-window sync between the TV display page (`/`) and the laptop scan page
 * (`/scan`). Both are the same origin, so the browser BroadcastChannel API
 * bridges them with no backend. A page never receives its own messages.
 */
export const SYNC_CHANNEL = 'nerdz-sync';

/** Messages sent from the scan page (laptop) to the display page (TV). */
export type ScanToDisplay =
  | { type: 'show'; viz: VizData } // a real decode — play once
  | { type: 'reset' } // back to the attract loop
  | { type: 'play' } // resume the current animation
  | { type: 'pause' } // freeze the current animation
  | { type: 'restart' } // replay the current code from stage 0
  | { type: 'setStage'; stage: number } // jump to a specific stage (0-based)
  | { type: 'setCodeType'; kind: CodeKind } // force an attract code type
  | { type: 'setLocale'; locale: Locale } // keep both screens in the same language
  | { type: 'requestState' }; // late joiner asks the display for its state

/** Snapshot of what the TV is currently showing. */
export interface DisplayState {
  mode: DisplayMode;
  codeType: CodeKind;
  stage: number;
  stageCount: number;
  autoPlay: boolean;
  /** Text currently on screen (live mode), else null. */
  decodedText: string | null;
}

/** Messages sent from the display page (TV) to the scan page (laptop). */
export type DisplayToScan =
  | { type: 'animationComplete' } // a live code reached its final stage
  | { type: 'state'; state: DisplayState }; // heartbeat / reply to requestState

export type SyncMessage = ScanToDisplay | DisplayToScan;

export interface SyncChannel {
  post: (message: SyncMessage) => void;
  close: () => void;
}

/**
 * Open the shared BroadcastChannel. Always pair with `close()` (e.g. in an
 * effect cleanup) so React StrictMode's double-mount doesn't leak channels or
 * double up message handlers.
 */
export function openSyncChannel(
  onMessage: (message: SyncMessage) => void,
): SyncChannel {
  const bc = new BroadcastChannel(SYNC_CHANNEL);
  bc.onmessage = (e: MessageEvent<SyncMessage>) => onMessage(e.data);
  return {
    post: (message) => bc.postMessage(message),
    close: () => {
      bc.onmessage = null;
      bc.close();
    },
  };
}
