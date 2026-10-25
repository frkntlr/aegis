import { test } from 'node:test';
import * as assert from 'node:assert';
import { generateLanguageConstitution, extractMemoryContext } from './prompt-command.js';
import { CodebaseMemoryEngine } from '@aegis/ast-skeleton';

test('generateLanguageConstitution generates Godot-specific constitution for GDScript files', () => {
  const constitution = generateLanguageConstitution(['scripts/player.gd', 'scenes/arena.tscn']);
  assert.ok(constitution.includes('Demir Kafes Constitution:'));
  assert.ok(constitution.includes('Godot 4 Clean Component Architecture:'));
  assert.ok(constitution.includes('Strictly typed GDScript'));
  assert.strictEqual(constitution.includes('TypeScript Clean Domain Architecture:'), false);
});

test('generateLanguageConstitution generates TypeScript-specific constitution for TS files', () => {
  const constitution = generateLanguageConstitution(['packages/core/index.ts', 'src/app.tsx']);
  assert.ok(constitution.includes('Demir Kafes Constitution:'));
  assert.ok(constitution.includes('TypeScript Clean Domain Architecture:'));
  assert.ok(constitution.includes("Zero 'any' types"));
  assert.strictEqual(constitution.includes('Godot 4 Clean Component Architecture:'), false);
});

test('generateLanguageConstitution generates hybrid constitution for polyglot target files', () => {
  const constitution = generateLanguageConstitution(['scripts/player.gd', 'src/bridge.ts']);
  assert.ok(constitution.includes('Demir Kafes Constitution:'));
  assert.ok(constitution.includes('Godot 4 Clean Component Architecture:'));
  assert.ok(constitution.includes('TypeScript Clean Domain Architecture:'));
});

test('generateLanguageConstitution generates base constitution for non-code files', () => {
  const constitution = generateLanguageConstitution(['README.md', 'package.json']);
  assert.ok(constitution.includes('Demir Kafes Constitution:'));
  assert.strictEqual(constitution.includes('Godot 4 Clean Component Architecture:'), false);
  assert.strictEqual(constitution.includes('TypeScript Clean Domain Architecture:'), false);
});

test('extractMemoryContext extracts relational memory for target files', () => {
  const engine = new CodebaseMemoryEngine({ persistToDisk: false });
  engine.indexFile('src/hero.ts', 'export class Hero {}', 'test-wt');

  const ctxFound = extractMemoryContext(['src/hero.ts'], 'test-wt', engine);
  assert.ok(ctxFound.includes('### 🧠 Codebase Memory & Relational Impact'));
  assert.ok(ctxFound.includes('hero'));

  const ctxNotFound = extractMemoryContext(['unknown.ts'], 'test-wt', engine);
  assert.ok(ctxNotFound.includes('No high-risk relational dependencies detected'));
});
