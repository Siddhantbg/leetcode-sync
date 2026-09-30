import './options.css';
import {
  getSettings,
  getToken,
  removeToken,
  resetSettings,
  setToken,
  updateSettings,
} from '@/storage';
import {
  authenticate,
  friendlyMessage,
  getRepo,
  GitHubApiError,
} from '@/github';
import { buildFilePath } from '@/utils/path';
import { renderCommitMessage } from '@/utils/template';
import { el, fillForm, readForm, SAMPLE_SUBMISSION } from './form';

let toastTimer: number | undefined;

function toast(message: string): void {
  const node = el('toast');
  node.textContent = message;
  node.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => node.classList.remove('show'), 2500);
}

function setStatus(id: string, message: string, kind: 'ok' | 'err' | ''): void {
  const node = el(id);
  node.textContent = message;
  node.className = `status${kind ? ` status-${kind}` : ''}`;
}

/** Recompute the path + commit-message previews from the live form values. */
function updatePreviews(): void {
  const settings = readForm();
  el('path-preview').textContent = buildFilePath(settings, SAMPLE_SUBMISSION);
  el('commit-preview').textContent = renderCommitMessage(
    settings.commitMessageTemplate,
    SAMPLE_SUBMISSION,
  );
}

async function connectToken(): Promise<void> {
  const token = el<HTMLInputElement>('token').value.trim();
  if (!token) {
    setStatus('account-status', 'Enter a token first.', 'err');
    return;
  }
  setStatus('account-status', 'Verifying…', '');
  try {
    const user = await authenticate(token);
    await setToken(token);
    markTokenSaved(`Connected as ${user.login}. Token saved.`);

    // Helpfully pre-fill the owner field if it is empty.
    const usernameInput = el<HTMLInputElement>('username');
    if (!usernameInput.value.trim()) {
      usernameInput.value = user.login;
      updatePreviews();
    }
  } catch (err) {
    setStatus('account-status', friendlyMessage(err), 'err');
  }
}

/** Clear the input and show an unmistakable saved indicator. */
function markTokenSaved(message = 'Token saved. Re-enter to replace it.'): void {
  const field = el<HTMLInputElement>('token');
  field.value = '';
  field.placeholder = '•••••••••••••••• (saved)';
  setStatus('account-status', message, 'ok');
}

async function removeStoredToken(): Promise<void> {
  await removeToken();
  const field = el<HTMLInputElement>('token');
  field.value = '';
  field.placeholder = 'github_pat_…';
  setStatus('account-status', 'Token removed.', '');
}

async function testRepository(): Promise<void> {
  const token = await getToken();
  if (!token) {
    setStatus('repo-status', 'Connect a token first.', 'err');
    return;
  }
  const { github } = readForm();
  if (!github.username || !github.repo) {
    setStatus('repo-status', 'Enter an owner and repository.', 'err');
    return;
  }
  setStatus('repo-status', 'Checking…', '');
  try {
    await getRepo(token, github.username, github.repo);
    setStatus('repo-status', `Found ${github.username}/${github.repo}.`, 'ok');
  } catch (err) {
    const msg =
      err instanceof GitHubApiError && err.kind === 'not_found'
        ? 'Repository not found (or token lacks access).'
        : friendlyMessage(err);
    setStatus('repo-status', msg, 'err');
  }
}

async function save(): Promise<void> {
  // If a token was typed but "Connect & verify" wasn't clicked, save it too
  // so the primary Save button behaves the way users expect.
  const typed = el<HTMLInputElement>('token').value.trim();
  if (typed) {
    await setToken(typed);
    markTokenSaved('Token saved.');
  }
  await updateSettings(readForm());
  toast('Settings saved.');
}

async function reset(): Promise<void> {
  const defaults = await resetSettings();
  fillForm(defaults);
  updatePreviews();
  toast('Settings reset to defaults.');
}

async function init(): Promise<void> {
  fillForm(await getSettings());
  updatePreviews();

  // Reflect whether a token is already stored (without revealing it).
  if (await getToken()) {
    markTokenSaved('A token is saved. Re-enter to replace, or remove it.');
  }

  el('connect-btn').addEventListener('click', () => void connectToken());
  el('remove-token-btn').addEventListener('click', () =>
    void removeStoredToken(),
  );
  el('test-repo-btn').addEventListener('click', () => void testRepository());
  el('save-btn').addEventListener('click', () => void save());
  el('reset-btn').addEventListener('click', () => void reset());

  // Live previews as the user edits organization / commit settings.
  for (const id of [
    'rootFolder',
    'folderNaming',
    'fileNaming',
    'perProblemFolder',
    'commitTemplate',
  ]) {
    el(id).addEventListener('input', updatePreviews);
    el(id).addEventListener('change', updatePreviews);
  }
}

document.addEventListener('DOMContentLoaded', () => void init());
