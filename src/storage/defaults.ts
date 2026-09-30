import type { Settings, Stats, SyncState } from '@/types';

export const DEFAULT_SETTINGS: Settings = {
  github: {
    username: '',
    repo: '',
    branch: 'main',
  },
  rootFolder: 'LeetCode',
  folderNaming: 'by-difficulty',
  fileNaming: 'number-title',
  perProblemFolder: false,
  commitMessageTemplate: 'LeetCode: Solve #{number} {title}',
  autoSync: true,
  includeReadme: false,
  includeNotes: false,
};

export const DEFAULT_STATS: Stats = {
  totalSynced: 0,
  byDifficulty: { Easy: 0, Medium: 0, Hard: 0 },
  streak: { current: 0, longest: 0, lastSyncDate: null },
  syncedKeys: [],
  contentHashes: {},
  lastSynced: null,
};

export const DEFAULT_SYNC_STATE: SyncState = {
  status: 'idle',
  error: null,
  detail: null,
  updatedAt: 0,
};
