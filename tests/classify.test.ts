import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SolutionApproach } from '@/types';
import {
  classifySolutions,
  complexityRank,
  displayLabel,
  isAutoSlug,
  prettifyApproach,
} from '@/utils/classify';

let clock = 1_000;
function sol(partial: Partial<SolutionApproach> & { key: string }): SolutionApproach {
  clock += 1_000;
  return {
    language: 'java',
    path: `LeetCode/Easy/${partial.key}.java`,
    syncedAt: clock,
    createdAt: clock,
    labelSource: 'auto',
    ...partial,
  };
}

function labels(solutions: SolutionApproach[]): Record<string, string | undefined> {
  return Object.fromEntries(solutions.map((s) => [s.key, s.label]));
}

test('complexityRank orders common classes and rejects ambiguous ones', () => {
  const order = ['O(1)', 'O(log n)', 'O(√n)', 'O(n)', 'O(n log n)', 'O(n²)', 'O(n³)', 'O(2^n)', 'O(n!)'];
  const ranks = order.map((c) => complexityRank(c));
  for (const r of ranks) assert.notEqual(r, null);
  for (let i = 1; i < ranks.length; i++) assert.ok(ranks[i]! > ranks[i - 1]!, `${order[i]} > ${order[i - 1]}`);

  assert.equal(complexityRank('O(m·n)'), complexityRank('O(n^2)'));
  assert.equal(complexityRank('O(n + m)'), complexityRank('O(n)'));
  assert.equal(complexityRank('o(N)'), complexityRank('O(n)'));
  assert.equal(complexityRank('O(nlogn)'), complexityRank('O(n log n)'));
  assert.equal(complexityRank('O(n log k)'), null);
  assert.equal(complexityRank('O(n·k)'), null);
  assert.equal(complexityRank(''), null);
  assert.equal(complexityRank(undefined), null);
});

test('display helpers', () => {
  assert.equal(prettifyApproach('brute-force'), 'Brute Force');
  assert.equal(isAutoSlug('solution-3'), true);
  assert.equal(isAutoSlug('brute-force'), false);
  assert.equal(displayLabel(sol({ key: 'a' })), 'Primary');
  assert.equal(displayLabel(sol({ key: 'b', approach: 'solution-2' })), 'Solution 2');
  assert.equal(displayLabel(sol({ key: 'c', approach: 'two-pointers' })), 'Two Pointers');
  assert.equal(displayLabel(sol({ key: 'd', label: 'Optimal' })), 'Optimal');
});

test('a single solution is the primary and the best', () => {
  const { solutions, bestKey } = classifySolutions([sol({ key: '1-java' })]);
  assert.equal(solutions[0]!.label, 'Primary');
  assert.equal(bestKey, '1-java');
});

test('Replace Elements: O(n²) then O(n) → Brute Force / Optimal', () => {
  const { solutions, bestKey } = classifySolutions([
    sol({ key: '1299-java', timeComplexity: 'O(n²)', spaceComplexity: 'O(1)' }),
    sol({ key: '1299-java-solution-2', approach: 'solution-2', timeComplexity: 'O(n)', spaceComplexity: 'O(1)' }),
  ]);
  assert.deepEqual(labels(solutions), {
    '1299-java': 'Brute Force',
    '1299-java-solution-2': 'Optimal',
  });
  assert.equal(bestKey, '1299-java-solution-2');
});

test('three distinct complexities → Brute Force / Better / Optimal', () => {
  const { solutions, bestKey } = classifySolutions([
    sol({ key: 'a', timeComplexity: 'O(n²)' }),
    sol({ key: 'b', approach: 'solution-2', timeComplexity: 'O(n log n)' }),
    sol({ key: 'c', approach: 'solution-3', timeComplexity: 'O(n)' }),
  ]);
  assert.deepEqual(labels(solutions), { a: 'Brute Force', b: 'Better', c: 'Optimal' });
  assert.equal(bestKey, 'c');
});

test('the worst is not "Brute Force" unless it is quadratic or worse', () => {
  const { solutions } = classifySolutions([
    sol({ key: 'a', timeComplexity: 'O(n log n)' }),
    sol({ key: 'b', approach: 'solution-2', timeComplexity: 'O(n)' }),
  ]);
  assert.deepEqual(labels(solutions), { a: 'Better', b: 'Optimal' });
});

