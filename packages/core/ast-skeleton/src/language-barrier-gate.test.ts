import test from 'node:test';
import * as assert from 'node:assert';
import { LanguageBarrierGate } from './language-barrier-gate.js';
import { MemoryAdapterResolver } from './memory-adapter-resolver.js';

test('LanguageBarrierGate: resolves typescript ecosystem from extension and blocks godot docs', () => {
  const eco = LanguageBarrierGate.resolveTargetEcosystem('src/service.ts');
  assert.strictEqual(eco, 'typescript');
  assert.strictEqual(LanguageBarrierGate.isAllowedDoc(eco, 'godot4'), false, 'Godot docs must be blocked in TypeScript');
  assert.strictEqual(LanguageBarrierGate.isAllowedDoc(eco, 'typescript'), true);
});

test('LanguageBarrierGate: resolves godot ecosystem from .gd extension and blocks typescript docs', () => {
  const eco = LanguageBarrierGate.resolveTargetEcosystem('scripts/player.gd');
  assert.strictEqual(eco, 'godot');
  assert.strictEqual(LanguageBarrierGate.isAllowedDoc(eco, 'typescript'), false, 'TypeScript docs must be blocked in Godot');
  assert.strictEqual(LanguageBarrierGate.isAllowedDoc(eco, 'godot4'), true);
});

test('LanguageBarrierGate: prevents false positives on node:fs and signal in typescript code', () => {
  const tsCode = "import * as fs from 'node:fs';\nexport function handleSignal() { return true; }";
  const eco = LanguageBarrierGate.resolveTargetEcosystem('src/handler.ts', tsCode);
  assert.strictEqual(eco, 'typescript');
  assert.strictEqual(LanguageBarrierGate.isAllowedDoc(eco, 'godot4'), false);
});

test('MemoryAdapterResolver: strictly isolates ground-truth docs by ecosystem without bleeding', () => {
  const adapters = {
    docProvider: (lib: string, topic: string) => `[${lib}:${topic}] Doc`
  };

  const tsCode = "import * as fs from 'node:fs';\nexport class NodeManager { signal = 1; }";
  const tsDocs = MemoryAdapterResolver.resolveGroundTruth(tsCode, adapters, 'src/manager.ts');
  assert.ok(tsDocs.every(d => !d.includes('godot4')), 'No Godot docs should be injected into TypeScript');
  assert.ok(tsDocs.some(d => d.includes('typescript')), 'TypeScript docs must be injected');

  const gdCode = 'extends CharacterBody2D\nsignal damaged\nfunc _ready(): pass';
  const gdDocs = MemoryAdapterResolver.resolveGroundTruth(gdCode, adapters, 'scripts/enemy.gd');
  assert.ok(gdDocs.every(d => !d.includes('typescript')), 'No TypeScript docs should be injected into Godot');
  assert.ok(gdDocs.some(d => d.includes('godot4')), 'Godot docs must be injected');
});
