import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '@/storage/defaults';
import type { Settings, SolutionApproach, Submission } from '@/types';
import { buildFilePath, buildSolutionPath, problemReadmeDir } from '@/utils/path';

const TITLE = 'Two Sum';
const sub = (extra: Partial<Submission> = {}): Submission => ({
  key: '1-python3',
  number: 1,
  title: TITLE,
  titleSlug: 'two-sum',
  difficulty: 'Easy',
  language: 'python3',
  languageExt: 'py',
  code: '',
  submittedAt: 0,
  ...extra,
});
const settings = (extra: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...extra });
const saved = (path: string, approach?: string): SolutionApproach => ({
  key: approach ? `1-python3-${approach}` : '1-python3',
  approach,
  language: 'python3',
  path,
  syncedAt: 0,
});

test('first solution uses the normal layout', () => {
  assert.equal(buildSolutionPath(settings(), sub(), []), 'LeetCode/Easy/1. Two Sum.py');
  assert.equal(
    buildSolutionPath(settings({ perProblemFolder: true }), sub(), []),
    'LeetCode/Easy/Two Sum/1. Two Sum.py',
  );
});

test('an additional solution next to a flat primary goes to Problem/solution-N/', () => {
  const siblings = [saved('LeetCode/Easy/1. Two Sum.py')];
  assert.equal(
    buildSolutionPath(settings(), sub({ approach: 'solution-2' }), siblings),
    'LeetCode/Easy/Two Sum/solution-2/1. Two Sum.py',
  );
  // The flat primary is left where it is.
  assert.equal(problemReadmeDir(siblings, TITLE, false)?.join('/'), 'LeetCode/Easy/Two Sum');
});

test('additional solutions sit beside legacy named approaches', () => {
  const siblings = [saved('LeetCode/Easy/Two Sum/brute-force/1. Two Sum.py', 'brute-force')];
  assert.equal(
    buildSolutionPath(settings(), sub({ approach: 'solution-2' }), siblings),
    'LeetCode/Easy/Two Sum/solution-2/1. Two Sum.py',
  );
  assert.equal(problemReadmeDir(siblings, TITLE, false)?.join('/'), 'LeetCode/Easy/Two Sum');
});

test('per-problem-folder primaries keep their folder', () => {
  const siblings = [saved('LeetCode/Easy/Two Sum/1. Two Sum.py')];
  assert.equal(
    buildSolutionPath(settings({ perProblemFolder: true }), sub({ approach: 'solution-2' }), siblings),
    'LeetCode/Easy/Two Sum/solution-2/1. Two Sum.py',
  );
  // Detected from the folder name even if the setting was turned off later.
  assert.equal(
    buildSolutionPath(settings(), sub({ approach: 'solution-2' }), siblings),
    'LeetCode/Easy/Two Sum/solution-2/1. Two Sum.py',
  );
});

test('existing folders win over changed naming settings', () => {
  const siblings = [saved('Old Root/1. Two Sum.py')];
  assert.equal(
    buildSolutionPath(settings({ rootFolder: 'LeetCode' }), sub({ approach: 'solution-2' }), siblings),
    'Old Root/Two Sum/solution-2/1. Two Sum.py',
  );
});

test("a new language's primary lands beside the existing primary", () => {
  const siblings = [saved('LeetCode/Easy/1. Two Sum.py')];
  assert.equal(
    buildSolutionPath(settings(), sub({ language: 'java', languageExt: 'java' }), siblings),
    'LeetCode/Easy/1. Two Sum.java',
  );
  const named = [saved('LeetCode/Easy/Two Sum/brute-force/1. Two Sum.py', 'brute-force')];
  assert.equal(
    buildSolutionPath(settings(), sub({ language: 'java', languageExt: 'java' }), named),
    'LeetCode/Easy/1. Two Sum.java',
  );
});

test('buildFilePath is unchanged for the default layout', () => {
  assert.equal(buildFilePath(settings(), sub()), 'LeetCode/Easy/1. Two Sum.py');
  assert.equal(
    buildFilePath(settings({ fileNaming: 'padded-snake' }), sub()),
    'LeetCode/Easy/0001_Two_Sum.py',
  );
});
