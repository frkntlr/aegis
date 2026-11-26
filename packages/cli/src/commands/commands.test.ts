import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { showBanner } from './banner.js';
import { handleAudit, handleEstimate, handleDiff, handleInspect, handleMutate, handleSkeleton, handleSkeletonScan, handleVerify } from './dev-commands.js';
import * as devHelpers from './dev-helpers.js';

function captureOutput(fn: () => void): string {
  const originalLog = console.log;
  const originalErr = console.error;
  let logs = '';
  console.log = (...args: unknown[]) => { logs += args.join(' ') + '\n'; };
  console.error = (...args: unknown[]) => { logs += args.join(' ') + '\n'; };
  try { fn(); return logs; } finally { console.log = originalLog; console.error = originalErr; }
}

test('showBanner, handleEstimate, and handleDiff execute cleanly', () => {
  assert.ok(captureOutput(() => showBanner()).includes('AEGIS - Autonomous Vibe Coding Engine'));
  const est = captureOutput(() => handleEstimate(['estimate', '1', '2', '1', '100']));
  assert.ok(est.includes('Timeout Limit: 150s') && est.includes('HIGH'));
  const patch = `--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,3 @@\n-old\n+new\n`;
  assert.ok(captureOutput(() => handleDiff(patch)).includes('Diff is Surgical'));
});

