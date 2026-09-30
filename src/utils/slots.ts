/**
 * Named solution slots (pure functions, no chrome.* / I/O).
 *
 * The user names a solution in the popup ("Brute Force") before writing it.
 * The slot is shown under the saved solutions; while it is selected (armed),
 * the next accepted submission is saved into `<Problem>/brute-force/` with the
 * slot's label, notes and complexity, and the slot is removed.
 */
import type { ProblemSlots, SolutionApproach, SolutionSlot, Submission } from '@/types';
import { sanitizeApproach } from './approach';

export interface SlotEdit {
  label?: string;
  notes?: string;
  timeComplexity?: string;
  spaceComplexity?: string;
}

/** Why `label` can't be used for a slot, or null when it can. */
export function slotLabelError(
  label: string,
  slots: SolutionSlot[],
  solutions: SolutionApproach[],
  exceptId?: string,
): string | null {
  const name = label.trim();
  if (!name) return 'Enter a name for the solution.';
  const slug = sanitizeApproach(name);
  if (!slug) return 'Use letters or numbers in the name.';
  if (slots.some((s) => s.id !== exceptId && s.approach === slug)) {
    return `"${name}" is already waiting for a submission.`;
  }
  if (solutions.some((s) => s.approach === slug)) {
    return `A solution folder "${slug}" already exists — pick another name.`;
  }
  return null;
}

export function createSlot(label: string, now: number = Date.now()): SolutionSlot {
  const name = label.trim();
  return {
    id: `slot-${now.toString(36)}`,
    label: name,
    approach: sanitizeApproach(name),
    createdAt: now,
  };
}

function clean(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

/** Apply popup edits to a slot; empty strings clear a field. */
export function editSlot(slot: SolutionSlot, edit: SlotEdit): SolutionSlot {
  const next: SolutionSlot = { ...slot };
  if (edit.label !== undefined && edit.label.trim()) {
    next.label = edit.label.trim();
    next.approach = sanitizeApproach(next.label);
  }
  for (const field of ['notes', 'timeComplexity', 'spaceComplexity'] as const) {
    if (edit[field] === undefined) continue;
    const v = clean(edit[field]);
    if (v) next[field] = v;
    else delete next[field];
  }
  return next;
}

export function armedSlot(ps: ProblemSlots | undefined): SolutionSlot | undefined {
  return ps?.armedId ? ps.slots.find((s) => s.id === ps.armedId) : undefined;
}

/**
 * Route a submission into a slot: its folder, label and annotations. Values
 * already on the submission (typed at Force Sync) take precedence.
 */
export function applySlot(submission: Submission, slot: SolutionSlot): Submission {
  return {
    ...submission,
    approach: slot.approach,
    label: slot.label,
    notes: clean(submission.notes) ?? slot.notes,
    timeComplexity: clean(submission.timeComplexity) ?? slot.timeComplexity,
    spaceComplexity: clean(submission.spaceComplexity) ?? slot.spaceComplexity,
  };
}

/** Remove a slot (filled or deleted); disarms it if it was armed. */
export function withoutSlot(ps: ProblemSlots, id: string): ProblemSlots {
  const next: ProblemSlots = { slots: ps.slots.filter((s) => s.id !== id) };
  if (ps.armedId && ps.armedId !== id) next.armedId = ps.armedId;
  return next;
}
