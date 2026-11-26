import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  REPO_ROOT,
  readPackageJson,
  runAegisCli,
  runGit,
  runNode
} from './helpers/cli-runner.mjs';
import { collectFiles, countLines } from './helpers/gate-helpers.mjs';

const COMPOUND_URL = pathToFileURL(
  path.join(REPO_ROOT, 'packages/core/compound-checker/dist/index.js')
).href;

function testCompoundCheckerManifestAndTsconfig() {
  const required = [
    'packages/core/compound-checker/package.json',
    'packages/core/compound-checker/src/index.ts',
    'packages/core/compound-checker/src/compounding-checker.ts',
    'packages/core/compound-checker/src/compounding-checker.test.ts',
    'packages/core/compound-checker/dist/index.js'
  ];
  for (const rel of required) {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, rel)), `Missing compound-checker artifact: ${rel}`);
  }
  const rootTs = readPackageJson('tsconfig.json');
  const refs = (rootTs.references ?? []).map((r) => r.path);
  assert.ok(refs.some((p) => p.includes('compound-checker')), 'Root tsconfig.json must reference compound-checker');
}

function testAllFifteenGitWorktreesPreserved() {
  const res = runGit(['worktree', 'list', '--porcelain'], REPO_ROOT);
  assert.equal(res.status, 0, `git worktree list failed: ${res.stderr}`);
  const worktrees = res.stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length).trim());
  assert.ok(worktrees.length >= 15, `Expected >= 15 preserved git worktrees, got ${worktrees.length}`);
  for (const name of ['contributor', 'docs', 'qa', 'solver']) {
    assert.ok(
      worktrees.some((wt) => wt.replace(/\\/g, '/').endsWith(`experimental/${name}`)),
      `Missing experimental/${name} worktree`
    );
  }
}

function testPreservedAuditFilesIntact() {
  const checks = [
    ['packages/cli/src/commands/nlm-auth-interactive.ts', /export\s+.*function/],
    ['packages/plugins/godot-bridge/src/godot-test-runner.ts', /GodotTestRunner/],
    ['packages/plugins/godot-bridge/src/godot-live-contract.test.ts', /describe|test/],
    ['packages/plugins/godot-bridge/gdscript/addons/aegis_bridge/ui_verifier.gd', /extends/],
    ['packages/plugins/godot-bridge/gdscript/addons/aegis_bridge/aegis_client.gd', /extends/]
  ];
  for (const [rel, pattern] of checks) {
    const abs = path.join(REPO_ROOT, rel);
    assert.ok(fs.existsSync(abs), `Preserved file missing: ${rel}`);
    const content = fs.readFileSync(abs, 'utf8');
    assert.ok(content.trim().length > 20, `Preserved file unexpectedly empty: ${rel}`);
    assert.match(content, pattern, `Preserved file missing expected symbol in ${rel}`);
  }
}

function testHardDemirKafesLineBudgetAcrossPackages() {
  const tsFiles = collectFiles(path.join(REPO_ROOT, 'packages'), ['.ts'])
    .filter((f) => !f.endsWith('.d.ts') && f.includes(`${path.sep}src${path.sep}`));
  assert.ok(tsFiles.length > 50, 'Expected >50 source files in packages/');
  const overBudget = [];
  for (const file of tsFiles) {
    const lines = countLines(file);
    if (lines > 300) overBudget.push(`${path.relative(REPO_ROOT, file)}:${lines}`);
  }
  assert.deepEqual(overBudget, [], `Files exceeding 300-line Demir Kafes budget: ${overBudget.join(', ')}`);
}

function testIss21RefactoredFilesBelowQuotaThreshold() {
  const targets = [
    'packages/core/orchestrator/src/teamwork-coordinator.ts',
    'packages/cli/src/commands/task-inbox.ts',
    'packages/cli/src/commands/teamwork-command.ts',
    'packages/cli/src/commands/rfc-pipeline-command.ts'
  ];
  const aboveThreshold = [];
  for (const rel of targets) {
    const abs = path.join(REPO_ROOT, rel);
    assert.ok(fs.existsSync(abs), `Missing ISS-21 target file: ${rel}`);
    const lines = countLines(abs);
    if (lines >= 280) aboveThreshold.push(`${rel}:${lines}`);
  }
  assert.deepEqual(aboveThreshold, [], `ISS-21 target files still >= 280 lines: ${aboveThreshold.join(', ')}`);
}

function testPreservedModifiedFilesRetainCoreSymbols() {
  const targets = [
    ['packages/cli/src/commands/godot-command.ts', /export\s+(?:async\s+)?function\s+handleGodot\b/],
    ['packages/cli/src/commands/nlm-command.ts', /export\s+(?:async\s+)?function\s+handleNlmQuery\b/],
    ['packages/plugins/godot-bridge/src/rpc/ws-bridge-server.ts', /class WsBridgeServer/]
  ];
  for (const [rel, symbolRe] of targets) {
    const abs = path.join(REPO_ROOT, rel);
    assert.ok(fs.existsSync(abs), `Missing preserved modified file: ${rel}`);
    assert.ok(countLines(abs) <= 300, `${rel} exceeds 300 lines`);
    assert.match(fs.readFileSync(abs, 'utf8'), symbolRe);
  }
}

