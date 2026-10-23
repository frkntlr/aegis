import { test } from 'node:test';
import * as assert from 'node:assert';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { ProjectHub } from './project-hub.js';
import { DashboardServer } from './dashboard-server.js';

test('ProjectHub initializes with default context and lists projects', () => {
  const hub = new ProjectHub();
  const active = hub.getActiveContext();
  assert.ok(active);
  assert.ok(active.id.includes('aegis'));
  assert.strictEqual(active.projectNumber, 4);

  const list = hub.listProjects();
  assert.ok(list.length >= 1);
  assert.strictEqual(list[0].isFocused, true);
});

test('ProjectHub handles focus auto-switching when workspace path changes', () => {
  const tmpDirA = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-proj-a-'));
  const tmpDirB = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-proj-b-'));

  try {
    const hub = new ProjectHub(tmpDirA);
    const initial = hub.getActiveContext();

    // Focus on Project B
    const resB = hub.handleFocus(tmpDirB);
    assert.strictEqual(resB.switched, true);
    assert.strictEqual(resB.activeProject.localPath, tmpDirB);
    assert.strictEqual(hub.getActiveContext().localPath, tmpDirB);

    // Re-focus on Project B (no switch)
    const reFocusB = hub.handleFocus(tmpDirB);
    assert.strictEqual(reFocusB.switched, false);

    // Focus back to Project A
    const resA = hub.handleFocus(tmpDirA);
    assert.strictEqual(resA.switched, true);
    assert.strictEqual(hub.getActiveContext().id, initial.id);
  } finally {
    fs.rmSync(tmpDirA, { recursive: true, force: true });
    fs.rmSync(tmpDirB, { recursive: true, force: true });
  }
});

test('ProjectHub maintains strictly isolated namespaced contexts', () => {
  const tmpDirA = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-iso-a-'));
  const tmpDirB = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-iso-b-'));

  try {
    const hub = new ProjectHub(tmpDirA);
    const ctxA = hub.getActiveContext();
    hub.handleFocus(tmpDirB);
    const ctxB = hub.getActiveContext();

    assert.notStrictEqual(ctxA.id, ctxB.id);
    assert.notStrictEqual(ctxA.localPath, ctxB.localPath);
    assert.notStrictEqual(ctxA.wtManager, ctxB.wtManager);

    // Lock file in Project A
    ctxA.wtManager.acquireFileLocks('solver', ['src/test.ts']);
    assert.strictEqual(ctxA.wtManager.getLockedFiles().size, 1);
    // Project B must have 0 locks
    assert.strictEqual(ctxB.wtManager.getLockedFiles().size, 0);
  } finally {
    fs.rmSync(tmpDirA, { recursive: true, force: true });
    fs.rmSync(tmpDirB, { recursive: true, force: true });
  }
});

test('DashboardServer handles /api/projects and /api/projects/focus endpoints', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-api-hub-'));
  const server = new DashboardServer({ port: 0, repoRoot: tmpDir });
  const port = await server.start();

  try {
    // 1. GET /api/projects
    const projRes = await fetch(`http://localhost:${port}/api/projects`);
    assert.strictEqual(projRes.status, 200);
    const projData = (await projRes.json()) as { projects: unknown[]; active: string };
    assert.ok(Array.isArray(projData.projects));
    assert.ok(projData.active);

    // 2. POST /api/projects/focus (Auto-Follow simulation from Antigravity)
    const newWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-other-proj-'));

    const focusRes = await fetch(`http://localhost:${port}/api/projects/focus`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspacePath: newWorkspace })
    });
    assert.strictEqual(focusRes.status, 200);
    const focusData = (await focusRes.json()) as { success: boolean; switched: boolean; activeProject: { localPath: string } };
    assert.strictEqual(focusData.success, true);
    assert.strictEqual(focusData.switched, true);
    assert.strictEqual(focusData.activeProject.localPath, newWorkspace);
    fs.rmSync(newWorkspace, { recursive: true, force: true });
  } finally {
    await server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
