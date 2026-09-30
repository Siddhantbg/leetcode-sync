import { defineManifest } from '@crxjs/vite-plugin';

/**
 * Manifest V3 definition.
 *
 * We author the manifest in TypeScript so that @crxjs/vite-plugin can:
 *  - rewrite entry points to the hashed build output,
 *  - wire up HMR for the popup/options/content scripts during `vite dev`,
 *  - validate the shape of the manifest at build time.
 */
export default defineManifest({
  manifest_version: 3,
  name: 'LeetCode Sync',
  version: '0.1.0',
  description:
    'Automatically sync your accepted LeetCode solutions to a GitHub repository.',

  // The popup is the primary UI surface.
  action: {
    default_title: 'LeetCode Sync',
    default_popup: 'src/popup/index.html',
    default_icon: {
      16: 'src/assets/icon16.png',
      48: 'src/assets/icon48.png',
      128: 'src/assets/icon128.png',
    },
  },

  // Full settings live on the options page.
  options_page: 'src/options/index.html',

  // MV3 background is a single ES-module service worker.
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },

  // A single ISOLATED-world content script. It detects accepted submissions by
  // querying LeetCode's GraphQL API with the user's session (CSP-proof — no
  // MAIN-world injection, which LeetCode's Content-Security-Policy blocks).
  content_scripts: [
    {
      matches: ['https://leetcode.com/*', 'https://leetcode.cn/*'],
      js: ['src/content/content-script.ts'],
      run_at: 'document_idle',
    },
  ],

  permissions: [
    'storage', // persist settings, stats, last-synced submission
    'notifications', // surface success / failure to the user
    'scripting', // revive the content script in tabs opened before a reload
  ],

  // GitHub API + LeetCode pages we read from.
  host_permissions: [
    'https://api.github.com/*',
    'https://leetcode.com/*',
    'https://leetcode.cn/*',
  ],

  icons: {
    16: 'src/assets/icon16.png',
    48: 'src/assets/icon48.png',
    128: 'src/assets/icon128.png',
  },
});
