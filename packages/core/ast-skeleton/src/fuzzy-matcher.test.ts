import { test } from 'node:test';
import * as assert from 'node:assert';
import { FuzzyMatcher } from './fuzzy-matcher.js';

test('FuzzyMatcher computes exact and transposed Damerau-Levenshtein distance', () => {
  assert.strictEqual(FuzzyMatcher.damerauLevenshtein('test', 'test'), 0);
  assert.strictEqual(FuzzyMatcher.damerauLevenshtein('teh', 'the'), 1); // transposition
  assert.strictEqual(FuzzyMatcher.damerauLevenshtein('symbol', 'symbl'), 1); // deletion
  assert.strictEqual(FuzzyMatcher.damerauLevenshtein('symbol', 'symbols'), 1); // insertion
  assert.strictEqual(FuzzyMatcher.damerauLevenshtein('symbol', 'simbol'), 1); // substitution
  assert.strictEqual(FuzzyMatcher.damerauLevenshtein('SymbolIndexer', 'symbolidnexer'), 1); // transposition
});

test('FuzzyMatcher calculates similarity score between 0 and 1', () => {
  assert.strictEqual(FuzzyMatcher.similarity('hello', 'hello'), 1.0);
  assert.strictEqual(FuzzyMatcher.similarity('hello', 'helo'), 0.8);
  assert.strictEqual(FuzzyMatcher.similarity('', ''), 1.0);
});

test('FuzzyMatcher finds and ranks best candidate matches', () => {
  const candidates = ['SymbolIndexer', 'SymbolParser', 'RelationalGraph', 'TscnParser'];
  const results = FuzzyMatcher.findMatches('SymbolIdnexer', candidates, c => c, 2);

  assert.strictEqual(results.length >= 1, true);
  assert.strictEqual(results[0].item, 'SymbolIndexer');
  assert.strictEqual(results[0].distance, 1);
});

test('FuzzyMatcher suggests top candidate for typos', () => {
  const commands = ['status', 'skeleton', 'mutate', 'trace', 'graph:scan'];
  const suggestion = FuzzyMatcher.suggest('stauts', commands, 2);
  assert.strictEqual(suggestion, 'status');

  const none = FuzzyMatcher.suggest('completelyunrelatedcommand', commands, 2);
  assert.strictEqual(none, null);
});
