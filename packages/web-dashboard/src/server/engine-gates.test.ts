import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { cleanGitEnv } from '@aegis/shared';
import { getGitModifiedFiles, loadTelemetryLayout } from './engine-gate-helpers.js';
import { AegisEngineService } from './engine-service.js';
import { GitHubKanbanService } from './github-kanban.js';
import { RealtimeMetricsService } from './realtime-metrics.js';
import { SessionDetector } from './session-detector.js';

function createMutationMiniPkg(strongTests: boolean): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-web-mut-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'mini-mut', version: '1.0.0' }), 'utf8');
  fs.writeFileSync(path.join(dir, 'src', 'calc.ts'), 'export function add(a: number, b: number): number {\n  return a + b;\n}\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'dist', 'calc.js'), 'exports.add = function add(a, b) { return a + b; };\n', 'utf8');
  const testCode = strongTests
    ? "const test = require('node:test');\nconst assert = require('node:assert');\nconst { add } = require('./calc.js');\ntest('add', () => { assert.strictEqual(add(2, 3), 5); assert.strictEqual(add(-1, 4), 3); });\n"
    : "const test = require('node:test');\nconst assert = require('node:assert');\nconst { add } = require('./calc.js');\ntest('vacuous', () => { assert.ok(typeof add === 'function'); });\n";
  fs.writeFileSync(path.join(dir, 'dist', 'calc.test.js'), testCode, 'utf8');
  return dir;
}

test('AegisEngineService.runMutationGate executes real tests and catches vacuous survivors', () => {
  const strongPkg = createMutationMiniPkg(true);
  const weakPkg = createMutationMiniPkg(false);
  try {
    const strongRes = new AegisEngineService(strongPkg).runMutationGate('src/calc.ts');
    assert.strictEqual(strongRes.baselinePassed, true);
    assert.strictEqual(strongRes.passed, true);
    assert.strictEqual(strongRes.scorePercent, 100);

    const weakRes = new AegisEngineService(weakPkg).runMutationGate('src/calc.ts');
    assert.strictEqual(weakRes.baselinePassed, true);
    assert.strictEqual(weakRes.passed, false);
    assert.ok(Number(weakRes.survivedMutants) >= 1);

    const emptyRes = new AegisEngineService(strongPkg).runMutationGate('   ');
    assert.strictEqual(emptyRes.passed, false);
    assert.strictEqual(emptyRes.unavailable, true);
  } finally {
    fs.rmSync(strongPkg, { recursive: true, force: true });
    fs.rmSync(weakPkg, { recursive: true, force: true });
  }
});

