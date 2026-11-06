/**
 * @file tr-command-parity.test.ts
 * Verifies 100% universal feature parity between 'tr' and 'tw' command suites.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { test, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { COMMAND_MAP } from '../bin/command-registry.js';

let testTmpDir: string;

const PARITY_SUBCOMMANDS = [
  'status', 'plan', 'setup', 'matrix', 'dag', 'analyze',
  'compact', 'clear', 'mesh', 'peers', 'post', 'broadcast',
  'waves', 'conflicts', 'radar', 'scale', 'batch', 'doc',
  'synthesize', 'advance', 'tools', 'push'
] as const;

beforeEach(() => {
  testTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-tr-test-'));
  process.env.AEGIS_WORKSPACE = testTmpDir;
});

afterEach(() => {
  delete process.env.AEGIS_WORKSPACE;
  try {
    fs.rmSync(testTmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

test('COMMAND_MAP contains tr pointing to handleTeamwork router', async () => {
  assert.strictEqual(typeof COMMAND_MAP.tr, 'function');
  await assert.doesNotReject(async () => {
    await COMMAND_MAP.tr(['tr']);
    await COMMAND_MAP.tr(['tr', 'status']);
    await COMMAND_MAP.tr(['tr', 'plan', 'Parity plan routing', '--dry-run']);
  });
});

test('COMMAND_MAP[tr:status] exists and executes without error', async () => {
  assert.strictEqual(typeof COMMAND_MAP['tr:status'], 'function');
  await assert.doesNotReject(async () => {
    await COMMAND_MAP['tr:status'](['tr:status']);
  });
});

test('COMMAND_MAP[tr:plan] exists and executes plan staging', async () => {
  assert.strictEqual(typeof COMMAND_MAP['tr:plan'], 'function');
  await assert.doesNotReject(async () => {
    await COMMAND_MAP['tr:plan'](['tr:plan', 'Test parity plan objective', '--dry-run']);
  });
});

test('essential tr mesh and push subcommands exist and are callable', async () => {
  const essentialCmds = ['tr:waves', 'tr:peers', 'tr:mesh', 'tr:doc', 'tr:tools', 'tr:push'] as const;
  for (const cmd of essentialCmds) {
    assert.strictEqual(typeof COMMAND_MAP[cmd], 'function', `Expected ${cmd} to be a function`);
  }

  await assert.doesNotReject(async () => {
    await COMMAND_MAP['tr:waves'](['tr:waves', 'Test waves objective']);
    await COMMAND_MAP['tr:peers'](['tr:peers', '--compact']);
    await COMMAND_MAP['tr:mesh'](['tr:mesh', '--compact']);
    await COMMAND_MAP['tr:doc'](['tr:doc', '--compact']);
    await COMMAND_MAP['tr:tools'](['tr:tools', 'solver']);
    await COMMAND_MAP['tr:push'](['tr:push', '--dry-run']);
  });
});

test('universal parity: every tw subcommand has an exact tr counterpart', () => {
  assert.strictEqual(typeof COMMAND_MAP.tr, 'function');
  assert.strictEqual(typeof COMMAND_MAP.tw, 'function');

  for (const sub of PARITY_SUBCOMMANDS) {
    const twKey = `tw:${sub}`;
    const trKey = `tr:${sub}`;
    assert.strictEqual(typeof COMMAND_MAP[twKey], 'function', `Missing ${twKey}`);
    assert.strictEqual(typeof COMMAND_MAP[trKey], 'function', `Missing ${trKey}`);
  }
});

test('bidirectional symmetry: tw and tr key sets match identically', () => {
  const allKeys = Object.keys(COMMAND_MAP);
  const twSubs = allKeys.filter(k => k.startsWith('tw:')).map(k => k.slice(3)).sort();
  const trSubs = allKeys.filter(k => k.startsWith('tr:')).map(k => k.slice(3)).sort();

  assert.deepStrictEqual(trSubs, twSubs);
});

test('all remaining tr subcommands execute without exception', async () => {
  await assert.doesNotReject(async () => {
    await COMMAND_MAP['tr:post'](['tr:post', 'Updating mesh from parity test', '--status=working']);
    await COMMAND_MAP['tr:broadcast'](['tr:broadcast', 'Broadcast from parity test']);
    await COMMAND_MAP['tr:radar'](['tr:radar']);
    await COMMAND_MAP['tr:conflicts'](['tr:conflicts']);
    await COMMAND_MAP['tr:scale'](['tr:scale', 'Scale objective', '--max-agents=2']);
    await COMMAND_MAP['tr:batch'](['tr:batch', 'Batch objective']);
    await COMMAND_MAP['tr:setup'](['tr:setup', testTmpDir]);
    await COMMAND_MAP['tr:dag'](['tr:dag', 'DAG objective']);
    await COMMAND_MAP['tr:matrix'](['tr:matrix', 'Matrix objective']);
    await COMMAND_MAP['tr:analyze'](['tr:analyze', 'Analyze objective']);
    await COMMAND_MAP['tr:compact'](['tr:compact', 'Compact objective']);
    await COMMAND_MAP['tr:synthesize'](['tr:synthesize', '--compact']);
    await COMMAND_MAP['tr:advance'](['tr:advance']);
    await COMMAND_MAP['tr:clear'](['tr:clear']);
  });
});
