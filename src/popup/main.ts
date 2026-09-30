import './popup.css';
import {
  getLastSubmission,
  getPopupState,
  getProblemIndex,
  getProblemSlots,
  onStorageChanged,
  setProblemSlots,
} from '@/storage';
import {
  MessageType,
  type ForceSyncMessage,
  type ProblemRef,
  type ProblemSlots,
  type ResolveSyncTargetResponse,
  type RuntimeMessage,
  type SolutionApproach,
  type SolutionSlot,
  type SolvedProblem,
  type SyncResult,
} from '@/types';
import { classifySolutions, displayLabel } from '@/utils/classify';
import { createSlot, editSlot, slotLabelError, withoutSlot } from '@/utils/slots';
import { normalizeProblemEntry, orderForDisplay } from '@/utils/solution';
import { render } from './render';

let toastTimer: number | undefined;

/** Problem the popup is showing (active LeetCode tab preferred). */
let problem: ProblemRef | null = null;
let fromActiveTab = false;
let entry: SolvedProblem | undefined;
let slots: ProblemSlots = { slots: [] };
/** A saved solution's key or a slot's id. */
let selectedKey: string | null = null;
/** Avoid clobbering in-progress edits when storage events fire mid-type. */
let formDirty = false;

function toast(message: string): void {
  const node = document.getElementById('toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => node.classList.remove('show'), 3500);
}

function el<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function setField(id: string, value: string, placeholder?: string): void {
  const node = el<HTMLInputElement | HTMLTextAreaElement>(id);
  if (!node) return;
  node.value = value;
  if (placeholder !== undefined) node.placeholder = placeholder;
}

function getField(id: string): string {
  return el<HTMLInputElement | HTMLTextAreaElement>(id)?.value.trim() ?? '';
}

function show(id: string, visible: boolean): void {
  el(id)?.classList.toggle('hidden', !visible);
}

function setText(id: string, text: string): void {
  const node = el(id);
  if (node) node.textContent = text;
}

function selectedSolution(): SolutionApproach | undefined {
  return entry?.solutions?.find((s) => s.key === selectedKey);
}

function selectedSlot(): SolutionSlot | undefined {
  return slots.slots.find((s) => s.id === selectedKey);
}

/** A value equal to the analyzer's is automatic; anything else was typed by the user. */
function userValue(value: string | undefined, auto: string | undefined): string {
  return value && value !== auto ? value : '';
}

function complexitySummary(time?: string, space?: string): string {
  if (!time && !space) return 'complexity unknown';
  return `${time ?? '—'} · ${space ?? '—'}`;
}

/* ------------------------------ List ------------------------------ */

function row(key: string, onSelect: () => void): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'solution';
  li.tabIndex = 0;
  li.dataset.key = key;
  if (key === selectedKey) li.classList.add('is-selected');
  li.addEventListener('click', onSelect);
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  });
  return li;
}

function span(className: string, text: string): HTMLSpanElement {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = text;
  return node;
}

function line(className: string, ...children: Node[]): HTMLDivElement {
  const div = document.createElement('div');
  div.className = className;
  div.append(...children);
  return div;
}

function renderSolutions(): void {
  const list = el('solutions-list');
  const empty = el('solutions-empty');
  const heading = el('solutions-problem');
  if (!list || !empty || !heading) return;

  list.innerHTML = '';
  heading.textContent = problem ? `#${problem.number} ${problem.title}` : '';
  heading.classList.toggle('hidden', !problem);
  show('add-btn', Boolean(problem));

  const solutions = entry ? orderForDisplay(entry) : [];
  const total = solutions.length + slots.slots.length;
  if (!problem) {
    empty.textContent = 'Open a LeetCode problem to see its saved solutions.';
  } else if (total === 0) {
    empty.textContent =
      'No solutions saved yet. Submit on LeetCode — accepted solutions are saved automatically.';
  }
  empty.classList.toggle('hidden', total > 0);

  const multiLanguage = new Set(solutions.map((s) => s.language)).size > 1;
  const multiple = solutions.length > 1;

  for (const s of solutions) {
    const li = row(s.key, () => selectItem(s.key));
    const isBest = multiple && entry?.bestKey === s.key;
    if (isBest) li.classList.add('is-best');

    const autoTime = Boolean(s.timeComplexity && s.timeComplexity === s.analysis?.timeComplexity);
    const autoSpace = Boolean(s.spaceComplexity && s.spaceComplexity === s.analysis?.spaceComplexity);
    const cx = span('sol-cx', complexitySummary(s.timeComplexity, s.spaceComplexity));
    if (autoTime || autoSpace) cx.title = 'Auto-detected from the code';

    const main = line('sol-main', span('sol-label', `${isBest ? '⭐ ' : ''}${displayLabel(s)}`));
    if (multiLanguage) main.append(span('sol-lang', s.language));
    main.append(cx);
    li.append(main);

    const meta = [
      s.approach ? `${s.approach}/` : undefined,
      s.analysis?.pattern,
      autoTime || autoSpace ? 'auto-detected' : undefined,
      s.revisions ? `${s.revisions} revision${s.revisions > 1 ? 's' : ''}` : undefined,
    ].filter(Boolean);
    if (meta.length > 0) li.append(line('sol-sub', document.createTextNode(meta.join(' · '))));
    list.append(li);
  }

  for (const slot of slots.slots) {
    const li = row(slot.id, () => selectItem(slot.id));
    li.classList.add('is-slot');
    const armed = slots.armedId === slot.id;
    if (armed) li.classList.add('is-armed');

    li.append(
      line(
        'sol-main',
        span('sol-label', slot.label),
        span('sol-cx', complexitySummary(slot.timeComplexity, slot.spaceComplexity)),
      ),
      line(
        'sol-sub',
        document.createTextNode(
          armed
            ? `${slot.approach}/ · next accepted submission saves here`
            : `${slot.approach}/ · empty — select it, then submit`,
        ),
      ),
    );
    list.append(li);
  }
}

