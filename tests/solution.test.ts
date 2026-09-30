import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SolutionAnalysis, SolutionApproach, SolvedProblem, Submission } from '@/types';
import { analyzeSolution } from '@/utils/analysis';
import { hashString } from '@/utils/hash';
import {
  REVISION_THRESHOLD,
  applyRename,
  applySolutionEdit,
  codeHash,
  effectiveComplexity,
  fingerprint,
  mergeSolutionIntoEntry,
  nextSolutionSlug,
  normalizeCode,
  normalizeProblemEntry,
  orderForDisplay,
  planRename,
  renameConflict,
  resolveSolutionTarget,
  similarity,
  type SolutionTarget,
} from '@/utils/solution';

const BRUTE = `class Solution {
    public int[] replaceElements(int[] arr) {
        int n = arr.length;
        for (int i = 0; i < n; i++) {
            int best = -1;
            for (int j = i + 1; j < n; j++) {
                best = Math.max(best, arr[j]);
            }
            arr[i] = best;
        }
        return arr;
    }
}`;

const OPTIMAL = `class Solution {
    public int[] replaceElements(int[] arr) {
        int max = -1;
        for (int i = arr.length - 1; i >= 0; i--) {
            int cur = arr[i];
            arr[i] = max;
            max = Math.max(max, cur);
        }
        return arr;
    }
}`;

function submission(code: string, extra: Partial<Submission> = {}): Submission {
  return {
    key: '1299-java',
    number: 1299,
    title: 'Replace Elements with Greatest Element on Right Side',
    titleSlug: 'replace-elements-with-greatest-element-on-right-side',
    difficulty: 'Easy',
    language: 'java',
    languageExt: 'java',
    code,
    submittedAt: 0,
    ...extra,
  };
}

function write(code: string, key: string, path: string, approach?: string) {
  return {
    key,
    approach,
    path,
    codeHash: codeHash(code),
    fingerprint: fingerprint(code, 'java'),
    analysis: analyzeSolution(code, 'java'),
  };
}

function resolve(
  code: string,
  solutions: SolutionApproach[],
  opts: { mode?: 'auto' | 'new'; legacyHashes?: Record<string, string>; sub?: Partial<Submission> } = {},
): SolutionTarget {
  return resolveSolutionTarget({
    submission: submission(code, opts.sub),
    solutions,
    codeHash: codeHash(code),
    rawHash: hashString(code),
    legacyHashes: opts.legacyHashes ?? {},
    fingerprint: fingerprint(code, 'java'),
    analysis: analyzeSolution(code, 'java'),
    mode: opts.mode,
  });
}

function saved(code: string, key: string, approach?: string): SolutionApproach {
  return {
    key,
    approach,
    language: 'java',
    path: `LeetCode/Easy/${key}.java`,
    syncedAt: 1,
    codeHash: codeHash(code),
    fingerprint: fingerprint(code, 'java'),
    analysis: analyzeSolution(code, 'java'),
  };
}

/* ------------------------------ Identity ------------------------------ */

test('whitespace, CRLF and the sync header do not change identity', () => {
  const header = '// 1299. Replace Elements\n// Time: O(n)\n// Space: O(1)\n\n';
  const noisy = `${header}${OPTIMAL.replace(/\n/g, '   \r\n')}\n\n`;
  assert.equal(normalizeCode(noisy), normalizeCode(OPTIMAL));
  assert.equal(codeHash(noisy), codeHash(OPTIMAL));
});

test('fingerprints: identical ≈ 1, comment edits stay above the revision threshold, new approach falls below', () => {
  const a = fingerprint(OPTIMAL, 'java');
  assert.equal(similarity(a, fingerprint(OPTIMAL, 'java')), 1);

  const commented = OPTIMAL.replace('int max = -1;', 'int max = -1; // running max from the right');
  assert.ok(similarity(a, fingerprint(commented, 'java')) >= REVISION_THRESHOLD);

  assert.ok(similarity(a, fingerprint(BRUTE, 'java')) < REVISION_THRESHOLD);
  assert.equal(similarity(undefined, a), 0);
});

/* ----------------------------- Resolution ----------------------------- */

test('first accepted solution becomes the primary', () => {
  assert.deepEqual(resolve(BRUTE, []), { kind: 'new', key: '1299-java' });
});

