import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATS } from '@/storage/defaults';
import type { Submission } from '@/types';
import { applySync } from '@/utils/stats';

const sub = (key: string, language = 'python3'): Submission => ({
  key,
  number: 1,
  title: 'Two Sum',
  titleSlug: 'two-sum',
  difficulty: 'Easy',
  language,
  languageExt: 'py',
  code: '',
  submittedAt: 0,
});

test('extra solutions of the same problem+language are not double-counted', () => {
  let stats = applySync(DEFAULT_STATS, sub('1-python3'), undefined, 'h1');
  assert.equal(stats.totalSynced, 1);
  assert.equal(stats.byDifficulty.Easy, 1);

  stats = applySync(stats, sub('1-python3-solution-2'), undefined, 'h2');
  assert.equal(stats.totalSynced, 1);
  assert.deepEqual(stats.syncedKeys, ['1-python3', '1-python3-solution-2']);
  assert.equal(stats.contentHashes['1-python3-solution-2'], 'h2');

  stats = applySync(stats, sub('1-python3'), undefined, 'h3');
  assert.equal(stats.totalSynced, 1);
  assert.equal(stats.contentHashes['1-python3'], 'h3');
});

test('a new language counts once; similar language names do not collide', () => {
  let stats = applySync(DEFAULT_STATS, sub('1-python', 'python'), undefined);
  stats = applySync(stats, sub('1-python3', 'python3'), undefined);
  assert.equal(stats.totalSynced, 2);
});

test('a legacy named approach first counts the pair once', () => {
  let stats = applySync(DEFAULT_STATS, sub('1-python3-brute-force'), undefined);
  stats = applySync(stats, sub('1-python3'), undefined);
  assert.equal(stats.totalSynced, 1);
});
