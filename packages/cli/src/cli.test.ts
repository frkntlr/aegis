import { test } from 'node:test';
import * as assert from 'node:assert';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliPath = path.resolve(__dirname, 'bin/aegis.js');
const sourceFile = path.resolve(__dirname, '../src/bin/aegis.ts');

test('Aegis CLI displays help menu with all core and live commands', () => {
  const output = execSync(`node "${cliPath}" help`, { encoding: 'utf8' });

  assert.ok(output.includes('AEGIS - Autonomous Vibe Coding Engine'));
  assert.ok(output.includes('aegis init'));
  assert.ok(output.includes('aegis status'));
  assert.ok(output.includes('aegis auto'));
  assert.ok(output.includes('aegis prompt'));
  assert.ok(output.includes('aegis contribute'));
  assert.ok(output.includes('aegis rfc:triage'));
  assert.ok(output.includes('aegis merge'));
  assert.ok(output.includes('aegis gh:status'));
  assert.ok(output.includes('aegis gh:sync'));
});

test('Aegis CLI compiles surgical prompt context for agents', () => {
  const output = execSync(`node "${cliPath}" prompt alice 101 --json`, { encoding: 'utf8' });
  const parsed = JSON.parse(output);

  assert.strictEqual(parsed.agentName, 'alice');
  assert.strictEqual(parsed.issue.number, 101);
  assert.ok(parsed.context.cacheRatioPercent > 0);
  assert.ok(parsed.promptMarkdown.includes('Demir Kafes Constitution'));
  assert.ok(parsed.promptMarkdown.includes('SURGICAL CONTEXT (AST SKELETON MAP)'));
});

test('Aegis CLI executes rfc:triage command and formats issue preview', () => {
  const output = execSync(`node "${cliPath}" rfc:triage "RFC: Add Go AST Extractor" "Go language support"`, { encoding: 'utf8' });

  assert.ok(output.includes('RFC Discussion Triaged'));
  assert.ok(output.includes('LANGUAGE'));
  assert.ok(output.includes('Go'));
  assert.ok(output.includes('packages/core/ast-skeleton/src/go-extractor.ts'));
});

test('Aegis CLI executes Iron Cage self-verification on its own source files', () => {
  const output = execSync(`node "${cliPath}" verify "${sourceFile}"`, { encoding: 'utf8' });

  assert.ok(output.includes('Iron Cage: PASSED'));
});
