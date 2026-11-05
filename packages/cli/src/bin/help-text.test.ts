import { test } from 'node:test';
import * as assert from 'node:assert';
import {
  HELP_LINES,
  HELP_CATEGORIES,
  filterHelpLines,
  showHelp
} from './help-text.js';

test('HELP_CATEGORIES contains all core domains', () => {
  const keys = Object.keys(HELP_CATEGORIES);
  assert.ok(keys.some(k => k.includes('Teamwork')));
  assert.ok(keys.some(k => k.includes('Tasks')));
  assert.ok(keys.some(k => k.includes('Quality')));
  assert.ok(keys.some(k => k.includes('Godot')));
  assert.ok(keys.some(k => k.includes('Memory')));
  assert.ok(keys.some(k => k.includes('GitHub')));
});

test('filterHelpLines matches commands and descriptions correctly', () => {
  const twMatches = filterHelpLines('tw');
  assert.ok(twMatches.length >= 5);
  assert.ok(twMatches.some(l => l.includes('tw:plan')));
  assert.ok(twMatches.some(l => l.includes('tw:status')));

  const taskMatches = filterHelpLines('task:claim');
  assert.strictEqual(taskMatches.length, 1);
  assert.ok(taskMatches[0].includes('task:claim <id> [agent]'));

  const empty = filterHelpLines('completely_unknown_token_xyz');
  assert.strictEqual(empty.length, 0);

  const all = filterHelpLines('');
  assert.strictEqual(all.length, HELP_LINES.length);
});

test('showHelp runs cleanly with and without filter', () => {
  assert.doesNotThrow(() => showHelp());
  assert.doesNotThrow(() => showHelp('tw'));
  assert.doesNotThrow(() => showHelp('unknown'));
});
