/**
 * @file project-references-radar.test.ts
 * Unit tests for ProjectReferencesRadar.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProjectReferencesRadar } from './project-references-radar.js';

function setupValidMock(tempDir: string): void {
  const pkgA = path.join(tempDir, 'packages', 'pkg-a');
  const pkgB = path.join(tempDir, 'packages', 'pkg-b');
  fs.mkdirSync(pkgA, { recursive: true });
  fs.mkdirSync(pkgB, { recursive: true });

  fs.writeFileSync(path.join(pkgA, 'package.json'), JSON.stringify({ name: '@aegis/pkg-a' }));
  fs.writeFileSync(path.join(pkgA, 'tsconfig.json'), JSON.stringify({ compilerOptions: { composite: true } }));

  fs.writeFileSync(
    path.join(pkgB, 'package.json'),
    JSON.stringify({ name: '@aegis/pkg-b', dependencies: { '@aegis/pkg-a': 'workspace:*' } })
  );
  fs.writeFileSync(
    path.join(pkgB, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { composite: true }, references: [{ path: '../pkg-a' }] })
  );
}

function setupInvalidMock(tempDir: string): void {
  const pkgA = path.join(tempDir, 'packages', 'pkg-a');
  const pkgB = path.join(tempDir, 'packages', 'pkg-b');
  fs.mkdirSync(pkgA, { recursive: true });
  fs.mkdirSync(pkgB, { recursive: true });

  fs.writeFileSync(path.join(pkgA, 'package.json'), JSON.stringify({ name: '@aegis/pkg-a' }));
  fs.writeFileSync(path.join(pkgA, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }));

  fs.writeFileSync(
    path.join(pkgB, 'package.json'),
    JSON.stringify({ name: '@aegis/pkg-b', dependencies: { '@aegis/pkg-a': 'workspace:*' } })
  );
  fs.writeFileSync(
    path.join(pkgB, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { composite: true }, references: [] })
  );
}

test('ProjectReferencesRadar: scans a correctly configured monorepo mock without errors', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-proj-ref-test-'));
  try {
    setupValidMock(tempDir);
    const radar = new ProjectReferencesRadar(tempDir);
    const report = radar.scan();

    assert.strictEqual(report.valid, true);
    assert.strictEqual(report.totalPackages, 2);
    assert.strictEqual(report.syncedPackages, 2);
    assert.strictEqual(report.errors.length, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('ProjectReferencesRadar: detects missing composite and missing references', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-proj-ref-test-'));
  try {
    setupInvalidMock(tempDir);
    const radar = new ProjectReferencesRadar(tempDir);
    const report = radar.scan();

    assert.strictEqual(report.valid, false);
    assert.ok(report.errors.length >= 2);
    assert.strictEqual(report.syncedPackages, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('ProjectReferencesRadar: scans the active workspace correctly', () => {
  const radar = new ProjectReferencesRadar();
  const report = radar.scan();
  assert.ok(report.totalPackages >= 10);
  assert.strictEqual(report.valid, true);
});