test('any unknown time complexity → no ranking, neutral labels, no best', () => {
  const { solutions, bestKey } = classifySolutions([
    sol({ key: 'a', timeComplexity: 'O(n²)' }),
    sol({ key: 'b', approach: 'solution-2' }),
  ]);
  assert.deepEqual(labels(solutions), { a: 'Primary', b: 'Solution 2' });
  assert.equal(bestKey, undefined);
});

test('equal time, different space → least space is Optimal', () => {
  const { solutions, bestKey } = classifySolutions([
    sol({ key: 'a', timeComplexity: 'O(n)', spaceComplexity: 'O(n)' }),
    sol({ key: 'b', approach: 'solution-2', timeComplexity: 'O(n)', spaceComplexity: 'O(1)' }),
  ]);
  assert.deepEqual(labels(solutions), { a: 'Alternative', b: 'Optimal' });
  assert.equal(bestKey, 'b');
});

test('identical complexity everywhere → no Optimal claim', () => {
  const { solutions } = classifySolutions([
    sol({ key: 'a', timeComplexity: 'O(n)', spaceComplexity: 'O(1)' }),
    sol({ key: 'b', approach: 'solution-2', timeComplexity: 'O(n)', spaceComplexity: 'O(1)' }),
  ]);
  assert.deepEqual(labels(solutions), { a: 'Primary', b: 'Solution 2' });
});

test('recursive vs iterative is used when that is the only visible difference', () => {
  const { solutions } = classifySolutions([
    sol({ key: 'a', analysis: { version: 1, style: 'recursive' } }),
    sol({ key: 'b', approach: 'solution-2', analysis: { version: 1, style: 'iterative' } }),
  ]);
  assert.deepEqual(labels(solutions), { a: 'Recursive', b: 'Iterative' });
});

test('runtime never outranks asymptotic complexity', () => {
  const { bestKey } = classifySolutions([
    sol({ key: 'fast-quadratic', timeComplexity: 'O(n²)', runtime: '1 ms' }),
    sol({ key: 'slow-linear', approach: 'solution-2', timeComplexity: 'O(n)', runtime: '9 ms' }),
  ]);
  assert.equal(bestKey, 'slow-linear');
});

test('runtime breaks ties between equal complexities in the same language', () => {
  const { bestKey, solutions } = classifySolutions([
    sol({ key: 'a', timeComplexity: 'O(n)', runtime: '9 ms' }),
    sol({ key: 'b', approach: 'solution-2', timeComplexity: 'O(n)', runtime: '2 ms' }),
    sol({ key: 'c', approach: 'solution-3', timeComplexity: 'O(n²)' }),
  ]);
  assert.equal(bestKey, 'b');
  assert.deepEqual(labels(solutions), { a: 'Alternative', b: 'Optimal', c: 'Brute Force' });
});

test('each language gets its own Optimal', () => {
  const { solutions } = classifySolutions([
    sol({ key: '1-java', timeComplexity: 'O(n)' }),
    sol({ key: '1-python3', language: 'python3', timeComplexity: 'O(n)' }),
    sol({ key: '1-python3-solution-2', language: 'python3', approach: 'solution-2', timeComplexity: 'O(n²)' }),
  ]);
  assert.deepEqual(labels(solutions), {
    '1-java': 'Optimal',
    '1-python3': 'Optimal',
    '1-python3-solution-2': 'Brute Force',
  });
});

test('user labels are never overwritten', () => {
  const { solutions } = classifySolutions([
    sol({ key: 'a', timeComplexity: 'O(n²)', label: 'My first try', labelSource: 'user' }),
    sol({ key: 'b', approach: 'solution-2', timeComplexity: 'O(n)' }),
  ]);
  assert.deepEqual(labels(solutions), { a: 'My first try', b: 'Optimal' });
});

test('a user "Optimal" label marks the best when complexity is unknown', () => {
  const { bestKey } = classifySolutions([
    sol({ key: 'a' }),
    sol({ key: 'b', approach: 'optimal', labelSource: 'user' }),
  ]);
  assert.equal(bestKey, 'b');
});
