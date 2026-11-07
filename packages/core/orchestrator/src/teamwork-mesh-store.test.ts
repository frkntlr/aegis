import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TeamworkMeshStore } from './teamwork-mesh-store.js';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-mesh-store-test-'));
}

test('TeamworkMeshStore loadMesh returns empty state on missing file and caches properly', () => {
  const tmp = createTempDir();
  try {
    const store = new TeamworkMeshStore(tmp);
    const initial = store.loadMesh();
    assert.strictEqual(initial.planId, 'idle');
    assert.strictEqual(initial.activeWave, 0);
    assert.strictEqual(store.getCachedState(), undefined);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('TeamworkMeshStore saveMesh writes atomically and updates in-memory cache', () => {
  const tmp = createTempDir();
  try {
    const store = new TeamworkMeshStore(tmp);
    const state = store.createInitialState('plan-save', 'Atomic write test', []);
    store.saveMesh(state);

    assert.ok(fs.existsSync(store.getMeshPath()));
    const cached = store.getCachedState();
    assert.ok(cached);
    assert.strictEqual(cached.planId, 'plan-save');

    const loaded = store.loadMesh();
    assert.strictEqual(loaded.planId, 'plan-save');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('TeamworkMeshStore loadMesh utilizes in-memory snapshot and protects cache from mutation', () => {
  const tmp = createTempDir();
  try {
    const store = new TeamworkMeshStore(tmp);
    const state = store.createInitialState('plan-cache', 'Cache snapshot test', []);
    store.saveMesh(state);

    const snapshot1 = store.loadMesh();
    snapshot1.objective = 'MUTATED_IN_CALLER';
    snapshot1.agents['rogue'] = store.createDefaultPeer('rogue');

    const snapshot2 = store.loadMesh();
    assert.strictEqual(snapshot2.objective, 'Cache snapshot test');
    assert.strictEqual(snapshot2.agents['rogue'], undefined);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('TeamworkMeshStore invalidateCache forces stat and reload from disk when modified externally', () => {
  const tmp = createTempDir();
  try {
    const store1 = new TeamworkMeshStore(tmp);
    const store2 = new TeamworkMeshStore(tmp);

    const state1 = store1.createInitialState('plan-ext', 'Store 1 write', []);
    store1.saveMesh(state1);

    const loaded2 = store2.loadMesh();
    assert.strictEqual(loaded2.objective, 'Store 1 write');

    const updated1 = store1.loadMesh();
    updated1.objective = 'Store 1 updated externally';
    store1.saveMesh(updated1);

    store2.invalidateCache();
    const reloaded2 = store2.loadMesh();
    assert.strictEqual(reloaded2.objective, 'Store 1 updated externally');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('TeamworkMeshStore handles rapid sequential reads without disk parsing churn', () => {
  const tmp = createTempDir();
  try {
    const store = new TeamworkMeshStore(tmp);
    const state = store.createInitialState('plan-fast', 'Rapid reads', []);
    store.saveMesh(state);

    const start = Date.now();
    for (let i = 0; i < 50; i++) {
      const snap = store.loadMesh();
      assert.strictEqual(snap.planId, 'plan-fast');
    }
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 200, `50 cached reads took ${elapsed}ms, expected sub-200ms`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('TeamworkMeshStore clearMesh removes file and resets in-memory cache', () => {
  const tmp = createTempDir();
  try {
    const store = new TeamworkMeshStore(tmp);
    store.saveMesh(store.createInitialState('plan-clear', 'To be cleared', []));
    assert.ok(fs.existsSync(store.getMeshPath()));

    store.clearMesh();
    assert.strictEqual(fs.existsSync(store.getMeshPath()), false);
    assert.strictEqual(store.getCachedState(), undefined);
    assert.strictEqual(store.loadMesh().planId, 'idle');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
