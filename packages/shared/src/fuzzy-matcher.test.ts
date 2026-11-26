import test from 'node:test';
import * as assert from 'node:assert/strict';
import { FuzzyMatcher } from './fuzzy-matcher.js';

test('FuzzyMatcher.damerauLevenshtein computes case-insensitive distance with transpositions', () => {
  assert.equal(FuzzyMatcher.damerauLevenshtein('Aegis', 'aegis'), 0);
  assert.equal(FuzzyMatcher.damerauLevenshtein('', 'abc'), 3);
  assert.equal(FuzzyMatcher.damerauLevenshtein('abc', ''), 3);
  assert.equal(FuzzyMatcher.damerauLevenshtein('ab', 'ba'), 1);
  assert.equal(FuzzyMatcher.damerauLevenshtein('kitten', 'sitting'), 3);
});

test('FuzzyMatcher.similarity returns normalized 0..1 score', () => {
  assert.equal(FuzzyMatcher.similarity('', ''), 1.0);
  assert.equal(FuzzyMatcher.similarity('status', 'status'), 1.0);
  assert.equal(FuzzyMatcher.similarity('status', 'statsu'), 0.83);
  assert.equal(FuzzyMatcher.similarity('a', 'zzzz'), 0);
});

test('FuzzyMatcher.findMatches sorts by distance then score and filters by maxDistance', () => {
  const candidates = [{ name: 'sttus' }, { name: 'stat' }, { name: 'status' }, { name: 'completely-different' }];
  const matches = FuzzyMatcher.findMatches('statu', candidates, (c) => c.name, 2);
  assert.deepEqual(
    matches.map((m) => m.item.name),
    ['status', 'stat', 'sttus']
  );
  assert.equal(matches[0].distance, 1);
});

test('FuzzyMatcher.suggest returns closest candidate or null', () => {
  assert.equal(FuzzyMatcher.suggest('chcek', ['status', 'check', 'audit']), 'check');
  assert.equal(FuzzyMatcher.suggest('zzzzzz', ['status', 'check', 'audit']), null);
});
