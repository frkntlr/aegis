/**
 * @file deps-commands.test.ts
 * Tests for deps:drift, deps:sync, --strict exit codes, and COMMAND_MAP arg forwarding.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { afterEach, beforeEach, mock, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { COMMAND_MAP } from '../bin/command-registry.js';
import { handleDepsDrift } from './deps-commands.js';

interface FixtureOptions {
  missingRef?: boolean;
  undeclaredImport?: boolean;
}

let prevExitCode: string | number | null | undefined;

function createDepsFixture(opts: FixtureOptions = {}): { root: string; cacheDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-deps-test-'));
  const cacheDir = path.join(root, '.aegis', 'cache');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', private: true }));
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ name: 'fixture', lockfileVersion: 3 }));

  const sharedDir = path.join(root, 'packages', 'shared');
  fs.mkdirSync(path.join(sharedDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(sharedDir, 'package.json'), JSON.stringify({ name: '@aegis/shared' }));
  fs.writeFileSync(path.join(sharedDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { composite: true } }));
  fs.writeFileSync(path.join(sharedDir, 'src', 'index.ts'), 'export const ok = true;\n');

  if (opts.missingRef || opts.undeclaredImport) {
    const appDir = path.join(root, 'packages', 'app');
    fs.mkdirSync(path.join(appDir, 'src'), { recursive: true });
    const deps = opts.undeclaredImport ? {} : { '@aegis/shared': '*' };
    fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: '@aegis/app', dependencies: deps }));
    const refs = opts.missingRef ? [] : [{ path: '../shared' }];
    fs.writeFileSync(
      path.join(appDir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { composite: true }, references: refs })
    );
    fs.writeFileSync(path.join(appDir, 'src', 'index.ts'), "import { ok } from '@aegis/shared';\nexport { ok };\n");
  }
  return { root, cacheDir };
}

beforeEach(() => {
  prevExitCode = process.exitCode;
  process.exitCode = undefined;
  mock.method(console, 'log', () => undefined);
  mock.method(console, 'warn', () => undefined);
  mock.method(console, 'error', () => undefined);
});

afterEach(() => {
  mock.restoreAll();
  process.exitCode = prevExitCode;
});

test('default deps:drift exits 0 on un-synced manifest drift while --strict exits 1', async () => {
  const { root, cacheDir } = createDepsFixture();
  try {
    await handleDepsDrift([], { projectRoot: root, cacheDir });
    assert.equal(process.exitCode, undefined);

    await handleDepsDrift(['--strict'], { projectRoot: root, cacheDir });
    assert.equal(process.exitCode, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('deps:drift --sync --strict creates cache ledgers, passes, and detects post-sync drift', async () => {
  const { root, cacheDir } = createDepsFixture();
  try {
    await handleDepsDrift(['--sync', '--strict'], { projectRoot: root, cacheDir });
    assert.equal(process.exitCode, undefined);
    assert.ok(fs.existsSync(path.join(cacheDir, 'metadata.lock')));
    assert.ok(fs.existsSync(path.join(cacheDir, 'context7', 'lockfiles.hash')));

    await handleDepsDrift(['--strict'], { projectRoot: root, cacheDir });
    assert.equal(process.exitCode, undefined);

    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ name: 'fixture', lockfileVersion: 3, bump: 1 }));
    await handleDepsDrift([], { projectRoot: root, cacheDir });
    assert.equal(process.exitCode, undefined);

    await handleDepsDrift(['--strict'], { projectRoot: root, cacheDir });
    assert.equal(process.exitCode, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('deps:drift exits 1 on structural project-reference or topological violations without --strict', async () => {
  const refFixture = createDepsFixture({ missingRef: true });
  try {
    await handleDepsDrift([], { projectRoot: refFixture.root, cacheDir: refFixture.cacheDir });
    assert.equal(process.exitCode, 1);
  } finally {
    fs.rmSync(refFixture.root, { recursive: true, force: true });
  }

  process.exitCode = undefined;
  const topoFixture = createDepsFixture({ undeclaredImport: true });
  try {
    await handleDepsDrift([], { projectRoot: topoFixture.root, cacheDir: topoFixture.cacheDir });
    assert.equal(process.exitCode, 1);
  } finally {
    fs.rmSync(topoFixture.root, { recursive: true, force: true });
  }
});

test('COMMAND_MAP[deps:drift] and COMMAND_MAP[deps:sync] forward --strict and --sync flags', async () => {
  const { root } = createDepsFixture();
  const prevCwd = process.cwd();
  try {
    process.chdir(root);
    await COMMAND_MAP['deps:drift'](['deps:drift', '--strict']);
    assert.equal(process.exitCode, 1);

    process.exitCode = undefined;
    await COMMAND_MAP['deps:sync'](['deps:sync', '--strict']);
    assert.equal(process.exitCode, undefined);
    assert.ok(fs.existsSync(path.join(root, '.aegis', 'cache', 'metadata.lock')));
    assert.ok(fs.existsSync(path.join(root, '.aegis', 'cache', 'context7', 'lockfiles.hash')));

    await COMMAND_MAP['deps:drift'](['deps:drift', '--strict']);
    assert.equal(process.exitCode, undefined);
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
