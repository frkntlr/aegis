import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  REPO_ROOT,
  createTempWorkspace,
  runAegisCli
} from './helpers/cli-runner.mjs';
import { countLines } from './helpers/gate-helpers.mjs';

function makeLines(n, trailingNewline = true) {
  const body = Array.from({ length: n }, (_, i) => `export const v${i}: number = ${i};`).join('\n');
  return trailingNewline ? `${body}\n` : body;
}

function makeFuncLines(n) {
  const body = Array.from({ length: n - 3 }, (_, i) => `  const k${i}: number = ${i};`).join('\n');
  return `export function fn(): number {\n${body}\n  return 0;\n}\n`;
}

function runCageJson(wsDir, subDir = 'src') {
  const res = runAegisCli(['cage:check', subDir, '--json', '--no-cache'], {
    cwd: wsDir,
    env: { AEGIS_WORKSPACE: wsDir }
  });
  return { res, json: JSON.parse(res.stdout) };
}

function testDepsDriftSyncForwardsFlagAndWritesLedgers(t) {
  const ws = createTempWorkspace('aegis-f06-sync-');
  t.after(ws.cleanup);
  fs.writeFileSync(path.join(ws.dir, 'package.json'), JSON.stringify({ name: 'tmp-sync', version: '1.0.0' }));
  fs.writeFileSync(path.join(ws.dir, 'package-lock.json'), JSON.stringify({ name: 'tmp-sync', lockfileVersion: 3 }));
  const res = runAegisCli(['deps:drift', '--sync'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /\(Sync Mode\)/);
  assert.ok(fs.existsSync(path.join(ws.dir, '.aegis/cache/metadata.lock')), 'metadata.lock must be created');
  assert.ok(fs.existsSync(path.join(ws.dir, '.aegis/cache/context7/lockfiles.hash')), 'lockfiles.hash must be created');
}

function testDepsSyncClearsNpmDrift(t) {
  const ws = createTempWorkspace('aegis-f06-dsync-');
  t.after(ws.cleanup);
  fs.writeFileSync(path.join(ws.dir, 'package.json'), JSON.stringify({ name: 'tmp-dsync', version: '1.0.0' }));
  fs.writeFileSync(path.join(ws.dir, 'package-lock.json'), JSON.stringify({ name: 'tmp-dsync', lockfileVersion: 3 }));
  const syncRes = runAegisCli(['deps:sync'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.equal(syncRes.status, 0, syncRes.stderr);
  assert.match(syncRes.stdout, /\(Sync Mode\)/);
  const driftRes = runAegisCli(['deps:drift'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.match(driftRes.stdout, /\[NPM\]\s+✅\s+SYNCED/);
}

function testCageCheckEnforcesAnyAndEmptyCatch(t) {
  const ws = createTempWorkspace('aegis-f06-cage-');
  t.after(ws.cleanup);
  const srcDir = path.join(ws.dir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'ok.ts'), 'export const x: number = 1;\n', 'utf8');
  const cleanRun = runCageJson(ws.dir, 'src');
  assert.equal(cleanRun.res.status, 0);
  assert.equal(cleanRun.json.clean, true);
  fs.writeFileSync(path.join(srcDir, 'bad.ts'), 'export const x: any = 1;\ntry { x(); } catch {}\n', 'utf8');
  const dirtyRun = runCageJson(ws.dir, 'src');
  assert.equal(dirtyRun.res.status, 1);
  assert.equal(dirtyRun.json.clean, false);
  const rules = dirtyRun.json.violations.map((v) => v.rule);
  assert.ok(rules.includes('TS_001_NO_ANY') && rules.includes('TS_002_EMPTY_CATCH'));
}

function testLineBudgetRadarIncludes299And300LineFiles(t) {
  const ws = createTempWorkspace('aegis-f06-radar-');
  t.after(ws.cleanup);
  const srcDir = path.join(ws.dir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  const f299 = path.join(srcDir, 'l299.ts');
  const f300 = path.join(srcDir, 'l300.ts');
  fs.writeFileSync(f299, makeLines(299, true), 'utf8');
  fs.writeFileSync(f300, makeLines(300, true), 'utf8');
  assert.equal(countLines(f299), 299);
  assert.equal(countLines(f300), 300);
  const { res, json } = runCageJson(ws.dir, 'src');
  assert.equal(res.status, 0);
  assert.equal(json.clean, true);
  const alerted = new Set(json.radarAlerts.map((a) => path.basename(a.file)));
  assert.ok(alerted.has('l299.ts'), '299-line LF file must appear in radarAlerts');
  assert.ok(alerted.has('l300.ts'), '300-line LF file must appear in radarAlerts');
}

function testCageCheckCoversAddonsGdFiles(t) {
  const ws = createTempWorkspace('aegis-f06-gd-');
  t.after(ws.cleanup);
  const gdDir = path.join(ws.dir, 'addons/aegis_bridge');
  fs.mkdirSync(gdDir, { recursive: true });
  fs.writeFileSync(path.join(gdDir, 'bad.gd'), 'extends Node\nfunc _ready():\n\tget_parent().queue_free()\n', 'utf8');
  const { res, json } = runCageJson(ws.dir, '.');
  assert.equal(res.status, 1, 'cage:check must scan addons/aegis_bridge/*.gd and flag violations');
  assert.equal(json.clean, false);
  assert.ok(json.filesScanned >= 1);
}

function testFileLineLimit300Vs301Boundary(t) {
  const ws = createTempWorkspace('aegis-f06-300-');
  t.after(ws.cleanup);
  const srcDir = path.join(ws.dir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'nolf.ts'), makeLines(300, false), 'utf8');
  fs.writeFileSync(path.join(srcDir, 'withlf.ts'), makeLines(300, true), 'utf8');
  assert.equal(runCageJson(ws.dir, 'src').res.status, 0, '300 lines with or without trailing LF must pass');
  fs.writeFileSync(path.join(srcDir, 'over.ts'), makeLines(301, true), 'utf8');
  const over = runCageJson(ws.dir, 'src');
  assert.equal(over.res.status, 1);
  assert.ok(over.json.violations.some((v) => v.rule === 'MAX_FILE_LINES'));
}

function testFuncLineLimit40Vs41Boundary(t) {
  const ws = createTempWorkspace('aegis-f06-fn-');
  t.after(ws.cleanup);
  const srcDir = path.join(ws.dir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'fn.ts'), makeFuncLines(40), 'utf8');
  assert.equal(runCageJson(ws.dir, 'src').res.status, 0, '40-line function must pass');
  fs.writeFileSync(path.join(srcDir, 'fn.ts'), makeFuncLines(41), 'utf8');
  const over = runCageJson(ws.dir, 'src');
  assert.equal(over.res.status, 1);
  assert.ok(over.json.violations.some((v) => v.rule === 'MAX_FUNCTION_LINES'));
}

function testAnyLiteralVsExplicitAnyType(t) {
  const ws = createTempWorkspace('aegis-f06-any-');
  t.after(ws.cleanup);
  const srcDir = path.join(ws.dir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'safe.ts'), 'export const word = "any"; // any\n', 'utf8');
  assert.equal(runCageJson(ws.dir, 'src').res.status, 0, 'String literal "any" must pass');
  fs.writeFileSync(path.join(srcDir, 'unsafe.ts'), 'export const bad: any = 1;\n', 'utf8');
  const fail = runCageJson(ws.dir, 'src');
  assert.equal(fail.res.status, 1);
  assert.ok(fail.json.violations.some((v) => v.rule === 'TS_001_NO_ANY'));
}

function testCageCheckMissingAndEmptyDirFailsClosed(t) {
  const ws = createTempWorkspace('aegis-f06-empty-');
  t.after(ws.cleanup);
  fs.mkdirSync(path.join(ws.dir, 'empty'), { recursive: true });
  const miss = runCageJson(ws.dir, 'missing-dir');
  assert.equal(miss.res.status, 1);
  assert.equal(miss.json.clean, false);
  assert.equal(typeof miss.json.error, 'string');
  const empty = runCageJson(ws.dir, 'empty');
  assert.equal(empty.res.status, 1);
  assert.equal(empty.json.clean, false);
}

function testBiomeAndGitHooksParity() {
  const biome = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'biome.json'), 'utf8'));
  const includes = biome.files?.includes ?? [];
  assert.ok(includes.some((p) => p.includes('scripts/')), 'biome.json must include scripts/*.{js,cjs}');
  assert.ok(includes.some((p) => p.includes('bundle.mjs')), 'biome.json must include packages/cli/scripts/bundle.mjs');
  assert.notEqual(biome.linter?.rules?.suspicious?.noEmptyBlockStatements, 'off', 'biome.json must enable noEmptyBlockStatements');
  const preCommit = fs.readFileSync(path.join(REPO_ROOT, '.githooks/pre-commit'), 'utf8');
  const prePush = fs.readFileSync(path.join(REPO_ROOT, '.githooks/pre-push'), 'utf8');
  for (const hook of [preCommit, prePush]) {
    assert.match(hook, /lint/, 'git hook must invoke lint');
    assert.match(hook, /typecheck/, 'git hook must invoke typecheck');
  }
}