test('exact same code is a duplicate', () => {
  const primary = saved(BRUTE, '1299-java');
  const t = resolve(`${BRUTE}\n\n`, [primary]);
  assert.equal(t.kind, 'duplicate');
});

test('legacy entries without codeHash dedupe via stats.contentHashes', () => {
  const legacy: SolutionApproach = { key: '1299-java', language: 'java', path: 'x.java', syncedAt: 1 };
  const t = resolve(BRUTE, [legacy], { legacyHashes: { '1299-java': hashString(BRUTE) } });
  assert.equal(t.kind, 'duplicate');
});

test('a different accepted solution becomes solution-2, never overwriting the primary', () => {
  const t = resolve(OPTIMAL, [saved(BRUTE, '1299-java')]);
  assert.deepEqual(t, { kind: 'new', key: '1299-java-solution-2', approach: 'solution-2' });
});

test('a near-identical resubmission updates the existing solution in place', () => {
  const tweaked = OPTIMAL.replace('int cur = arr[i];', 'int cur = arr[i]; // keep');
  const t = resolve(tweaked, [saved(BRUTE, '1299-java'), saved(OPTIMAL, '1299-java-solution-2', 'solution-2')]);
  assert.equal(t.kind, 'revision');
  if (t.kind === 'revision') assert.equal(t.solution.key, '1299-java-solution-2');
});

test('manual "Add solution" (mode new) skips revision merging', () => {
  const tweaked = OPTIMAL.replace('int cur = arr[i];', 'int cur = arr[i]; // keep');
  const t = resolve(tweaked, [saved(OPTIMAL, '1299-java')], { mode: 'new' });
  assert.deepEqual(t, { kind: 'new', key: '1299-java-solution-2', approach: 'solution-2' });
});

test('similar code with a different known complexity is a new solution, not a revision', () => {
  const prior = saved(OPTIMAL, '1299-java');
  const analysis: SolutionAnalysis = { version: 1, timeComplexity: 'O(n²)' };
  const t = resolveSolutionTarget({
    submission: submission(OPTIMAL),
    solutions: [prior],
    codeHash: 'different',
    rawHash: 'different',
    legacyHashes: {},
    fingerprint: prior.fingerprint!,
    analysis,
  });
  assert.equal(t.kind, 'new');
});

test('another language gets its own primary', () => {
  const t = resolve(OPTIMAL, [saved(BRUTE, '1299-java')], { sub: { language: 'python3', languageExt: 'py' } });
  assert.deepEqual(t, { kind: 'new', key: '1299-python3' });
});

test('an explicit legacy approach targets that solution', () => {
  const named = saved(BRUTE, '1299-java-brute-force', 'brute-force');
  assert.equal(resolve(OPTIMAL, [named], { sub: { approach: 'brute-force' } }).kind, 'update');
  assert.equal(resolve(BRUTE, [named], { sub: { approach: 'brute-force' } }).kind, 'duplicate');
});

test('nextSolutionSlug skips slugs already in use', () => {
  const s = (approach?: string) => ({ key: approach ?? 'p', approach, language: 'java', path: '', syncedAt: 0 });
  assert.equal(nextSolutionSlug([s()]), 'solution-2');
  assert.equal(nextSolutionSlug([s(), s('solution-3')]), 'solution-4');
  assert.equal(nextSolutionSlug([s(), s('brute-force')]), 'solution-3');
});

/* ---------------------------- Legacy upgrade ---------------------------- */

const LEGACY_ENTRY: SolvedProblem = {
  number: 1,
  title: 'Two Sum',
  titleSlug: 'two-sum',
  difficulty: 'Easy',
  languages: ['python3'],
  url: 'https://leetcode.com/problems/two-sum/',
  path: 'LeetCode/Easy/1. Two Sum.py',
  syncedAt: 5,
  notes: 'hash map',
  timeComplexity: 'O(n)',
};

test('an index entry without solutions[] gets a synthesized primary', () => {
  const e = normalizeProblemEntry(LEGACY_ENTRY);
  assert.equal(e.solutions?.length, 1);
  const p = e.solutions![0]!;
  assert.equal(p.key, '1-python3');
  assert.equal(p.path, LEGACY_ENTRY.path);
  assert.equal(p.approach, undefined);
  assert.equal(p.notes, 'hash map');
  assert.equal(p.timeComplexity, 'O(n)');
  assert.equal(p.labelSource, 'auto');
  assert.deepEqual(normalizeProblemEntry(e), e, 'idempotent');
});

