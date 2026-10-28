/**
 * @file topological-dependency-radar.test.ts
 * Tests for TopologicalDependencyRadar invariant enforcement.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TopologicalDependencyRadar } from './topological-dependency-radar.js';

test('TopologicalDependencyRadar: scans and validates clean monorepo fixture', () => {
  const tmp = path.join(os.tmpdir(), `aegis-topo-test-${Date.now()}`);
  const pkgA = path.join(tmp, 'packages', 'pkg-a');
  const pkgB = path.join(tmp, 'packages', 'pkg-b');
  fs.mkdirSync(path.join(pkgA, 'src'), { recursive: true });
  fs.mkdirSync(path.join(pkgB, 'src'), { recursive: true });

  fs.writeFileSync(path.join(pkgA, 'package.json'), JSON.stringify({ name: '@mock-pkg/pkg-a' }));
  fs.writeFileSync(
    path.join(pkgB, 'package.json'),
    JSON.stringify({ name: '@mock-pkg/pkg-b', dependencies: { '@mock-pkg/pkg-a': '*' } })
  );

  fs.writeFileSync(path.join(pkgA, 'src', 'index.ts'), 'export const val = 42;');
  fs.writeFileSync(path.join(pkgB, 'src', 'index.ts'), "import { val } from '@mock-pkg/pkg-a'; export const b = val;");

  try {
    const radar = new TopologicalDependencyRadar(tmp, '@mock-pkg/');
    const result = radar.scan();
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.violations.length, 0);
    assert.strictEqual(result.totalPackages, 2);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('TopologicalDependencyRadar: flags undeclared internal import as violation', () => {
  const tmp = path.join(os.tmpdir(), `aegis-topo-fail-${Date.now()}`);
  const pkgA = path.join(tmp, 'packages', 'pkg-a');
  const pkgB = path.join(tmp, 'packages', 'pkg-b');
  fs.mkdirSync(path.join(pkgA, 'src'), { recursive: true });
  fs.mkdirSync(path.join(pkgB, 'src'), { recursive: true });

  fs.writeFileSync(path.join(pkgA, 'package.json'), JSON.stringify({ name: '@mock-pkg/pkg-a' }));
  fs.writeFileSync(path.join(pkgB, 'package.json'), JSON.stringify({ name: '@mock-pkg/pkg-b' }));

  fs.writeFileSync(path.join(pkgB, 'src', 'broken.ts'), "import { something } from '@mock-pkg/pkg-a';");

  try {
    const radar = new TopologicalDependencyRadar(tmp, '@mock-pkg/');
    const result = radar.scan();
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.violations.length, 1);
    assert.strictEqual(result.violations[0]?.packageName, '@mock-pkg/pkg-b');
    assert.strictEqual(result.violations[0]?.importedPackage, '@mock-pkg/pkg-a');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('TopologicalDependencyRadar: scans current aegis monorepo and asserts 100% invariant', () => {
  const radar = new TopologicalDependencyRadar();
  const result = radar.scan();
  assert.strictEqual(result.valid, true, `Expected valid monorepo dependencies, got: ${result.errors.join('; ')}`);
  assert.strictEqual(result.violations.length, 0);
  assert.ok(result.totalPackages >= 14);
});