function registerTier1() {
  test('T1.1 aegis deps:drift --sync forwards --sync and writes lock ledgers', testDepsDriftSyncForwardsFlagAndWritesLedgers);
  test('T1.2 aegis deps:sync clears npm drift', testDepsSyncClearsNpmDrift);
  test('T1.3 aegis cage:check enforces TS_001_NO_ANY and TS_002_EMPTY_CATCH', testCageCheckEnforcesAnyAndEmptyCatch);
  test('T1.4 LineBudgetRadar includes both 299-line and 300-line LF files in radarAlerts', testLineBudgetRadarIncludes299And300LineFiles);
  test('T1.5 aegis cage:check scans addons/aegis_bridge/*.gd files', testCageCheckCoversAddonsGdFiles);
}

function registerTier2() {
  test('T2.1 file line budget allows 300 lines (with/without LF) and rejects 301', testFileLineLimit300Vs301Boundary);
  test('T2.2 function line budget allows 40 lines and rejects 41', testFuncLineLimit40Vs41Boundary);
  test('T2.3 AST distinguishes "any" string literal from : any annotation', testAnyLiteralVsExplicitAnyType);
  test('T2.4 aegis cage:check fails closed on missing and empty directories', testCageCheckMissingAndEmptyDirFailsClosed);
  test('T2.5 biome.json scope/rules and .githooks lint+typecheck parity', testBiomeAndGitHooksParity);
}

describe('Tier 1: F06 CLI Arg Forwarding, Demir Kafes & Radar', registerTier1);
describe('Tier 2: F06 Boundary Values & Hook/Lint Parity', registerTier2);
