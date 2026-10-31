import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TeamworkCoordinator } from './teamwork-coordinator.js';

test('TeamworkCoordinator lists all 4 official Antigravity subagent profiles', () => {
  const coordinator = new TeamworkCoordinator();
  const profiles = coordinator.listProfiles();
  assert.strictEqual(profiles.length, 4);

  const names = profiles.map(p => p.name);
  assert.ok(names.includes('issue-solver'));
  assert.ok(names.includes('qa-hunter'));
  assert.ok(names.includes('ui-specialist'));
  assert.ok(names.includes('doc-architect'));

  for (const p of profiles) {
    assert.strictEqual(p.workspaceMode, 'inherit');
    assert.strictEqual(p.enableWriteTools, true);
    assert.strictEqual(p.enableMcpTools, true);
    assert.ok(p.systemPrompt.includes('Demir Kafes') || p.systemPrompt.includes('Wiki'));
  }
});

test('TeamworkCoordinator plans teamwork, stages tracks in inbox, and acquires locks', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-teamwork-test-'));
  try {
    const coordinator = new TeamworkCoordinator(tmpDir);
    const targetFile = 'packages/core/src/feature.ts';
    const plan = coordinator.planTeamwork('Build responsive inventory UI and document API', [targetFile, 'theme.tres', 'docs/API.md']);

    assert.ok(plan.planId.startsWith('tw-'));
    assert.ok(plan.tracks.length >= 3);

    const solverTrack = plan.tracks.find(t => t.subagentName === 'issue-solver');
    assert.ok(solverTrack);
    assert.strictEqual(solverTrack?.invocationPayload.TypeName, 'issue-solver');
    assert.strictEqual(solverTrack?.invocationPayload.Workspace, 'inherit');

    const inboxPath = path.join(tmpDir, '.aegis', 'task-inbox.json');
    assert.ok(fs.existsSync(inboxPath));
    const staged = JSON.parse(fs.readFileSync(inboxPath, 'utf8'));
    assert.ok(staged.length >= 3);

    const status = coordinator.getTeamworkStatus();
    assert.ok(status.activeTracksCount >= 3);
    assert.ok(status.lockedFilesCount >= 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TeamworkCoordinator routes Godot UI scene files to ui-specialist and avoids mutex collisions', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-godot-tw-test-'));
  try {
    const coordinator = new TeamworkCoordinator(tmpDir);
    const files = [
      'src/gameplay/combat.ts',
      'res://scenes/ui/pause_menu.tscn',
      'res://ui/pause_menu.gd',
      'res://themes/menu_theme.tres',
      'docs/CONTRIBUTING.md'
    ];
    const plan = coordinator.planTeamwork('Implement Pause Menu and Combat HUD', files);

    const solverTrack = plan.tracks.find(t => t.subagentName === 'issue-solver');
    const uiTrack = plan.tracks.find(t => t.subagentName === 'ui-specialist');
    const docTrack = plan.tracks.find(t => t.subagentName === 'doc-architect');

    assert.ok(solverTrack);
    assert.ok(uiTrack);
    assert.ok(docTrack);

    // ui-specialist owns all Godot UI files
    assert.ok(uiTrack?.targetFiles.includes('res://scenes/ui/pause_menu.tscn'));
    assert.ok(uiTrack?.targetFiles.includes('res://ui/pause_menu.gd'));
    assert.ok(uiTrack?.targetFiles.includes('res://themes/menu_theme.tres'));

    // solver owns non-UI code
    assert.deepStrictEqual(solverTrack?.targetFiles, ['src/gameplay/combat.ts']);

    // doc-architect owns markdown
    assert.deepStrictEqual(docTrack?.targetFiles, ['docs/CONTRIBUTING.md']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TeamworkCoordinator exports Antigravity subagents manifest cleanly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-manifest-test-'));
  try {
    const coordinator = new TeamworkCoordinator(tmpDir);
    const result = coordinator.exportSubagentManifest(tmpDir);
    assert.strictEqual(result.count, 4);

    const manifestPath = path.join(tmpDir, 'subagents.json');
    assert.ok(fs.existsSync(manifestPath));
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.strictEqual(parsed.framework, 'antigravity-subagents');
    assert.strictEqual(parsed.subagents.length, 4);
    assert.strictEqual(parsed.subagents.find((s: { name: string }) => s.name === 'doc-architect')?.defaultModel, 'flash');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TeamworkCoordinator assigns hybrid models and formats live matrix table', () => {
  const coordinator = new TeamworkCoordinator();
  const plan = coordinator.planTeamwork('Build feature and document', ['feature.ts', 'docs/README.md']);

  const solverTrack = plan.tracks.find(t => t.subagentName === 'issue-solver');
  const docTrack = plan.tracks.find(t => t.subagentName === 'doc-architect');
  assert.strictEqual(solverTrack?.invocationPayload.Model, 'inherit');
  assert.strictEqual(docTrack?.invocationPayload.Model, 'flash');

  const matrix = coordinator.formatLiveMatrix(plan, { 'issue-solver': 'done', 'doc-architect': 'running' });
  assert.ok(matrix.includes('Antigravity Teamwork Canlı Görev Matrisi'));
  assert.ok(matrix.includes('✅ Tamamlandı'));
  assert.ok(matrix.includes('🔄 Çalışıyor'));
});

test('TeamworkCoordinator memoizes subagent profiles cache across multiple calls', () => {
  const coordinator = new TeamworkCoordinator();
  const profilesFirst = coordinator.listProfiles();
  const profilesSecond = coordinator.listProfiles();
  assert.strictEqual(profilesFirst, profilesSecond);
  assert.strictEqual(profilesFirst.length, 4);
});

test('TeamworkCoordinator generates deterministic plan ID when requested', () => {
  const coordinator = new TeamworkCoordinator();
  const files = ['packages/core/src/feature.ts', 'docs/API.md'];
  const obj = 'Build responsive inventory UI and document API';

  const planA = coordinator.planTeamwork(obj, files, { deterministic: true });
  const planB = coordinator.planTeamwork(obj, files, { deterministic: true });

  assert.ok(planA.planId.startsWith('tw-det-'));
  assert.strictEqual(planA.planId, planB.planId);
  assert.strictEqual(planA.tracks.length, planB.tracks.length);
  for (let i = 0; i < planA.tracks.length; i++) {
    assert.strictEqual(planA.tracks[i].id, planB.tracks[i].id);
    assert.strictEqual(planA.tracks[i].invocationPayload.Workspace, 'inherit');
  }

  const planDiff = coordinator.planTeamwork(obj, ['packages/core/src/other.ts'], { deterministic: true });
  assert.notStrictEqual(planA.planId, planDiff.planId);

  const planNonDet = coordinator.planTeamwork(obj, files);
  assert.ok(planNonDet.planId.startsWith('tw-'));
  assert.ok(!planNonDet.planId.startsWith('tw-det-'));
});
