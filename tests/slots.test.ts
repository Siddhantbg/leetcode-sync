import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '@/storage/defaults';
import type { SolutionApproach, Submission } from '@/types';
import { analyzeSolution } from '@/utils/analysis';
import { hashString } from '@/utils/hash';
import { buildSolutionPath } from '@/utils/path';
import {
  applySlot,
  armedSlot,
  createSlot,
  editSlot,
  slotLabelError,
  withoutSlot,
} from '@/utils/slots';
import {
  codeHash,
  fingerprint,
  mergeSolutionIntoEntry,
  resolveSolutionTarget,
} from '@/utils/solution';

const CODE = `class Solution:
    def twoSum(self, nums, target):
        for i in range(len(nums)):
            for j in range(i + 1, len(nums)):
                if nums[i] + nums[j] == target:
                    return [i, j]
`;

const sub = (extra: Partial<Submission> = {}): Submission => ({
  key: '1-python3',
  number: 1,
  title: 'Two Sum',
  titleSlug: 'two-sum',
  difficulty: 'Easy',
  language: 'python3',
  languageExt: 'py',
  code: CODE,
  submittedAt: 0,
  ...extra,
});

const primary: SolutionApproach = {
  key: '1-python3',
  language: 'python3',
  path: 'LeetCode/Easy/1. Two Sum.py',
  syncedAt: 1,
  codeHash: codeHash(CODE),
  fingerprint: fingerprint(CODE, 'python3'),
};

test('a slot gets a folder slug from its name', () => {
  const slot = createSlot('  Brute Force ', 1000);
  assert.equal(slot.label, 'Brute Force');
  assert.equal(slot.approach, 'brute-force');
});

test('slot names must be usable and unique', () => {
  const existing = createSlot('Brute Force', 1);
  assert.match(slotLabelError('', [], [])!, /Enter a name/);
  assert.match(slotLabelError('!!!', [], [])!, /letters or numbers/);
  assert.match(slotLabelError('brute force', [existing], [])!, /already waiting/);
  assert.equal(slotLabelError('Brute Force', [existing], [], existing.id), null, 'renaming itself is fine');
  const named = { ...primary, key: '1-python3-optimal', approach: 'optimal' };
  assert.match(slotLabelError('Optimal', [], [named])!, /already exists/);
  assert.equal(slotLabelError('Optimal', [existing], [primary]), null);
});

test('editing a slot renames its folder and clears emptied fields', () => {
  const slot = editSlot(createSlot('Brute', 1), { timeComplexity: 'O(n²)', notes: 'two loops' });
  assert.equal(slot.timeComplexity, 'O(n²)');
  const renamed = editSlot(slot, { label: 'Brute Force', notes: '' });
  assert.equal(renamed.approach, 'brute-force');
  assert.equal(renamed.notes, undefined);
  assert.equal(renamed.timeComplexity, 'O(n²)');
});

test('only the armed slot claims submissions; removing it disarms', () => {
  const a = createSlot('Brute Force', 1);
  const b = createSlot('Optimal', 2);
  assert.equal(armedSlot({ slots: [a, b] }), undefined);
  assert.equal(armedSlot({ slots: [a, b], armedId: b.id })?.id, b.id);
  assert.deepEqual(withoutSlot({ slots: [a, b], armedId: b.id }, b.id), { slots: [a] });
  assert.deepEqual(withoutSlot({ slots: [a, b], armedId: b.id }, a.id), { slots: [b], armedId: b.id });
});

test('submitting with a slot selected saves into <Problem>/<slot>/ with its notes and complexity', () => {
  const slot = editSlot(createSlot('Brute Force', 1), {
    notes: 'Check every pair.',
    timeComplexity: 'O(n^2)',
  });
  const submission = applySlot(sub(), slot);
  assert.equal(submission.approach, 'brute-force');
  assert.equal(submission.label, 'Brute Force');

  // Even though the code is identical to the primary, the explicit slot wins.
  const target = resolveSolutionTarget({
    submission,
    solutions: [primary],
    codeHash: codeHash(CODE),
    rawHash: hashString(CODE),
    legacyHashes: {},
    fingerprint: fingerprint(CODE, 'python3'),
    analysis: analyzeSolution(CODE, 'python3'),
  });
  assert.deepEqual(target, { kind: 'new', key: '1-python3-brute-force', approach: 'brute-force' });

  const path = buildSolutionPath(DEFAULT_SETTINGS, submission, [primary]);
  assert.equal(path, 'LeetCode/Easy/Two Sum/brute-force/1. Two Sum.py');

  const entry = mergeSolutionIntoEntry(
    { number: 1, title: 'Two Sum', titleSlug: 'two-sum', difficulty: 'Easy', languages: ['python3'], url: '', path: primary.path, syncedAt: 1, solutions: [primary] },
    { ...submission, key: target.kind === 'new' ? target.key : '' },
    { key: '1-python3-brute-force', approach: 'brute-force', path, codeHash: codeHash(CODE), fingerprint: fingerprint(CODE, 'python3'), analysis: analyzeSolution(CODE, 'python3') },
    { now: 5 },
  );
  const saved = entry.solutions!.find((s) => s.key === '1-python3-brute-force')!;
  assert.equal(saved.label, 'Brute Force');
  assert.equal(saved.labelSource, 'user');
  assert.equal(saved.notes, 'Check every pair.');
  assert.equal(saved.timeComplexity, 'O(n^2)');
  // The primary is untouched.
  assert.equal(entry.path, primary.path);
  assert.equal(entry.notes, undefined);
});

test('values typed at Force Sync take precedence over the slot', () => {
  const slot = editSlot(createSlot('Optimal', 1), { notes: 'slot notes', spaceComplexity: 'O(n)' });
  const s = applySlot(sub({ notes: 'typed notes' }), slot);
  assert.equal(s.notes, 'typed notes');
  assert.equal(s.spaceComplexity, 'O(n)');
});
