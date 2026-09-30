import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, DEFAULT_STATS } from '@/storage/defaults';
import type { SolvedProblem } from '@/types';
import { buildApproachReadme, buildProblemReadme, buildReadme, linkFrom } from '@/utils/readme';

const DIR = ['LeetCode', 'Easy', 'Replace Elements'];

const problem: SolvedProblem = {
  number: 1299,
  title: 'Replace Elements',
  titleSlug: 'replace-elements',
  difficulty: 'Easy',
  languages: ['java'],
  url: 'https://leetcode.com/problems/replace-elements/',
  path: 'LeetCode/Easy/1299. Replace Elements.java',
  syncedAt: 0,
  bestKey: '1299-java-solution-2',
  solutions: [
    {
      key: '1299-java',
      language: 'java',
      path: 'LeetCode/Easy/1299. Replace Elements.java',
      syncedAt: 0,
      timeComplexity: 'O(n²)',
      spaceComplexity: 'O(1)',
      label: 'Brute Force',
      labelSource: 'auto',
      analysis: { version: 1, timeComplexity: 'O(n²)', spaceComplexity: 'O(1)', pattern: 'Nested loops' },
    },
    {
      key: '1299-java-solution-2',
      approach: 'solution-2',
      language: 'java',
      path: 'LeetCode/Easy/Replace Elements/solution-2/1299. Replace Elements.java',
      syncedAt: 0,
      timeComplexity: 'O(n)',
      spaceComplexity: 'O(1)',
      label: 'Optimal',
      labelSource: 'auto',
      analysis: { version: 1, timeComplexity: 'O(n)', spaceComplexity: 'O(1)', pattern: 'Reverse traversal' },
    },
  ],
};

test('linkFrom builds relative, encoded links', () => {
  assert.equal(
    linkFrom(DIR, 'LeetCode/Easy/Replace Elements/solution-2/1299. Replace Elements.java'),
    'solution-2/1299.%20Replace%20Elements.java',
  );
  assert.equal(linkFrom(DIR, 'LeetCode/Easy/1299. Replace Elements.java'), '../1299.%20Replace%20Elements.java');
  assert.equal(linkFrom([], 'a b/c#.py'), 'a%20b/c%23.py');
});

test('problem index README lists the best solution first with complexity and links', () => {
  const md = buildProblemReadme(problem, DIR);
  assert.match(md, /## ⭐ Best/);
  assert.match(md, /\*\*Optimal\*\* \(java\) — O\(n\) time · O\(1\) space/);
  assert.ok(md.indexOf('### ⭐ Optimal') < md.indexOf('### Brute Force'));
  assert.match(md, /Pattern:\*\* Reverse traversal/);
  assert.match(md, /\(\.\.\/1299\.%20Replace%20Elements\.java\)/);
  assert.match(md, /\[README\]\(solution-2\/README\.md\)/);
  assert.match(md, /auto-detected/);
});

test('approach README marks auto-detected complexity and the solution label', () => {
  const md = buildApproachReadme(problem, problem.solutions![1]!);
  assert.match(md, /Solution:\*\* ⭐ Optimal/);
  assert.match(md, /Time complexity:\*\* O\(n\) _\(auto-detected\)_/);
});

test('user-entered complexity is not marked auto-detected', () => {
  const s = { ...problem.solutions![1]!, timeComplexity: 'O(n) one pass' };
  const md = buildApproachReadme(problem, s);
  assert.match(md, /Time complexity:\*\* O\(n\) one pass\n/);
});

test('progress README links the best solution and shows the solution count', () => {
  const md = buildReadme(DEFAULT_SETTINGS, DEFAULT_STATS, { 1299: problem });
  assert.match(md, /\(Easy\/Replace%20Elements\/solution-2\/1299\.%20Replace%20Elements\.java\) \(2 solutions\)/);
});

test('a lone solution in a named subfolder gets a problem README linking into it', () => {
  const lone: SolvedProblem = { ...problem, solutions: [problem.solutions![1]!] };
  const md = buildProblemReadme(lone, DIR);
  assert.match(md, /\(solution-2\/1299\.%20Replace%20Elements\.java\)/);
  const own = buildProblemReadme(lone, [...DIR, 'solution-2']);
  assert.match(own, /\[`1299\. Replace Elements\.java`\]\(1299\.%20Replace%20Elements\.java\)/);
});

test('a legacy single-solution entry keeps the classic README', () => {
  const legacy: SolvedProblem = { ...problem, solutions: undefined, bestKey: undefined, timeComplexity: 'O(n)' };
  const md = buildProblemReadme(legacy);
  assert.match(md, /Time complexity:\*\* O\(n\)/);
  assert.doesNotMatch(md, /## Solutions/);
});