test('legacy named approaches become user labels; auto slugs stay automatic', () => {
  const e = normalizeProblemEntry({
    ...LEGACY_ENTRY,
    solutions: [
      { key: '1-python3-brute-force', approach: 'brute-force', language: 'python3', path: 'a', syncedAt: 1 },
      { key: '1-python3-solution-2', approach: 'solution-2', language: 'python3', path: 'b', syncedAt: 2 },
    ],
  });
  const [named, auto] = e.solutions!;
  assert.equal(named!.labelSource, 'user');
  assert.equal(named!.label, 'Brute Force');
  assert.equal(named!.id, '1-python3-brute-force');
  assert.equal(auto!.labelSource, 'auto');
});

/* ------------------------------- Merging ------------------------------- */

test('effectiveComplexity: explicit > prior user value > fresh analysis', () => {
  assert.equal(effectiveComplexity('O(1)', 'O(n)', undefined, 'O(n²)', true), 'O(1)');
  assert.equal(effectiveComplexity(undefined, 'O(n)', undefined, 'O(n²)', true), 'O(n)');
  assert.equal(effectiveComplexity(undefined, 'O(n)', 'O(n)', 'O(n²)', true), 'O(n²)');
  assert.equal(effectiveComplexity(undefined, 'O(n)', 'O(n)', undefined, true), undefined);
  assert.equal(effectiveComplexity(undefined, 'O(n)', 'O(n)', undefined, false), 'O(n)');
});

test('full flow: brute force then optimal are saved side by side and classified', () => {
  const first = mergeSolutionIntoEntry(
    undefined,
    submission(BRUTE),
    write(BRUTE, '1299-java', 'LeetCode/Easy/1299. X.java'),
    { now: 10 },
  );
  assert.equal(first.solutions?.length, 1);
  assert.equal(first.solutions![0]!.label, 'Primary');
  assert.equal(first.bestKey, '1299-java');
  assert.equal(first.timeComplexity, 'O(n²)');

  const second = mergeSolutionIntoEntry(
    first,
    submission(OPTIMAL),
    write(OPTIMAL, '1299-java-solution-2', 'LeetCode/Easy/X/solution-2/1299. X.java', 'solution-2'),
    { now: 20 },
  );
  const byKey = Object.fromEntries(second.solutions!.map((s) => [s.key, s]));
  assert.equal(byKey['1299-java']!.label, 'Brute Force');
  assert.equal(byKey['1299-java-solution-2']!.label, 'Optimal');
  assert.equal(second.bestKey, '1299-java-solution-2');
  // Top-level fields stay tied to the primary for older README/index readers.
  assert.equal(second.path, 'LeetCode/Easy/1299. X.java');
  assert.equal(second.timeComplexity, 'O(n²)');
  assert.deepEqual(orderForDisplay(second).map((s) => s.key), ['1299-java-solution-2', '1299-java']);
});

test('a revision keeps identity and creation time, and counts revisions', () => {
  const first = mergeSolutionIntoEntry(undefined, submission(OPTIMAL), write(OPTIMAL, '1299-java', 'p.java'), { now: 10 });
  const id = first.solutions![0]!.id;
  const tweaked = OPTIMAL.replace('int cur = arr[i];', 'int cur = arr[i]; // keep');
  const next = mergeSolutionIntoEntry(first, submission(tweaked), write(tweaked, '1299-java', 'p.java'), { now: 20 });
  const s = next.solutions![0]!;
  assert.equal(s.id, id);
  assert.equal(s.createdAt, 10);
  assert.equal(s.syncedAt, 20);
  assert.equal(s.revisions, 1);
});

test('user-entered complexity survives re-sync; a manual label is recorded as user', () => {
  const first = mergeSolutionIntoEntry(
    undefined,
    submission(OPTIMAL, { timeComplexity: 'O(n) amortized', label: 'Right-to-left scan' }),
    write(OPTIMAL, '1299-java', 'p.java'),
    { now: 10 },
  );
  const next = mergeSolutionIntoEntry(first, submission(OPTIMAL), write(OPTIMAL, '1299-java', 'p.java'), { now: 20 });
  const s = next.solutions![0]!;
  assert.equal(s.timeComplexity, 'O(n) amortized');
  assert.equal(s.label, 'Right-to-left scan');
  assert.equal(s.labelSource, 'user');
});

