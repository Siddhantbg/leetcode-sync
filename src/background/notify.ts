/** Thin wrapper around chrome.notifications using the packaged extension icon. */
export function notify(title: string, message: string): void {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('src/assets/icon128.png'),
      title,
      message,
    });
  } catch (err) {
    console.warn('[LeetCode Sync] notification failed', err);
  }
}
