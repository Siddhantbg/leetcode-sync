/**
 * Keep the content script running in open LeetCode tabs.
 *
 * Tabs opened before the extension was reloaded/updated keep an orphaned
 * content script that can no longer talk to the extension: accepted
 * submissions there are never detected and the popup can't tell which problem
 * is open. Re-inject the current script into those tabs.
 */
const LEETCODE_TABS = ['https://leetcode.com/*', 'https://leetcode.cn/*'];

function contentScriptFiles(): string[] {
  return chrome.runtime.getManifest().content_scripts?.flatMap((c) => c.js ?? []) ?? [];
}

export async function injectContentScript(tabId: number): Promise<boolean> {
  const files = contentScriptFiles();
  if (files.length === 0 || !chrome.scripting) return false;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files });
    return true;
  } catch (err) {
    console.warn('[LeetCode Sync] could not inject content script', tabId, err);
    return false;
  }
}

/** Run after install/update: every open LeetCode tab gets a live content script. */
export async function injectIntoOpenTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: LEETCODE_TABS });
  await Promise.all(tabs.map((t) => (t.id != null ? injectContentScript(t.id) : false)));
}