test('AegisEngineService.runUiInspector loads BOM-prefixed telemetry and fails closed when missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-web-ui-'));
  try {
    const svc = new AegisEngineService(dir);
    const missing = svc.runUiInspector();
    assert.strictEqual(missing.passed, false);
    assert.strictEqual(missing.unavailable, true);

    fs.mkdirSync(path.join(dir, '.aegis'), { recursive: true });
    const okPayload = {
      viewport: { width: 390, height: 844, aspectRatio: '9:16' },
      nodes: [
        { id: 'Header', rect: { x: 0, y: 0, width: 390, height: 60 } },
        { id: 'Body', rect: { x: 0, y: 70, width: 390, height: 200 } }
      ]
    };
    fs.writeFileSync(path.join(dir, '.aegis', 'ui_telemetry.json'), `\uFEFF${JSON.stringify(okPayload)}`, 'utf8');
    const okRes = svc.runUiInspector();
    assert.strictEqual(okRes.passed, true);
    assert.strictEqual(okRes.elementsChecked, 2);

    const overlapPayload = [
      { id: 'A', x: 0, y: 0, width: 100, height: 100 },
      { id: 'B', x: 50, y: 50, width: 100, height: 100 }
    ];
    fs.writeFileSync(path.join(dir, '.aegis', 'ui_telemetry.json'), JSON.stringify(overlapPayload), 'utf8');
    const badRes = svc.runUiInspector();
    assert.strictEqual(badRes.passed, false);
    assert.ok(Number(badRes.overlapsCount) >= 1);

    const invalidNodes = [{ id: 'Bad', x: 'NaN', y: 0, width: 10, height: 10 }, { width: 10, height: 10 }, null];
    fs.writeFileSync(path.join(dir, '.aegis', 'ui_telemetry.json'), JSON.stringify(invalidNodes), 'utf8');
    assert.strictEqual(svc.runUiInspector().unavailable, true);
    assert.strictEqual(svc.runUiInspector(path.join(dir, 'nope.txt')).unavailable, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('AegisEngineService.runDiffValidator reads real git diff and fails closed when clean or empty', async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-web-diff-'));
  const env = cleanGitEnv();
  try {
    execFileSync('git', ['init'], { cwd: repo, env });
    execFileSync('git', ['config', 'user.email', 'test@aegis.local'], { cwd: repo, env });
    execFileSync('git', ['config', 'user.name', 'Aegis Test'], { cwd: repo, env });
    fs.writeFileSync(path.join(repo, 'app.ts'), 'export const a = 1;\n', 'utf8');
    execFileSync('git', ['add', 'app.ts'], { cwd: repo, env });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: repo, env });

    const svc = new AegisEngineService(repo);
    const cleanDefault = await svc.runDiffValidator();
    assert.strictEqual(cleanDefault.isSurgical, false);
    assert.ok(String(cleanDefault.rejectionReason).includes('No uncommitted git diff'));
    const cleanGit = await svc.runDiffValidator('git');
    assert.strictEqual(cleanGit.isSurgical, false);
    const emptyStr = await svc.runDiffValidator('   ');
    assert.strictEqual(emptyStr.isSurgical, false);

    fs.writeFileSync(path.join(repo, 'app.ts'), 'export const a = 2;\n', 'utf8');
    assert.deepStrictEqual(await getGitModifiedFiles(repo), ['app.ts']);
    const dirtyRes = await svc.runDiffValidator();
    assert.strictEqual(dirtyRes.isSurgical, true);
    assert.ok(Number(dirtyRes.addedLines) >= 1);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('AegisEngineService.runOracleAudit enforces test evidence and handles BOM/failed reports', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-web-oracle-'));
  try {
    const svc = new AegisEngineService(dir);
    const unavail = await svc.runOracleAudit([]);
    assert.strictEqual(unavail.verdict, 'UNAVAILABLE');
    assert.strictEqual(unavail.suspicious, false);

    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'mod.ts'), 'export const val = 1;\n', 'utf8');
    const missingEvidence = await svc.runOracleAudit(['src/mod.ts']);
    assert.strictEqual(missingEvidence.verdict, 'MANUAL_REVIEW_REQUIRED');
    assert.strictEqual(missingEvidence.suspicious, true);

    fs.writeFileSync(path.join(dir, 'src', 'mod.test.ts'), "import * as assert from 'node:assert';\nimport { val } from './mod.js';\nassert.strictEqual(val, 1);\n", 'utf8');
    fs.mkdirSync(path.join(dir, '.aegis', 'cache'), { recursive: true });
    const reportPath = path.join(dir, '.aegis', 'cache', 'last-test-run.json');
    fs.writeFileSync(reportPath, `\uFEFF${JSON.stringify({ numPassedTests: 2, numFailedTests: 0 })}`, 'utf8');
    const approved = await svc.runOracleAudit(['src/mod.ts']);
    assert.strictEqual(approved.verdict, 'APPROVED');
    assert.strictEqual(approved.suspicious, false);

    fs.writeFileSync(reportPath, JSON.stringify({ numPassedTests: 1, numFailedTests: 1 }), 'utf8');
    const rejected = await svc.runOracleAudit(['src/mod.ts']);
    assert.strictEqual(rejected.verdict, 'REJECTED');
    assert.strictEqual(rejected.suspicious, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('BOM-safe JSON loading and AEGIS_DEBUG=1 ignored-error logging work across dashboard services', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-web-bom-'));
  const prevDebug = process.env.AEGIS_DEBUG;
  try {
    fs.mkdirSync(path.join(dir, '.aegis', 'sessions'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.aegis', 'issues.json'),
      `\uFEFF${JSON.stringify([{ id: 9, number: 9, title: 'BOM Issue', status: 'ready', targetFiles: [], labels: [] }])}`,
      'utf8'
    );
    fs.writeFileSync(path.join(dir, '.aegis', 'settings.json'), `\uFEFF${JSON.stringify({ primaryBranch: 'develop' })}`, 'utf8');
    fs.writeFileSync(path.join(dir, '.aegis', 'sessions', 'solver.json'), `\uFEFF${JSON.stringify({ ideType: 'Cursor AI', lastHeartbeat: '2026-11-25T00:00:00Z' })}`, 'utf8');

    const kanban = new GitHubKanbanService({ repoRoot: dir, offline: true });
    assert.strictEqual(kanban.getIssues()[0].title, 'BOM Issue');

    const metrics = new RealtimeMetricsService({ repoRoot: dir, offline: true });
    assert.strictEqual(metrics.getSettings().primaryBranch, 'develop');

    const sessions = new SessionDetector(dir).detectSessions();
    assert.strictEqual(sessions.find(s => s.agentName === 'solver')?.ideType, 'Cursor AI');

    fs.writeFileSync(path.join(dir, '.aegis', 'settings.json'), '{broken json', 'utf8');
    const chunks: string[] = [];
    t.mock.method(process.stderr, 'write', (chunk: string | Uint8Array) => {
      chunks.push(String(chunk));
      return true;
    });
    process.env.AEGIS_DEBUG = '1';
    metrics.getSettings();
    assert.ok(chunks.some(c => c.includes('[aegis:realtime-metrics:getSettings]')));
  } finally {
    if (prevDebug === undefined) delete process.env.AEGIS_DEBUG;
    else process.env.AEGIS_DEBUG = prevDebug;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('loadTelemetryLayout validates bounding boxes, viewport, zIndex, and parentId', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-layout-parse-'));
  try {
    const file = path.join(dir, 'layout.json');
    const payload = {
      viewport: { width: 800, height: 600, name: 'Tablet' },
      nodes: [
        null, 'str', { id: 'Inf', x: Number.POSITIVE_INFINITY, y: 0, width: 10, height: 10 },
        { id: 'NaNBox', x: Number.NaN, y: 0, width: 10, height: 10 },
        { name: 'NamedOnly', rect: null, x: 0, y: 0, width: 20, height: 20, zIndex: 3, parentId: 'root' },
        { id: 123, name: 'FallbackName', rect: 'bad', x: 30, y: 0, width: 20, height: 20, zIndex: Number.POSITIVE_INFINITY }
      ]
    };
    fs.writeFileSync(file, JSON.stringify(payload), 'utf8');
    const loaded = loadTelemetryLayout(file, dir);
    assert.deepStrictEqual(loaded.viewport, { width: 800, height: 600, name: 'Tablet' });
    assert.strictEqual(loaded.elements.length, 2);
    assert.strictEqual(loaded.elements[0].id, 'NamedOnly');
    assert.strictEqual(loaded.elements[0].zIndex, 3);
    assert.strictEqual(loaded.elements[0].parentId, 'root');
    assert.strictEqual(loaded.elements[1].id, 'FallbackName');
    assert.strictEqual(loaded.elements[1].zIndex, undefined);
    assert.strictEqual(loaded.elements[1].parentId, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