/* ----------------------------- Editor ----------------------------- */

/** The label classification would assign if the user label were cleared. */
function autoLabelFor(s: SolutionApproach): string {
  if (s.labelSource !== 'user') return displayLabel(s);
  const reset = (entry?.solutions ?? []).map((x) =>
    x.key === s.key ? { ...x, labelSource: 'auto' as const, label: undefined } : x,
  );
  const auto = classifySolutions(reset).solutions.find((x) => x.key === s.key);
  return auto ? displayLabel(auto) : 'Primary';
}

function fillEditor(): void {
  const s = selectedSolution();
  const slot = selectedSlot();
  show('solution-editor', Boolean(s || slot));
  show('remove-slot-btn', Boolean(slot));

  if (slot) {
    setText('editor-heading', `${slot.label} · waiting for a submission`);
    setText('editor-path', `Will be saved in ${slot.approach}/`);
    setField('solutionLabel', slot.label, 'Name');
    setField('timeComplexity', slot.timeComplexity ?? '', 'e.g. O(n)');
    setField('spaceComplexity', slot.spaceComplexity ?? '', 'e.g. O(1)');
    setField('notes', slot.notes ?? '');
    setText(
      'editor-hint',
      slots.armedId === slot.id
        ? 'Selected: your next accepted submission for this problem is saved here with these details.'
        : 'Select this solution to save your next accepted submission here.',
    );
    formDirty = false;
    return;
  }
  if (!s) return;

  setText('editor-heading', `${displayLabel(s)} · ${s.language}`);
  setText('editor-path', s.path);
  const path = el('editor-path');
  if (path) path.title = s.path;

  setField('solutionLabel', s.labelSource === 'user' ? (s.label ?? '') : '', `Auto: ${autoLabelFor(s)}`);
  setField(
    'timeComplexity',
    userValue(s.timeComplexity, s.analysis?.timeComplexity),
    s.analysis?.timeComplexity ? `Auto: ${s.analysis.timeComplexity}` : 'e.g. O(n)',
  );
  setField(
    'spaceComplexity',
    userValue(s.spaceComplexity, s.analysis?.spaceComplexity),
    s.analysis?.spaceComplexity ? `Auto: ${s.analysis.spaceComplexity}` : 'e.g. O(1)',
  );
  setField('notes', s.notes ?? '');
  setText(
    'editor-hint',
    'A new name moves this solution to a folder with that name on GitHub. Leave label or complexity empty to use the automatic value.',
  );
  formDirty = false;
}

/* ---------------------------- Selection ---------------------------- */

/**
 * Selecting a slot arms it for the next accepted submission; selecting a
 * saved solution disarms any slot so placement is automatic again.
 */
async function selectItem(key: string): Promise<void> {
  selectedKey = key;
  if (problem) {
    const isSlot = slots.slots.some((s) => s.id === key);
    const armedId = isSlot ? key : undefined;
    if (slots.armedId !== armedId) {
      slots = armedId ? { ...slots, armedId } : { slots: slots.slots };
      await setProblemSlots(problem.number, slots);
    }
  }
  renderSolutions();
  fillEditor();
}

/** Default selection: the armed slot, else the best solution, else the most recent. */
function defaultSelection(): string | null {
  if (slots.armedId && slots.slots.some((s) => s.id === slots.armedId)) return slots.armedId;
  const solutions = entry?.solutions ?? [];
  if (entry?.bestKey && solutions.some((s) => s.key === entry!.bestKey)) return entry.bestKey;
  if (solutions.length > 0) return [...solutions].sort((a, b) => b.syncedAt - a.syncedAt)[0]!.key;
  return slots.slots[0]?.id ?? null;
}

