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
  assert.ok(output.includes('aegis gh:status'));
  assert.ok(output.includes('aegis gh:sync'));
  assert.ok(output.includes('aegis gh:comment'));
  assert.ok(output.includes('aegis gh:pr'));
});

test('Aegis CLI executes Iron Cage self-verification on its own source files', () => {
  const output = execSync(`node "${cliPath}" verify "${sourceFile}"`, { encoding: 'utf8' });

  assert.ok(output.includes('Iron Cage: PASSED'));
});
