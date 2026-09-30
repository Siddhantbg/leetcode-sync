import type { PopupState, SyncStatus } from '@/types';
import { relativeTime, formatCount } from '@/utils/format';

/** Typed getElementById that throws early if the markup drifts. */
function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`[popup] missing element #${id}`);
  return node as T;
}

function show(node: HTMLElement, visible: boolean): void {
  node.classList.toggle('hidden', !visible);
}

const STATUS_LABEL: Record<SyncStatus, string> = {
  idle: 'idle',
  syncing: 'syncing…',
  success: 'synced',
  error: 'error',
};

/** Render a PopupState snapshot into the popup DOM. */
export function render(state: PopupState): void {
  // Connection indicator + which panel is visible.
  const connLabel = el('conn-label');
  connLabel.textContent = state.connected ? 'connected' : 'not connected';
  el('conn-indicator').classList.toggle('is-on', state.connected);

  show(el('disconnected'), !state.connected);
  show(el('connected'), state.connected);
  if (!state.connected) return;

  // Account + repository.
  el('account').textContent = state.username ?? '—';
  el('repo').textContent =
    state.username && state.repo
      ? `${state.username}/${state.repo}@${state.branch ?? 'main'}`
      : '—';

  // Sync status badge + error line.
  const badge = el('status-badge');
  badge.textContent = STATUS_LABEL[state.sync.status];
  badge.className = `badge badge-${state.sync.status}`;

  const errorLine = el('status-error');
  if (state.sync.status === 'error' && state.sync.error) {
    errorLine.textContent = state.sync.error;
    show(errorLine, true);
  } else {
    show(errorLine, false);
  }

  const detailLine = el('status-detail');
  if (state.sync.detail) {
    detailLine.textContent = state.sync.detail;
    show(detailLine, true);
  } else {
    show(detailLine, false);
  }

  // Last synced card.
  const last = state.lastSynced;
  show(el('last-empty'), !last);
  show(el('last-synced'), Boolean(last));
  if (last) {
    el('last-title').textContent = `#${last.number} ${last.title}`;
    const pill = el('last-diff');
    pill.textContent = last.difficulty;
    pill.className = `pill ${last.difficulty.toLowerCase()}`;
    el('last-lang').textContent = last.language;
    el('last-time').textContent = relativeTime(last.syncedAt);
  }

  // Statistics.
  el('stat-total').textContent = formatCount(state.totalSynced);
  el('stat-easy').textContent = formatCount(state.stats.byDifficulty.Easy);
  el('stat-medium').textContent = formatCount(state.stats.byDifficulty.Medium);
  el('stat-hard').textContent = formatCount(state.stats.byDifficulty.Hard);
  el('stat-streak').textContent = formatCount(state.stats.streak.current);
}
