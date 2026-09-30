/**
 * Background service worker (MV3) — entry point.
 *
 * Responsibilities:
 *   - receive messages (accepted submissions, force sync, state requests),
 *   - run the sync workflow (GitHub upload, retries, stats),
 *   - show notifications and broadcast state to the popup.
 *
 * Listeners are registered synchronously at top level so the worker can be woken
 * by events after being suspended.
 *
 * NOTE: this file is intentionally NOT named index.ts — a basename collision
 * with the content script's index.ts produced cross-wired build chunks (the
 * service worker ended up importing the content bundle, which references
 * `window` and is illegal in a service worker).
 */
import { clearLegacyMultiSolutionPrefs } from '@/storage';
import { injectIntoOpenTabs } from './inject';
import { registerMessageHandlers } from './messages';

console.info('[LeetCode Sync] background service worker started');

chrome.runtime.onInstalled.addListener((details) => {
  console.info('[LeetCode Sync] installed/updated:', details.reason);
  void clearLegacyMultiSolutionPrefs();
  void injectIntoOpenTabs();
});

registerMessageHandlers();
