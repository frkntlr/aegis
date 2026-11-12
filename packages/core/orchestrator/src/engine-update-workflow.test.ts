import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EngineUpdater, type EngineVersionReport } from './engine-updater.js';
import { resolveUpdateEngineRoot } from './engine-update-refresh.js';

function fixture(run: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-update-workflow-'));
  fs.mkdirSync(path.join(root, 'packages/cli'), { recursive: true });
  fs.mkdirSync(path.join(root, '.aegis'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'aegis', version: '1.0.0' }));
  for (const file of ['task-inbox.json', 'locks.json', 'teamwork-mesh.json']) fs.writeFileSync(path.join(root, '.aegis', file), `preserve ${file}`);
  try { run(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function report(): EngineVersionReport {
  return { currentVersion: '1.0.0', localCommit: 'abc1234', remoteCommit: 'abc1234', branch: 'main',
    driftStatus: 'synced', behindCount: 0, aheadCount: 0, worktreesCount: 1, monorepoPackages: [],
    installedShims: [], mcpToolCount: 0, latestTag: null, upgradeAvailable: false,
    nextRecommendedVersion: '1.0.1', timestamp: new Date().toISOString() };
}

test('update pulls even a reportedly synced branch, installs dependencies, builds and refreshes in order', t => fixture(root => {
  const calls: string[] = [];
  t.mock.method(EngineUpdater, 'getVersionReport', () => report());
  t.mock.method(EngineUpdater, 'pullLatest', (cwd: string) => { assert.equal(cwd, root); calls.push('pull'); return { pulled: true }; });
  t.mock.method(EngineUpdater, 'installDependencies', () => { calls.push('dependencies'); });
  t.mock.method(EngineUpdater, 'rebuild', () => { calls.push('build'); return { built: true }; });
  t.mock.method(EngineUpdater, 'reinstallPC', (cwd: string, project: string) => {
    assert.equal(cwd, root); assert.equal(project, path.join(root, 'project'));
    calls.push('refresh'); return { shimsCount: 6, idesSynced: ['Codex'], worktreesSynced: 0 };
  });
  const result = EngineUpdater.runUpdate({ repoRoot: root, projectRoot: path.join(root, 'project'), pull: true });
  assert.equal(result.success, true); assert.equal(result.engineRoot, root);
  assert.deepEqual(calls, ['pull', 'dependencies', 'build', 'refresh']);
  for (const file of ['task-inbox.json', 'locks.json', 'teamwork-mesh.json']) assert.equal(fs.readFileSync(path.join(root, '.aegis', file), 'utf8'), `preserve ${file}`);
}));

test('failed source pull aborts before dependency install, build or client writes', t => fixture(root => {
  t.mock.method(EngineUpdater, 'getVersionReport', () => report());
  t.mock.method(EngineUpdater, 'pullLatest', () => ({ pulled: false, error: 'No configured upstream or pull failed' }));
  for (const method of ['installDependencies', 'rebuild', 'reinstallPC'] as const) {
    t.mock.method(EngineUpdater, method, () => { throw new Error('Must not execute after failed pull'); });
  }
  const result = EngineUpdater.runUpdate({ repoRoot: root, pull: true });
  assert.equal(result.success, false); assert.equal(result.built, false);
  assert.match(result.message, /fast-forward source pull.*configured upstream/);
}));

test('dependency failure aborts before build; refresh failure preserves truthful build evidence', t => fixture(root => {
  t.mock.method(EngineUpdater, 'getVersionReport', () => report());
  const dependencies = t.mock.method(EngineUpdater, 'installDependencies', () => { throw new Error('Lockfile mismatch'); });
  t.mock.method(EngineUpdater, 'rebuild', () => ({ built: true }));
  t.mock.method(EngineUpdater, 'reinstallPC', () => { throw new Error('Client config is malformed'); });
  const failedDependencies = EngineUpdater.runUpdate({ repoRoot: root });
  assert.equal(failedDependencies.success, false); assert.equal(failedDependencies.built, false);
  assert.match(failedDependencies.message, /install dependencies.*Lockfile/);
  dependencies.mock.mockImplementation(() => undefined);
  const failedRefresh = EngineUpdater.runUpdate({ repoRoot: root });
  assert.equal(failedRefresh.success, false); assert.equal(failedRefresh.built, true);
  assert.match(failedRefresh.message, /refresh installed integrations.*malformed/);
}));

test('cache cleanup leaves all collaboration state intact', () => fixture(root => {
  fs.mkdirSync(path.join(root, '.turbo'), { recursive: true });
  fs.writeFileSync(path.join(root, '.turbo/cache'), 'cached');
  const result = EngineUpdater.cleanWorkspace(root);
  assert.equal(result.locksCleared, 0);
  assert.equal(fs.existsSync(path.join(root, '.turbo')), false);
  for (const file of ['task-inbox.json', 'locks.json', 'teamwork-mesh.json']) assert.equal(fs.readFileSync(path.join(root, '.aegis', file), 'utf8'), `preserve ${file}`);
}));

test('installed engine resolution ignores the caller project and AEGIS_WORKSPACE', () => fixture(root => {
  const previousCwd = process.cwd(), previousWorkspace = process.env.AEGIS_WORKSPACE;
  try {
    process.chdir(root); process.env.AEGIS_WORKSPACE = root;
    assert.equal(resolveUpdateEngineRoot(), path.resolve(__dirname, '../../../..'));
    assert.equal(resolveUpdateEngineRoot(root), root);
  } finally {
    process.chdir(previousCwd);
    if (previousWorkspace === undefined) delete process.env.AEGIS_WORKSPACE;
    else process.env.AEGIS_WORKSPACE = previousWorkspace;
  }
}));