function testCompoundCheckerUnitSuitePasses() {
  const testFile = path.join(REPO_ROOT, 'packages/core/compound-checker/dist/compounding-checker.test.js');
  const res = runNode(['--test', testFile], { cwd: REPO_ROOT });
  assert.equal(res.status, 0, `compound-checker unit tests failed: ${res.stdout}\n${res.stderr}`);
  assert.match(res.stdout, /pass\s+8\b/);
}

async function testCompoundCheckerBehavioralApi() {
  const { CompoundingErrorChecker } = await import(COMPOUND_URL);
  const ts = new Date().toISOString();
  const diffChecker = new CompoundingErrorChecker({ maxGrowthMultiplier: 2.5 });
  assert.equal(diffChecker.recordStep({ step: 1, changedFilesCount: 1, diffLinesCount: 10, failingTestsCount: 0, timestamp: ts }), null);
  assert.equal(diffChecker.recordStep({ step: 2, changedFilesCount: 1, diffLinesCount: 20, failingTestsCount: 0, timestamp: ts }), null);
  const runaway = diffChecker.recordStep({ step: 3, changedFilesCount: 2, diffLinesCount: 70, failingTestsCount: 0, timestamp: ts });
  assert.equal(runaway?.alert, 'RUNAWAY_DIFF');
  const regChecker = new CompoundingErrorChecker();
  regChecker.recordStep({ step: 1, changedFilesCount: 1, diffLinesCount: 5, failingTestsCount: 0, timestamp: ts });
  regChecker.recordStep({ step: 2, changedFilesCount: 1, diffLinesCount: 6, failingTestsCount: 1, timestamp: ts });
  const reg = regChecker.recordStep({ step: 3, changedFilesCount: 1, diffLinesCount: 7, failingTestsCount: 2, timestamp: ts });
  assert.equal(reg?.alert, 'TEST_REGRESSION');
  assert.equal(reg?.recommendedRollbackStep, 1);
  assert.equal(regChecker.getHistory().length, 3);
}

function testCliCageCheckCleanOnPackages() {
  const res = runAegisCli(['cage:check', '--json', '--no-cache'], { cwd: REPO_ROOT });
  assert.equal(res.status, 0, `cage:check failed: ${res.stderr}\n${res.stdout}`);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.clean, true);
  assert.equal(parsed.violations.length, 0);
  assert.ok(parsed.filesScanned > 500, `Expected >500 filesScanned, got ${parsed.filesScanned}`);
}

function testCliCageCheckZeroRadarAlertsOnIss21Targets() {
  const res = runAegisCli(['cage:check', '--json', '--no-cache'], { cwd: REPO_ROOT });
  assert.ok(res.stdout.trim().startsWith('{'), `Expected JSON from cage:check, got: ${res.stdout}\n${res.stderr}`);
  const parsed = JSON.parse(res.stdout);
  const watched = ['teamwork-coordinator.ts', 'task-inbox.ts', 'teamwork-command.ts', 'rfc-pipeline-command.ts'];
  const hit = (parsed.radarAlerts ?? []).filter((a) => watched.some((w) => String(a.file).includes(w)));
  assert.deepEqual(hit, [], `ISS-21 target files triggered LineBudgetRadar alerts: ${JSON.stringify(hit)}`);
}

function testReadOnlyCliCommandsPreserveWorktrees() {
  const before = runGit(['worktree', 'list', '--porcelain'], REPO_ROOT).stdout;
  const st = runAegisCli(['status'], { cwd: REPO_ROOT });
  assert.equal(st.status, 0, st.stderr);
  const tw = runAegisCli(['teamwork', 'status', '--json'], { cwd: REPO_ROOT });
  assert.equal(tw.status, 0, tw.stderr);
  const after = runGit(['worktree', 'list', '--porcelain'], REPO_ROOT).stdout;
  assert.equal(after, before, 'Read-only CLI commands must not alter git worktrees');
}

function registerTier1() {
  test('T1.1 @aegis/compound-checker manifest, dist, and tsconfig reference intact', testCompoundCheckerManifestAndTsconfig);
  test('T1.2 all 15 git worktrees remain preserved', testAllFifteenGitWorktreesPreserved);
  test('T1.3 ISS-34 preserved files and Godot/NLM artifacts remain intact', testPreservedAuditFilesIntact);
  test('T1.4 all packages/**/src/*.ts satisfy <= 300-line Demir Kafes budget', testHardDemirKafesLineBudgetAcrossPackages);
  test('T1.5 ISS-21 refactored files stay safely below 280-line quota threshold', testIss21RefactoredFilesBelowQuotaThreshold);
  test('T1.6 preserved modified CLI and WS bridge files retain core symbols', testPreservedModifiedFilesRetainCoreSymbols);
}

function registerTier2() {
  test('T2.1 @aegis/compound-checker unit test suite passes 8/8', testCompoundCheckerUnitSuitePasses);
  test('T2.2 CompoundingErrorChecker behavioral alerts trigger on runaway diff & regression', testCompoundCheckerBehavioralApi);
  test('T2.3 CLI cage:check --json --no-cache reports 100% clean across packages', testCliCageCheckCleanOnPackages);
  test('T2.4 CLI cage:check --json reports zero radarAlerts on ISS-21 targets', testCliCageCheckZeroRadarAlertsOnIss21Targets);
  test('T2.5 read-only CLI commands leave all git worktrees unmodified', testReadOnlyCliCommandsPreserveWorktrees);
}

describe('Tier 1: F12 Line Budgets, Worktrees & Preservations Contracts', registerTier1);
describe('Tier 2: F12 CompoundChecker, Cage Check & Worktree Preservation', registerTier2);
