import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { VersionManager } from './version-manager.js';

test('VersionManager.bumpSemver bumps semver accurately', () => {
  assert.strictEqual(VersionManager.bumpSemver('0.1.0', 'patch'), '0.1.1');
  assert.strictEqual(VersionManager.bumpSemver('0.1.0'), '0.1.1');
  assert.strictEqual(VersionManager.bumpSemver('0.1.0', 'minor'), '0.2.0');
  assert.strictEqual(VersionManager.bumpSemver('0.1.0', 'major'), '1.0.0');
  assert.strictEqual(VersionManager.bumpSemver('v1.2.3', 'patch'), '1.2.4');
  assert.strictEqual(VersionManager.bumpSemver('v1.2.3', 'minor'), '1.3.0');
  assert.strictEqual(VersionManager.bumpSemver('v1.2.3', 'major'), '2.0.0');
  assert.strictEqual(VersionManager.bumpSemver('invalid-string'), '0.1.1');
});

test('VersionManager.compareSemver compares versions correctly', () => {
  assert.ok(VersionManager.compareSemver('0.2.0', '0.1.9') > 0);
  assert.ok(VersionManager.compareSemver('1.0.0', '0.9.9') > 0);
  assert.ok(VersionManager.compareSemver('0.1.1', '0.1.0') > 0);
  assert.strictEqual(VersionManager.compareSemver('0.1.0', '0.1.0'), 0);
  assert.strictEqual(VersionManager.compareSemver('v0.1.0', '0.1.0'), 0);
  assert.ok(VersionManager.compareSemver('0.1.0', '0.2.0') < 0);
  assert.ok(VersionManager.compareSemver('0.0.9', '0.1.0') < 0);
});

test('VersionManager.getLatestTag behaves safely on git and non-git dirs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-tag-test-'));
  try {
    const res = VersionManager.getLatestTag(tmpDir);
    assert.strictEqual(res, null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  const currentRepoTag = VersionManager.getLatestTag(process.cwd());
  assert.ok(currentRepoTag === null || typeof currentRepoTag === 'string');
});

test('VersionManager.checkVersionGrade produces accurate recommendations', () => {
  const grade = VersionManager.checkVersionGrade('0.1.0', process.cwd());
  assert.strictEqual(grade.nextPatch, '0.1.1');
  assert.strictEqual(grade.nextMinor, '0.2.0');
  assert.strictEqual(typeof grade.upgradeAvailable, 'boolean');
  assert.ok(grade.latestTag === null || typeof grade.latestTag === 'string');
});

function setupTestMonorepo(tmpDir: string): { pkgADir: string; pkgBDir: string; ignoredDir: string } {
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'root-monorepo', version: '0.1.0' }, null, 2) + '\n', 'utf8');
  const pkgADir = path.join(tmpDir, 'packages', 'pkg-a');
  fs.mkdirSync(pkgADir, { recursive: true });
  fs.writeFileSync(path.join(pkgADir, 'package.json'), JSON.stringify({ name: '@aegis/pkg-a', version: '0.1.0' }, null, 2) + '\n', 'utf8');
  const pkgBDir = path.join(tmpDir, 'packages', 'core', 'pkg-b');
  fs.mkdirSync(pkgBDir, { recursive: true });
  fs.writeFileSync(path.join(pkgBDir, 'package.json'), JSON.stringify({ name: '@aegis/pkg-b', version: '0.1.0' }, null, 2) + '\n', 'utf8');
  const ignoredDir = path.join(tmpDir, 'packages', 'node_modules', 'ignored-pkg');
  fs.mkdirSync(ignoredDir, { recursive: true });
  fs.writeFileSync(path.join(ignoredDir, 'package.json'), JSON.stringify({ name: 'ignored-pkg', version: '0.1.0' }, null, 2) + '\n', 'utf8');
  return { pkgADir, pkgBDir, ignoredDir };
}

test('VersionManager.syncMonorepoVersions updates all package.json files and preserves format', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-sync-test-'));
  try {
    const { pkgADir, pkgBDir, ignoredDir } = setupTestMonorepo(tmpDir);
    const syncRes = VersionManager.syncMonorepoVersions(tmpDir, '0.2.5');

    assert.strictEqual(syncRes.previousVersion, '0.1.0');
    assert.strictEqual(syncRes.newVersion, '0.2.5');
    assert.ok(syncRes.updatedPackages.includes('root-monorepo'));
    assert.ok(syncRes.updatedPackages.includes('@aegis/pkg-a'));
    assert.ok(syncRes.updatedPackages.includes('@aegis/pkg-b'));
    assert.strictEqual(syncRes.updatedPackages.includes('ignored-pkg'), false);

    const updatedRoot = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8')) as { version: string };
    const updatedA = JSON.parse(fs.readFileSync(path.join(pkgADir, 'package.json'), 'utf8')) as { version: string };
    const updatedB = JSON.parse(fs.readFileSync(path.join(pkgBDir, 'package.json'), 'utf8')) as { version: string };
    const unchangedIgnored = JSON.parse(fs.readFileSync(path.join(ignoredDir, 'package.json'), 'utf8')) as { version: string };

    assert.strictEqual(updatedRoot.version, '0.2.5');
    assert.strictEqual(updatedA.version, '0.2.5');
    assert.strictEqual(updatedB.version, '0.2.5');
    assert.strictEqual(unchangedIgnored.version, '0.1.0');

    const rootRaw = fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8');
    assert.ok(rootRaw.includes('  "version": "0.2.5"'));
    assert.ok(rootRaw.endsWith('\n'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
