import { test } from 'node:test';
import * as assert from 'node:assert';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilePrompt, handlePrompt } from './commands/prompt-command.js';
import { handleRfcTriage } from './commands/contribute-command.js';
import { handleVerify } from './commands/dev-commands.js';

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

test('Aegis CLI compiles surgical prompt context for agents', async () => {
  const result = await compilePrompt('solver', 101);

  assert.strictEqual(result.agentName, 'solver');
  assert.strictEqual(result.issue.number, 101);
  assert.ok(result.context.cacheRatioPercent > 0);
  assert.ok(result.promptMarkdown.includes('Demir Kafes Constitution'));
  assert.ok(result.promptMarkdown.includes('SURGICAL CONTEXT (AST SKELETON MAP)'));
});

test('Aegis CLI auto-classifies agent role when role parameter is omitted', async () => {
  let output = '';
  const origLog = console.log;
  console.log = (...args: unknown[]) => { output += args.join(' ') + '\n'; };

  try {
    await handlePrompt('101', '--json');
    const parsed = JSON.parse(output);
    assert.ok(['solver', 'qa', 'docs'].includes(parsed.agentName));
    assert.strictEqual(parsed.issue.number, 101);
  } finally {
    console.log = origLog;
  }
});

test('Aegis CLI executes rfc:triage command and formats issue preview', async () => {
  let output = '';
  const origLog = console.log;
  console.log = (...args: unknown[]) => { output += args.join(' ') + '\n'; };

  try {
    await handleRfcTriage('RFC: Add Go AST Extractor', 'Go language support');
    assert.ok(output.includes('RFC Discussion Triaged'));
    assert.ok(output.includes('LANGUAGE'));
    assert.ok(output.includes('Go'));
    assert.ok(output.includes('packages/core/ast-skeleton/src/go-extractor.ts'));
  } finally {
    console.log = origLog;
  }
});

test('Aegis CLI executes Iron Cage self-verification on its own source files', () => {
  let output = '';
  const origLog = console.log;
  console.log = (...args: unknown[]) => { output += args.join(' ') + '\n'; };

  try {
    handleVerify(sourceFile);
    assert.ok(output.includes('Iron Cage: PASSED'));
  } finally {
    console.log = origLog;
  }
});
