import { useCallback, useEffect, useRef } from 'react';
import { openSyncChannel, type SyncChannel, type SyncMessage } from './channel';

/**
 * Subscribe to the cross-window sync channel and get a stable `post` function.
 *
 * The latest `onMessage` is always called (kept in a ref) so the channel effect
 * can run once and stay open, while StrictMode's mount→unmount→mount cycle
 * fully closes each channel in cleanup — no duplicate handlers, no leaks.
 */
export function useSyncChannel(
  onMessage: (message: SyncMessage) => void,
): (message: SyncMessage) => void {
  const cbRef = useRef(onMessage);
  useEffect(() => {
    cbRef.current = onMessage;
  });

  const channelRef = useRef<SyncChannel | null>(null);
  useEffect(() => {
    const channel = openSyncChannel((m) => cbRef.current(m));
    channelRef.current = channel;
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  return useCallback((message: SyncMessage) => {
    channelRef.current?.post(message);
  }, []);
}