function selectionExists(): boolean {
  return Boolean(selectedSolution() || selectedSlot());
}

function refOf(s: ProblemRef | null | undefined): ProblemRef | null {
  return s ? { number: s.number, title: s.title, titleSlug: s.titleSlug, difficulty: s.difficulty } : null;
}

/** Problem slug of the active tab, read from its URL. */
async function activeTabSlug(): Promise<string | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return /leetcode\.(?:com|cn)\/problems\/([^/?#]+)/.exec(tab?.url ?? '')?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Which problem to show. The background asks the tab's content script; if that
 * fails (tab opened before the extension was reloaded, worker still on an older
 * version) fall back to the tab URL matched against the index, then the last
 * submission.
 */
async function resolveProblem(
  target: ResolveSyncTargetResponse | undefined,
  index: Record<number, SolvedProblem>,
): Promise<{ problem: ProblemRef | null; fromActiveTab: boolean }> {
  const direct = target?.problem ?? refOf(target?.submission);
  const slug = await activeTabSlug();
  if (direct && (target?.fromActiveTab || !slug || direct.titleSlug === slug)) {
    return { problem: direct, fromActiveTab: Boolean(target?.fromActiveTab) || direct.titleSlug === slug };
  }
  if (slug) {
    const known = Object.values(index).find((p) => p.titleSlug === slug);
    if (known) return { problem: refOf(known), fromActiveTab: true };
  }
  const last = refOf(direct ?? (await getLastSubmission()));
  return { problem: last, fromActiveTab: Boolean(last && slug && last.titleSlug === slug) };
}

async function loadSolutions(opts: { preserveForm?: boolean; select?: string } = {}): Promise<void> {
  const [target, index] = await Promise.all([
    chrome.runtime
      .sendMessage({ type: MessageType.ResolveSyncTarget } satisfies RuntimeMessage)
      .then((r) => r as ResolveSyncTargetResponse | undefined)
      .catch(() => undefined),
    getProblemIndex(),
  ]);

  const previous = problem?.number;
  ({ problem, fromActiveTab } = await resolveProblem(target, index));
  if (previous !== problem?.number) {
    selectedKey = null;
    formDirty = false;
  }

  const stored = problem ? index[problem.number] : undefined;
  entry = stored ? normalizeProblemEntry(stored, target?.submission?.language) : undefined;
  slots = problem ? await getProblemSlots(problem.number) : { slots: [] };

  if (opts.select) selectedKey = opts.select;
  if (!selectedKey || !selectionExists()) selectedKey = defaultSelection();

  renderSolutions();
  if (!opts.preserveForm || !formDirty) fillEditor();
  updateTargetBanner();
}

function updateTargetBanner(): void {
  const banner = el('notes-target');
  if (!banner) return;
  if (!problem || fromActiveTab) {
    banner.classList.add('hidden');
    return;
  }
  banner.textContent = `Showing last synced problem #${problem.number}. If a different LeetCode problem is open, refresh that page so the extension can read it.`;
  banner.classList.add('is-warn');
  banner.classList.remove('hidden');
}

async function refresh(): Promise<void> {
  try {
    render(await getPopupState());
    await loadSolutions({ preserveForm: true });
  } catch (err) {
    console.error('[popup] failed to render state', err);
  }
}

/* ----------------------------- Actions ----------------------------- */

function outcomeMessage(result: SyncResult): string {
  if (result.slotLabel) return `Saved to "${result.slotLabel}".`;
  switch (result.outcome) {
    case 'new':
      return 'Saved as a new solution.';
    case 'revision':
      return 'Updated the matching solution (near-identical code).';
    case 'duplicate':
      return 'This exact code is already saved.';
    default:
      return result.lastSynced
        ? `Synced #${result.lastSynced.number} ${result.lastSynced.title}.`
        : 'Sync complete.';
  }
}

function expected(): Pick<ForceSyncMessage, 'expectedNumber' | 'expectedTitleSlug'> {
  return problem ? { expectedNumber: problem.number, expectedTitleSlug: problem.titleSlug } : {};
}

/**
 * Re-sync the open tab's latest accepted submission. If a named solution is
 * selected, the submission is saved into it.
 */
async function forceSync(): Promise<void> {
  const button = el<HTMLButtonElement>('sync-btn');
  if (button) button.disabled = true;
  try {
    const result = (await chrome.runtime.sendMessage({
      type: MessageType.ForceSync,
      mode: 'auto',
      ...expected(),
    } satisfies RuntimeMessage)) as SyncResult | undefined;
    if (!result) {
      toast('No response from background.');
    } else if (result.ok) {
      toast(outcomeMessage(result));
      formDirty = false;
      await loadSolutions(result.solutionKey ? { select: result.solutionKey } : {});
    } else {
      toast(result.error ?? 'Sync failed.');
    }
  } catch {
    toast('Background worker unavailable.');
  } finally {
    if (button) button.disabled = false;
    await refresh();
  }
}

/** Create a named solution slot, selected so the next submission fills it. */
async function addSolution(): Promise<void> {
  if (!problem) {
    toast('Open a LeetCode problem first.');
    return;
  }
  const label = getField('newLabel');
  const error = slotLabelError(label, slots.slots, entry?.solutions ?? []);
  if (error) {
    toast(error);
    return;
  }
  const slot = createSlot(label);
  slots = { slots: [...slots.slots, slot], armedId: slot.id };
  await setProblemSlots(problem.number, slots);

  setField('newLabel', '');
  show('add-panel', false);
  selectedKey = slot.id;
  renderSolutions();
  fillEditor();
  toast(`"${slot.label}" added — submit on LeetCode to save it there.`);
}

async function saveSlotDetails(slot: SolutionSlot): Promise<void> {
  if (!problem) return;
  const label = getField('solutionLabel');
  const error = slotLabelError(label, slots.slots, entry?.solutions ?? [], slot.id);
  if (error) {
    toast(error);
    return;
  }
  const next = editSlot(slot, {
    label,
    timeComplexity: getField('timeComplexity'),
    spaceComplexity: getField('spaceComplexity'),
    notes: getField('notes'),
  });
  slots = { ...slots, slots: slots.slots.map((s) => (s.id === slot.id ? next : s)) };
  await setProblemSlots(problem.number, slots);
  renderSolutions();
  fillEditor();
  toast('Saved — applied when the submission is saved.');
}

async function removeSlot(): Promise<void> {
  const slot = selectedSlot();
  if (!slot || !problem) return;
  slots = withoutSlot(slots, slot.id);
  await setProblemSlots(problem.number, slots);
  selectedKey = defaultSelection();
  renderSolutions();
  fillEditor();
  toast(`Removed "${slot.label}".`);
}

async function saveDetails(): Promise<void> {
  const slot = selectedSlot();
  if (slot) {
    await saveSlotDetails(slot);
    return;
  }
  const s = selectedSolution();
  if (!s || !entry) return;
  const button = el<HTMLButtonElement>('save-solution-btn');
  if (button) button.disabled = true;
  try {
    const result = (await chrome.runtime.sendMessage({
      type: MessageType.UpdateSolution,
      problemNumber: entry.number,
      key: s.key,
      label: getField('solutionLabel'),
      timeComplexity: getField('timeComplexity'),
      spaceComplexity: getField('spaceComplexity'),
      notes: getField('notes'),
      appendNotes: false,
    } satisfies RuntimeMessage)) as SyncResult | undefined;
    if (!result?.ok) {
      toast(result?.error ?? 'Save failed.');
      return;
    }
    toast(result.detail ?? result.error ?? 'Saved.');
    formDirty = false;
    await loadSolutions({ select: s.key });
  } catch {
    toast('Background worker unavailable.');
  } finally {
    if (button) button.disabled = false;
  }
}

function openOptions(): void {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('src/options/index.html'));
  }
}