test('renaming the flat primary moves it into <Problem>/<name>/', () => {
  const entry = mergeSolutionIntoEntry(
    undefined,
    submission(OPTIMAL),
    write(OPTIMAL, '1299-java', 'LeetCode/Easy/1299. Replace Elements.java'),
    { now: 1 },
  );
  const plan = planRename(entry, '1299-java', 'Right to Left', false)!;
  assert.deepEqual(plan, {
    approach: 'right-to-left',
    from: 'LeetCode/Easy/1299. Replace Elements.java',
    to: 'LeetCode/Easy/Replace Elements with Greatest Element on Right Side/right-to-left/1299. Replace Elements.java',
  });

  const moved = applyRename(entry, '1299-java', plan);
  const s = moved.solutions![0]!;
  assert.equal(s.key, '1299-java', 'identity is unchanged');
  assert.equal(s.approach, 'right-to-left');
  assert.equal(moved.path, plan.to);

  // Re-syncing the same solution keeps it in the new folder and primary fields in sync.
  const resynced = mergeSolutionIntoEntry(
    moved,
    submission(OPTIMAL, { notes: 'scan from the right' }),
    write(OPTIMAL, '1299-java', plan.to, 'right-to-left'),
    { now: 2 },
  );
  assert.equal(resynced.path, plan.to);
  assert.equal(resynced.notes, 'scan from the right');
});

test('renaming a named solution moves its folder; same name or unusable name does not', () => {
  const entry: SolvedProblem = {
    ...LEGACY_ENTRY,
    solutions: [
      { key: '1-python3', language: 'python3', path: 'LeetCode/Easy/1. Two Sum.py', syncedAt: 1 },
      { key: '1-python3-solution-2', approach: 'solution-2', language: 'python3', path: 'LeetCode/Easy/Two Sum/solution-2/1. Two Sum.py', syncedAt: 2 },
    ],
  };
  assert.equal(
    planRename(entry, '1-python3-solution-2', 'Hash Map', false)?.to,
    'LeetCode/Easy/Two Sum/hash-map/1. Two Sum.py',
  );
  assert.equal(planRename(entry, '1-python3-solution-2', 'Solution 2', false), null);
  assert.equal(planRename(entry, '1-python3-solution-2', '!!!', false), null);

  const clash = planRename(entry, '1-python3', 'solution 2', false)!;
  assert.match(renameConflict(entry, '1-python3', clash)!, /already exists/);
  const pending = planRename(entry, '1-python3', 'Optimal', false)!;
  assert.match(renameConflict(entry, '1-python3', pending, ['optimal'])!, /already exists/);
  assert.equal(renameConflict(entry, '1-python3', pending), null);
});

test('applySolutionEdit: set, then revert label and complexity to automatic', () => {
  let e = mergeSolutionIntoEntry(undefined, submission(BRUTE), write(BRUTE, '1299-java', 'a.java'), { now: 1 });
  e = mergeSolutionIntoEntry(
    e,
    submission(OPTIMAL),
    write(OPTIMAL, '1299-java-solution-2', 'b.java', 'solution-2'),
    { now: 2 },
  );

  const edited = applySolutionEdit(e, '1299-java', { label: 'Naive', timeComplexity: 'O(n^2)', notes: 'two loops' })!;
  const s = edited.solutions!.find((x) => x.key === '1299-java')!;
  assert.equal(s.label, 'Naive');
  assert.equal(s.labelSource, 'user');
  assert.equal(s.timeComplexity, 'O(n^2)');
  assert.equal(edited.notes, 'two loops', 'primary notes mirror to the top level');

  const reverted = applySolutionEdit(edited, '1299-java', { label: '', timeComplexity: '' })!;
  const r = reverted.solutions!.find((x) => x.key === '1299-java')!;
  assert.equal(r.labelSource, 'auto');
  assert.equal(r.label, 'Brute Force');
  assert.equal(r.timeComplexity, 'O(n²)');

  assert.equal(applySolutionEdit(e, 'missing', { label: 'x' }), null);
});
