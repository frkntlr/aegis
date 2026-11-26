import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  REPO_ROOT,
  createTempWorkspace,
  initTempGitRepo,
  runAegisCli
} from './helpers/cli-runner.mjs';

function writeGodotTelemetry(dir, nodes) {
  const aegisDir = path.join(dir, '.aegis');
  fs.mkdirSync(aegisDir, { recursive: true });
  fs.writeFileSync(path.join(aegisDir, 'ui_telemetry.json'), JSON.stringify({ nodes }), 'utf8');
}

function gdNode(id, x, y, width, height) {
  return { id: `/root/Main/${id}`, name: id, type: 'Button', visible: true, rect: { x, y, width, height } };
}

function testInspectFailsClosedWithoutTelemetry(t) {
  const ws = createTempWorkspace('aegis-f05-notel-');
  t.after(ws.cleanup);
  const res = runAegisCli(['inspect'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.notEqual(res.status, 0, 'aegis inspect without telemetry must fail closed');
  assert.doesNotMatch(res.stdout, /header-nav/);
}

function testInspectExitsNonZeroOnOverlapAndOverflow(t) {
  const ws = createTempWorkspace('aegis-f05-ov-');
  t.after(ws.cleanup);
  const layoutPath = path.join(ws.dir, 'layout.json');
  fs.writeFileSync(layoutPath, JSON.stringify([
    { id: 'a', x: 0, y: 0, width: 200, height: 60 },
    { id: 'b', x: 100, y: 20, width: 500, height: 60 }
  ]), 'utf8');
  const res = runAegisCli(['inspect', layoutPath], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.match(res.stdout, /FAILED/);
  assert.notEqual(res.status, 0, 'aegis inspect must exit non-zero when overlaps/overflows exist');
}

function testAuditFailsClosedWithoutTestEvidence(t) {
  const ws = createTempWorkspace('aegis-f05-audit-');
  t.after(ws.cleanup);
  initTempGitRepo(ws.dir);
  fs.writeFileSync(path.join(ws.dir, 'mod.ts'), 'export const a = 1;\n', 'utf8');
  const res = runAegisCli(['audit', 'mod.ts'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  const approvedZero = res.status === 0 && /Verdict:\s+APPROVED/i.test(res.stdout);
  assert.equal(approvedZero, false, 'aegis audit without real test evidence must not silently approve with exit 0');
}

function testGodotInspectValidVsMissingAndOverlap(t) {
  const ws = createTempWorkspace('aegis-f05-gd-');
  t.after(ws.cleanup);
  const miss = runAegisCli(['godot', 'inspect', ws.dir], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.equal(miss.status, 1, 'Missing telemetry must exit 1');
  writeGodotTelemetry(ws.dir, [gdNode('BtnA', 10, 10, 100, 48), gdNode('BtnB', 130, 10, 100, 48)]);
  const ok = runAegisCli(['godot', 'inspect', ws.dir], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.equal(ok.status, 0, `Valid telemetry failed:\n${ok.stdout}\n${ok.stderr}`);
  writeGodotTelemetry(ws.dir, [gdNode('BtnA', 10, 10, 150, 60), gdNode('BtnB', 50, 20, 150, 60)]);
  const bad = runAegisCli(['godot', 'inspect', ws.dir], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.match(bad.stdout, /FAIL/);
  assert.equal(bad.status, 1, 'Overlapping Godot telemetry must exit 1');
}

function testNlmErrorPathsExitOne(t) {
  const ws = createTempWorkspace('aegis-f05-nlm-');
  t.after(ws.cleanup);
  const isoEnv = { AEGIS_WORKSPACE: ws.dir, HOME: ws.dir, USERPROFILE: ws.dir, APPDATA: ws.dir, LOCALAPPDATA: ws.dir };
  const cmds = [
    ['nlm:research', 'topic', '--deep'],
    ['nlm:sources', 'invalid-nb'],
    ['nlm:poll', 'fake-task'],
    ['nlm:import', 'fake-task']
  ];
  for (const args of cmds) {
    const res = runAegisCli(args, { cwd: ws.dir, env: isoEnv });
    assert.equal(res.status, 1, `aegis ${args.join(' ')} must exit 1 on failure`);
  }
}

function testInspectMalformedJsonFailsClosed(t) {
  const ws = createTempWorkspace('aegis-f05-badjson-');
  t.after(ws.cleanup);
  const corrupt = path.join(ws.dir, 'corrupt.json');
  fs.writeFileSync(corrupt, '{not-valid-json', 'utf8');
  const res = runAegisCli(['inspect', corrupt], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.notEqual(res.status, 0, 'Malformed JSON in inspect must fail closed');
}

function testGodotInspectAdjacentVsOnePxOverlap(t) {
  const ws = createTempWorkspace('aegis-f05-1px-');
  t.after(ws.cleanup);
  writeGodotTelemetry(ws.dir, [gdNode('Left', 0, 0, 100, 48), gdNode('Right', 100, 0, 100, 48)]);
  const adj = runAegisCli(['godot', 'inspect', ws.dir], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.equal(adj.status, 0, `Adjacent non-overlapping buttons must pass:\n${adj.stdout}`);
  writeGodotTelemetry(ws.dir, [gdNode('Left', 0, 0, 100, 48), gdNode('Right', 99, 0, 100, 48)]);
  const ov = runAegisCli(['godot', 'inspect', ws.dir], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.equal(ov.status, 1, '1px overlap in Godot telemetry must exit 1');
}

function testCiAuditUnknownStepExitsOne(t) {
  const ws = createTempWorkspace('aegis-f05-step-');
  t.after(ws.cleanup);
  const res = runAegisCli(['ci:audit', '--step=nonexistent', '--json'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.equal(res.status, 1);
  assert.match(res.stdout, /error/i);
}

function testCiAuditGodotInspectParityWithCiYml() {
  const ciYml = fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');
  assert.match(ciYml, /godot inspect/);
  const ciAuditSrc = fs.readFileSync(path.join(REPO_ROOT, 'packages/cli/src/commands/ci-audit-command.ts'), 'utf8');
  assert.match(ciAuditSrc, /godot inspect/, 'ci-audit-command.ts must align with ci.yml godot inspect gate');
}

function testDepsDriftStrictExitsNonZeroOnDrift(t) {
  const ws = createTempWorkspace('aegis-f05-drift-');
  t.after(ws.cleanup);
  fs.writeFileSync(path.join(ws.dir, 'package.json'), JSON.stringify({ name: 'tmp-drift', version: '1.0.0' }));
  fs.writeFileSync(path.join(ws.dir, 'package-lock.json'), JSON.stringify({ name: 'tmp-drift', lockfileVersion: 3 }));
  const res = runAegisCli(['deps:drift', '--strict'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.notEqual(res.status, 0, 'deps:drift --strict must fail non-zero when ecosystem drift exists');
}

function testDiffSurgicalVsOversizedBoundary(t) {
  const ws = createTempWorkspace('aegis-f05-diff-');
  t.after(ws.cleanup);
  const mkDiff = (n) => `diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,0 +1,${n} @@\n${Array.from({ length: n }, (_, i) => `+const x${i} = ${i};`).join('\n')}\n`;
  const okFile = path.join(ws.dir, 'ok.diff');
  const bigFile = path.join(ws.dir, 'big.diff');
  fs.writeFileSync(okFile, mkDiff(150), 'utf8');
  fs.writeFileSync(bigFile, mkDiff(151), 'utf8');
  assert.equal(runAegisCli(['diff', okFile], { cwd: ws.dir }).status, 0, '150-line diff should pass');
  assert.equal(runAegisCli(['diff', bigFile], { cwd: ws.dir }).status, 1, '151-line diff must fail');
}

function registerTier1() {
  test('T1.1 aegis inspect fails closed without telemetry file', testInspectFailsClosedWithoutTelemetry);
  test('T1.2 aegis inspect exits non-zero on layout overlap and overflow', testInspectExitsNonZeroOnOverlapAndOverflow);
  test('T1.3 aegis audit fails closed without verifiable test evidence', testAuditFailsClosedWithoutTestEvidence);
  test('T1.4 aegis godot inspect passes valid telemetry and exits 1 on missing/overlap', testGodotInspectValidVsMissingAndOverlap);
  test('T1.5 aegis nlm:research/sources/poll/import error paths exit 1', testNlmErrorPathsExitOne);
}

function registerTier2() {
  test('T2.1 aegis inspect fails closed on malformed JSON', testInspectMalformedJsonFailsClosed);
  test('T2.2 aegis godot inspect adjacent 0px passes vs 1px overlap exits 1', testGodotInspectAdjacentVsOnePxOverlap);
  test('T2.3 aegis ci:audit --step=nonexistent exits 1', testCiAuditUnknownStepExitsOne);
  test('T2.4 ci-audit-command aligns with ci.yml godot inspect gate', testCiAuditGodotInspectParityWithCiYml);
  test('T2.5 aegis deps:drift --strict exits non-zero on unsynced lockfile', testDepsDriftStrictExitsNonZeroOnDrift);
  test('T2.6 aegis diff accepts 150-line surgical diff and rejects 151-line diff', testDiffSurgicalVsOversizedBoundary);
}

describe('Tier 1: F05 Fail-Closed Quality Gates', registerTier1);
describe('Tier 2: F05 Gate Boundaries & CI Parity', registerTier2);