test('handleInspect fails closed on missing, invalid, HTML, or overlapping telemetry', () => {
  const prevExit = process.exitCode, prevCwd = process.cwd();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-inspect-fail-'));
  try {
    process.chdir(tmpDir);
    process.exitCode = 0;
    assert.ok(captureOutput(() => handleInspect()).includes('Unavailable'));
    assert.strictEqual(process.exitCode, 1);
    const htmlFile = path.join(tmpDir, 'mock.html');
    fs.writeFileSync(htmlFile, '<div id="btn"></div>', 'utf8');
    process.exitCode = 0;
    captureOutput(() => handleInspect(htmlFile));
    assert.strictEqual(process.exitCode, 1);
    const overlapFile = path.join(tmpDir, 'overlap.json');
    fs.writeFileSync(overlapFile, JSON.stringify([{ id: 'a', x: 0, y: 0, width: 100, height: 50 }, { id: 'b', x: 20, y: 10, width: 100, height: 50 }]), 'utf8');
    process.exitCode = 0;
    assert.ok(captureOutput(() => handleInspect(overlapFile)).includes('FAILED'));
    assert.strictEqual(process.exitCode, 1);
  } finally {
    process.chdir(prevCwd);
    process.exitCode = prevExit;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('handleInspect passes on valid JSON and BOM-prefixed ui_telemetry.json directory', () => {
  const prevExit = process.exitCode;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-inspect-pass-'));
  try {
    fs.mkdirSync(path.join(tmpDir, '.aegis'), { recursive: true });
    const bomPayload = '\uFEFF' + JSON.stringify({ nodes: [{ id: '/root/Header', rect: { x: 20, y: 20, width: 350, height: 48 } }, { id: '/root/Start', rect: { x: 20, y: 90, width: 350, height: 56 } }] });
    fs.writeFileSync(path.join(tmpDir, '.aegis', 'ui_telemetry.json'), bomPayload, 'utf8');
    process.exitCode = 0;
    assert.ok(captureOutput(() => handleInspect(tmpDir)).includes('PASSED'));
    assert.strictEqual(process.exitCode, 0);
  } finally {
    process.exitCode = prevExit;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('handleAudit fails closed on missing files or partial/missing test evidence', () => {
  const prevExit = process.exitCode, prevCwd = process.cwd();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-audit-missing-'));
  const check = (arg: string, expected: string) => {
    process.exitCode = 0;
    assert.ok(captureOutput(() => handleAudit(arg)).includes(expected));
    assert.strictEqual(process.exitCode, 1);
  };
  try {
    process.chdir(tmpDir);
    check('', 'UNAVAILABLE');
    fs.writeFileSync(path.join(tmpDir, 'feat.ts'), 'export const x = 1;\n', 'utf8');
    check('feat.ts', 'MANUAL_REVIEW_REQUIRED');
    fs.writeFileSync(path.join(tmpDir, 'last-test-run.json'), JSON.stringify({ numPassedTests: 1, numFailedTests: 0 }), 'utf8');
    check('feat.ts', 'MANUAL_REVIEW_REQUIRED');
    fs.writeFileSync(path.join(tmpDir, 'feat.test.ts'), "import test from 'node:test';\nimport * as assert from 'node:assert';\ntest('t', () => { assert.strictEqual(1 + 1, 2); });\n", 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'last-test-run.json'), JSON.stringify({ numPassedTests: 0, numFailedTests: 0 }), 'utf8');
    check('feat.ts', 'MANUAL_REVIEW_REQUIRED');
    fs.rmSync(path.join(tmpDir, 'last-test-run.json'));
    check('feat.ts', 'MANUAL_REVIEW_REQUIRED');
    fs.writeFileSync(path.join(tmpDir, 'last-test-run.json'), JSON.stringify({ numPassedTests: 0, failures: ['err'] }), 'utf8');
    check('feat.ts', 'REJECTED');
  } finally {
    process.chdir(prevCwd);
    process.exitCode = prevExit;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('handleAudit approves clean runs and rejects vacuous or tampered tests', () => {
  const prevExit = process.exitCode, prevCwd = process.cwd();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-audit-verdicts-'));
  try {
    process.chdir(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'feat.ts'), 'export const x = 1;\n', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'last-test-run.json'), JSON.stringify({ numPassedTests: 1, numFailedTests: 0 }), 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'feat.test.ts'), "import test from 'node:test';\nimport * as assert from 'node:assert';\ntest('t', () => { const sum = 1 + 1; assert.strictEqual(sum, 2); });\n", 'utf8');
    process.exitCode = 0;
    assert.ok(captureOutput(() => handleAudit('feat.ts')).includes('APPROVED'));
    assert.strictEqual(process.exitCode, 0);
    const badAssertion = 'assert.ok(' + 'true)';
    fs.writeFileSync(path.join(tmpDir, 'feat.test.ts'), `import test from 'node:test';\nimport * as assert from 'node:assert';\ntest('bad', () => { ${badAssertion}; });\n`, 'utf8');
    process.exitCode = 0;
    assert.ok(captureOutput(() => handleAudit('feat.ts')).includes('REJECTED'));
    assert.strictEqual(process.exitCode, 1);
    process.exitCode = 0;
    const tamperedOut = captureOutput(() => handleAudit('feat.test.ts'));
    assert.strictEqual(process.exitCode, 1);
    assert.ok(tamperedOut.includes('REJECTED') || tamperedOut.includes('MANUAL_REVIEW_REQUIRED'));
  } finally {
    process.chdir(prevCwd);
    process.exitCode = prevExit;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('handleSkeleton, handleVerify, and dev-helpers validate files and addons cleanly', async () => {
  const { IronCageValidator } = await import('@aegis/iron-cage');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-cmd-test-'));
  const testFile = path.join(tmpDir, 'sample.ts');
  fs.writeFileSync(testFile, 'export function add(a: number, b: number): number { return a + b; }\n', 'utf8');
  try {
    const skelOut = captureOutput(() => handleSkeleton(testFile));
    assert.ok(skelOut.includes('AST Skeleton for:') && skelOut.includes('Token Savings:'));
    assert.ok(captureOutput(() => handleVerify(testFile)).includes('Iron Cage: PASSED'));
    assert.strictEqual(devHelpers.collectSourceFiles(tmpDir).length, 1);
    const addonDir = path.join(tmpDir, 'addons', 'aegis_bridge');
    fs.mkdirSync(addonDir, { recursive: true });
    fs.writeFileSync(path.join(addonDir, 'ui_verifier.gd'), 'extends Node\n', 'utf8');
    assert.ok(devHelpers.collectSourceFiles(tmpDir).some(f => f.endsWith('ui_verifier.gd')));
    assert.strictEqual(devHelpers.verifyFile(testFile, new IronCageValidator()), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('getChangedSourceFiles detects unstaged, staged, and untracked .ts files', () => {
  const prevCwd = process.cwd();
  const prevWorkspace = process.env.AEGIS_WORKSPACE;
  const tmpGit = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-git-changed-'));
  try {
    execFileSync('git', ['init'], { cwd: tmpGit });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmpGit });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tmpGit });
    fs.writeFileSync(path.join(tmpGit, 'base.ts'), 'export const a = 1;\n', 'utf8');
    execFileSync('git', ['add', 'base.ts'], { cwd: tmpGit });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: tmpGit });

    fs.writeFileSync(path.join(tmpGit, 'base.ts'), 'export const a = 2;\n', 'utf8');
    fs.writeFileSync(path.join(tmpGit, 'staged.ts'), 'export const s = 2;\n', 'utf8');
    execFileSync('git', ['add', 'staged.ts'], { cwd: tmpGit });
    fs.writeFileSync(path.join(tmpGit, 'untracked.ts'), 'export const b = 3;\n', 'utf8');
    process.chdir(tmpGit);
    process.env.AEGIS_WORKSPACE = tmpGit;
    const changed = devHelpers.getChangedSourceFiles();
    assert.ok(changed.includes('base.ts') && changed.includes('staged.ts') && changed.includes('untracked.ts'));
    assert.ok(captureOutput(() => handleVerify()).includes('Verifying 3 target file(s)'));
  } finally {
    process.chdir(prevCwd);
    if (prevWorkspace === undefined) delete process.env.AEGIS_WORKSPACE;
    else process.env.AEGIS_WORKSPACE = prevWorkspace;
    fs.rmSync(tmpGit, { recursive: true, force: true });
  }
});

test('handleLoopStatus and handleLoopReset execute cleanly', async () => {
  const { handleLoopStatus, handleLoopReset } = await import('./core-commands.js');
  const statusOut = captureOutput(() => handleLoopStatus());
  assert.ok(statusOut.includes('Circuit Breaker'));

  const resetOut = captureOutput(() => handleLoopReset('999'));
  assert.ok(resetOut.includes('Issue #999'));
});

test('runMutationGateOnFile resolves repoRoot paths when cwd differs and dev-helpers handles edge cases', async () => {
  const { IronCageValidator } = await import('@aegis/iron-cage');
  const prevCwd = process.cwd();
  const prevWs = process.env.AEGIS_WORKSPACE;
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-helpers-edge-'));
  try {
    process.chdir(tmp);
    process.env.AEGIS_WORKSPACE = repoRoot;
    assert.strictEqual(devHelpers.runMutationGateOnFile('packages/core/watchdog/src/pre-execution-estimator.ts'), true);
    assert.strictEqual(devHelpers.runMutationGateOnFile('missing-file.ts'), false);
    process.env.AEGIS_WORKSPACE = tmp;
    assert.deepStrictEqual(devHelpers.getChangedSourceFiles(), []);
    assert.strictEqual(devHelpers.verifyFile('missing.ts', new IronCageValidator()), false);
    assert.strictEqual(devHelpers.verifyFile(tmp, new IronCageValidator()), false);
    const badTs = path.join(tmp, 'bad.ts');
    fs.writeFileSync(badTs, 'export const x: ' + 'any = 1;\n', 'utf8');
    assert.strictEqual(devHelpers.verifyFile(badTs, new IronCageValidator()), false);
    assert.deepStrictEqual(devHelpers.parseCageCheckArgs(['--force', '--json', 'src', 'extra']), { noCache: true, jsonOutput: true, targetDir: 'src' });
    assert.strictEqual(devHelpers.loadInspectBoxes(path.join(tmp, 'none.json')).boxes.length, 0);
    assert.deepStrictEqual(devHelpers.getGitModifiedFiles(tmp), []);
    assert.strictEqual(devHelpers.loadAuditTestReport(tmp).found, false);
    assert.strictEqual(captureOutput(() => devHelpers.printRadarAlerts([])), '');
    assert.ok(captureOutput(() => { devHelpers.printRadarAlerts([{ file: 'a.ts', lines: 290, msg: 'split' }]); }).includes('a.ts'));
  } finally {
    process.chdir(prevCwd);
    if (prevWs === undefined) delete process.env.AEGIS_WORKSPACE;
    else process.env.AEGIS_WORKSPACE = prevWs;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('dev-helpers collectSourceFiles, loadInspectBoxes, loadAuditTestReport, and collectAuditTestContents', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-helpers-more-'));
  try {
    fs.mkdirSync(path.join(tmp, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'node_modules', 'skip.ts'), 'export const s = 1;\n', 'utf8');
    fs.writeFileSync(path.join(tmp, 'types.d.ts'), 'export type T = string;\n', 'utf8');
    const scn = path.join(tmp, 'ui.tscn');
    fs.writeFileSync(scn, '[gd_scene format=3]\n', 'utf8');
    assert.strictEqual(devHelpers.collectSourceFiles(tmp, false).length, 0);
    assert.deepStrictEqual(devHelpers.collectSourceFiles(tmp, true), [scn]);
    assert.deepStrictEqual(devHelpers.collectSourceFiles(scn), [scn]);

    const arrJson = path.join(tmp, 'arr.json');
    fs.writeFileSync(arrJson, JSON.stringify([{ id: 'a', x: 1, y: 2, width: 10, height: 10, zIndex: 2, parentId: 'p' }, { id: 9 }]), 'utf8');
    const loaded = devHelpers.loadInspectBoxes(arrJson);
    assert.strictEqual(loaded.boxes.length, 1);
    assert.strictEqual(loaded.boxes[0].zIndex, 2);
    assert.strictEqual(loaded.boxes[0].parentId, 'p');

    fs.writeFileSync(path.join(tmp, 'mod.ts'), 'export const m = 1;\n', 'utf8');
    fs.writeFileSync(path.join(tmp, 'mod.spec.ts'), 'assert.ok(1);\n', 'utf8');
    assert.strictEqual(devHelpers.collectAuditTestContents(['mod.ts', 'mod.spec.ts'], tmp).length, 1);
    fs.writeFileSync(path.join(tmp, 'last-test-run.json'), '{bad', 'utf8');
    assert.strictEqual(devHelpers.loadAuditTestReport(tmp).found, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('dev-commands handleEstimate, handleSkeletonScan, handleVerify, handleDiff, handleMutate enforce boundaries', t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-cmds-edge-'));
  try {
    const aFile = path.join(tmp, 'a.ts');
    fs.writeFileSync(aFile, 'export function f(x: number): number { return x + 1; }\n', 'utf8');
    const defEst = captureOutput(() => handleEstimate(['estimate']));
    assert.ok(defEst.includes('Timeout Limit: 65s') && defEst.includes('MEDIUM'));
    const lowEst = captureOutput(() => handleEstimate(['estimate', '5', '4', '1', '0']));
    assert.ok(lowEst.includes('Timeout Limit: 135s') && lowEst.includes('LOW'));
    assert.ok(captureOutput(() => handleSkeletonScan(tmp)).includes('Files Indexed:       1'));
    fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"m"}', 'utf8');
    fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'dist'), { recursive: true });
    const mutSrc = path.join(tmp, 'src', 'm.ts');
    fs.writeFileSync(mutSrc, 'export function inc(x: number): number { return x + 1; }\n', 'utf8');
    fs.writeFileSync(path.join(tmp, 'dist', 'm.js'), 'exports.inc = x => x + 1;\n', 'utf8');
    fs.writeFileSync(path.join(tmp, 'dist', 'm.test.js'), "const test=require('node:test'),a=require('node:assert/strict'),{inc}=require('./m.js');test('i',()=>a.equal(inc(1),2));\n", 'utf8');
    assert.ok(captureOutput(() => handleMutate(mutSrc)).includes('PASSED'));
    assert.ok(captureOutput(() => handleMutate(mutSrc, mutSrc)).includes('PASSED'));
    t.mock.method(process, 'exit', (code?: number) => { throw new Error(`EXIT:${code}`); });
    assert.throws(() => captureOutput(() => handleVerify(path.join(tmp, 'missing.ts'))), /EXIT:1/);
    assert.throws(() => captureOutput(() => handleSkeleton()), /EXIT:1/);
    assert.throws(() => captureOutput(() => handleSkeleton(path.join(tmp, 'missing.ts'))), /EXIT:1/);
    assert.throws(() => captureOutput(() => handleDiff()), /EXIT:1/);
    assert.throws(() => captureOutput(() => handleDiff('not a diff')), /EXIT:1/);
    assert.throws(() => captureOutput(() => handleMutate('missing.ts')), /EXIT:1/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
