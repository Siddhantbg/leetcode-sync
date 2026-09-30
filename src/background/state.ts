import { getPopupState, setSyncState } from '@/storage';
import { MessageType, type RuntimeMessage, type SyncState } from '@/types';

/**
 * Push the latest PopupState to any open popup. Safe to call when nothing is
 * listening — sendMessage rejects with "no receiving end", which we ignore.
 */
export async function broadcastState(): Promise<void> {
  const state = await getPopupState();
  const message: RuntimeMessage = { type: MessageType.StateUpdated, state };
  try {
    await chrome.runtime.sendMessage(message);
  } catch {
    /* no popup open */
  }
}

/** Persist a sync-state patch and broadcast the resulting snapshot. */
export async function updateSyncState(
  patch: Partial<SyncState>,
): Promise<void> {
  await setSyncState(patch);
  await broadcastState();
}