function wireEvents(): void {
  el('setup-btn')?.addEventListener('click', openOptions);
  el('settings-btn')?.addEventListener('click', openOptions);
  el('sync-btn')?.addEventListener('click', () => void forceSync());
  el('save-solution-btn')?.addEventListener('click', () => void saveDetails());
  el('remove-slot-btn')?.addEventListener('click', () => void removeSlot());

  el('add-btn')?.addEventListener('click', () => {
    const panel = el('add-panel');
    const open = panel?.classList.contains('hidden') ?? false;
    show('add-panel', open);
    if (open) el<HTMLInputElement>('newLabel')?.focus();
  });
  el('add-cancel-btn')?.addEventListener('click', () => show('add-panel', false));
  el('add-confirm-btn')?.addEventListener('click', () => void addSolution());
  el('newLabel')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') {
      e.preventDefault();
      void addSolution();
    }
  });

  for (const id of ['solutionLabel', 'timeComplexity', 'spaceComplexity', 'notes']) {
    el(id)?.addEventListener('input', () => {
      formDirty = true;
    });
  }

  onStorageChanged(() => void refresh());

  chrome.runtime.onMessage.addListener((msg: RuntimeMessage) => {
    if (msg?.type === MessageType.StateUpdated) {
      render(msg.state);
      void loadSolutions({ preserveForm: true });
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  wireEvents();
  void refresh();
});
