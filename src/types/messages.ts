import type { ProblemRef } from './problem';
import type { Submission } from './submission';
import type { PopupState } from './state';
import type { LastSynced } from './stats';

/** Message type constants (kept as a const object for ergonomic imports). */
export const MessageType = {
  /** content script -> background: an accepted submission was detected. */
  SubmissionAccepted: 'SUBMISSION_ACCEPTED',
  /** popup -> background: re-sync (or manually add) the latest submission. */
  ForceSync: 'FORCE_SYNC',
  /** popup -> background: edit a saved solution's label / complexity / notes. */
  UpdateSolution: 'UPDATE_SOLUTION',
  /** popup -> background: request the current PopupState snapshot. */
  GetState: 'GET_STATE',
  /** background -> popup (broadcast): state changed. */
  StateUpdated: 'STATE_UPDATED',
  /** popup/background -> content script: latest AC for the open problem. */
  GetCurrentSubmission: 'GET_CURRENT_SUBMISSION',
  /**
   * popup -> background: resolve which problem the popup should show
   * (active LeetCode tab preferred, else last submission).
   */
  ResolveSyncTarget: 'RESOLVE_SYNC_TARGET',
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

export interface SubmissionAcceptedMessage {
  type: typeof MessageType.SubmissionAccepted;
  submission: Submission;
}

/**
 * How Force Sync places the submission:
 *  - "auto": same pipeline as an accepted submission (dedupe → revision → new),
 *            but re-commits even if the code is unchanged.
 *  - "new":  always save as a separate solution unless the exact code already
 *            exists (skips near-duplicate revision merging).
 */
export type ForceSyncMode = 'auto' | 'new';

export interface ForceSyncMessage {
  type: typeof MessageType.ForceSync;
  mode?: ForceSyncMode;
  /** Optional display label for the solution (sets a user label). */
  label?: string;
  /** Optional annotations attached to the synced solution. */
  notes?: string;
  timeComplexity?: string;
  spaceComplexity?: string;
  /** When true, new notes are appended below any existing README notes. */
  appendNotes?: boolean;
  /**
   * Problem the popup believes it is editing. When set, Force Sync refuses to
   * write onto a different problem (prevents I/II title mix-ups).
   */
  expectedNumber?: number;
  expectedTitleSlug?: string;
}

export interface UpdateSolutionMessage {
  type: typeof MessageType.UpdateSolution;
  problemNumber: number;
  /** SolutionApproach.key of the solution to edit. */
  key: string;
  /** New label; empty string reverts to the automatic label. */
  label?: string;
  timeComplexity?: string;
  spaceComplexity?: string;
  notes?: string;
  appendNotes?: boolean;
}

export interface GetCurrentSubmissionMessage {
  type: typeof MessageType.GetCurrentSubmission;
}

export interface GetCurrentSubmissionResponse {
  submission: Submission | null;
  /** The open problem, even when it has no accepted submission yet. */
  problem?: ProblemRef | null;
}

export interface ResolveSyncTargetMessage {
  type: typeof MessageType.ResolveSyncTarget;
}

export interface ResolveSyncTargetResponse {
  submission: Submission | null;
  /** True when the submission came from the active LeetCode tab. */
  fromActiveTab: boolean;
  /** Problem the popup should show: the open tab's, else the last submission's. */
  problem?: ProblemRef | null;
}

export interface GetStateMessage {
  type: typeof MessageType.GetState;
}

export interface StateUpdatedMessage {
  type: typeof MessageType.StateUpdated;
  state: PopupState;
}

/** Discriminated union of every message exchanged over chrome.runtime. */
export type RuntimeMessage =
  | SubmissionAcceptedMessage
  | ForceSyncMessage
  | UpdateSolutionMessage
  | GetStateMessage
  | StateUpdatedMessage
  | GetCurrentSubmissionMessage
  | ResolveSyncTargetMessage;

/** Result of a sync attempt, returned to the caller that requested it. */
export interface SyncResult {
  ok: boolean;
  error?: string;
  lastSynced?: LastSynced;
  /** Key of the solution the submission was saved as (or matched). */
  solutionKey?: string;
  /** What happened to the submission. */
  outcome?: 'new' | 'revision' | 'updated' | 'duplicate';
  /** Label of the named slot the submission filled, if any. */
  slotLabel?: string;
  /** Human-readable summary of what was done. */
  detail?: string;
}
