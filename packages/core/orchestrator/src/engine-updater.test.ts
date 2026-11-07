import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { EngineUpdater } from './engine-updater.js';

test('EngineUpdater discovers monorepo packages accurately', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-updater-test-'));
  try {
    const pkg1Dir = path.join(tmpDir, 'packages', 'core', 'sample');
    fs.mkdirSync(pkg1Dir, { recursive: true });
    fs.writeFileSync(path.join(pkg1Dir, 'package.json'), JSON.stringify({ name: '@aegis/sample', version: '0.1.2' }), 'utf8');

    const pkgs = EngineUpdater.discoverMonorepoPackages(tmpDir);
    assert.strictEqual(pkgs.length, 1);
    assert.strictEqual(pkgs[0].name, '@aegis/sample');
    assert.strictEqual(pkgs[0].version, '0.1.2');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('EngineUpdater cleans workspace caches and locks', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-clean-test-'));
  try {
    const turboDir = path.join(tmpDir, '.turbo');
    const aegisDir = path.join(tmpDir, '.aegis');
    fs.mkdirSync(turboDir, { recursive: true });
    fs.mkdirSync(aegisDir, { recursive: true });
    fs.writeFileSync(path.join(turboDir, 'cache.bin'), 'fake cache', 'utf8');
    fs.writeFileSync(path.join(aegisDir, 'task-inbox.json'), '[]', 'utf8');

    const res = EngineUpdater.cleanWorkspace(tmpDir);
    assert.ok(res.cachesRemoved.length >= 1);
    assert.strictEqual(fs.existsSync(turboDir), false);
    assert.strictEqual(fs.existsSync(path.join(aegisDir, 'task-inbox.json')), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('EngineUpdater getVersionReport returns complete diagnostics', () => {
  const rep = EngineUpdater.getVersionReport();
  assert.ok(rep.currentVersion);
  assert.ok(rep.localCommit);
  assert.ok(rep.branch);
  assert.ok(['synced', 'behind', 'ahead', 'diverged', 'offline'].includes(rep.driftStatus));
  assert.ok(Array.isArray(rep.monorepoPackages));
  assert.ok(rep.monorepoPackages.length >= 10);
  assert.ok(typeof rep.mcpToolCount === 'number');
  assert.ok(rep.latestTag === null || typeof rep.latestTag === 'string');
  assert.strictEqual(typeof rep.upgradeAvailable, 'boolean');
  assert.ok(rep.nextRecommendedVersion && typeof rep.nextRecommendedVersion === 'string');
});

test('EngineUpdater safeExec handles valid commands and invalid commands gracefully', () => {
  const valid = EngineUpdater.safeExec('node -v', process.cwd());
  assert.ok(valid && valid.startsWith('v'));

  const invalid = EngineUpdater.safeExec('nonexistent_command_xyz_123', process.cwd());
  assert.strictEqual(invalid, null);
});
