import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as ts from 'typescript';
import { runFileMutationTest } from './mutation-runner.js';

function createTempPackage(opts: {
  esm?: boolean;
  tsCode: string;
  testJsCode: string;
  fileName?: string;
}): { root: string; srcFile: string; distJs: string; distBefore: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-mut-runner-test-'));
  const fileName = opts.fileName ?? 'calc.ts';
  const stem = fileName.replace(/\.(ts|mts)$/, '');
  const pkgJson: Record<string, unknown> = { name: 'mut-fixture', version: '1.0.0' };
  if (opts.esm) pkgJson.type = 'module';
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkgJson), 'utf8');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });

  const srcFile = path.join(root, 'src', fileName);
  fs.writeFileSync(srcFile, opts.tsCode, 'utf8');

  const transpiled = ts.transpileModule(opts.tsCode, {
    fileName: srcFile,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: opts.esm ? ts.ModuleKind.ESNext : ts.ModuleKind.CommonJS,
      esModuleInterop: true
    }
  });
  const distJs = path.join(root, 'dist', `${stem}.js`);
  fs.writeFileSync(distJs, transpiled.outputText, 'utf8');
  fs.writeFileSync(path.join(root, 'dist', `${stem}.test.js`), opts.testJsCode, 'utf8');
  return { root, srcFile, distJs, distBefore: transpiled.outputText };
}

test('runFileMutationTest kills CJS mutants without modifying dist on disk', () => {
  const fx = createTempPackage({
    tsCode: 'export function add(a: number, b: number): number {\n  return a + b;\n}\n',
    testJsCode: [
      "const test = require('node:test');",
      "const assert = require('node:assert/strict');",
      "const { add } = require('./calc.js');",
      "test('adds numbers', () => { assert.equal(add(2, 3), 5); });"
    ].join('\n')
  });
  try {
    const report = runFileMutationTest({ filePath: fx.srcFile, repoRoot: fx.root });
    assert.equal(report.baselinePassed, true);
    assert.equal(report.totalMutants, 1);
    assert.equal(report.killedMutants, 1);
    assert.equal(report.survivedMutants, 0);
    assert.equal(report.scorePercent, 100);
    assert.equal(report.passedThreshold, true);
    assert.equal(fs.readFileSync(fx.distJs, 'utf8'), fx.distBefore);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('runFileMutationTest detects survivors and fails threshold', () => {
  const fx = createTempPackage({
    tsCode: 'export function calc(a: number, b: number): number {\n  if (a > 10) return a - b;\n  return a + b;\n}\n',
    testJsCode: [
      "const test = require('node:test');",
      "const assert = require('node:assert/strict');",
      "const { calc } = require('./calc.js');",
      "test('small inputs only', () => { assert.equal(calc(2, 3), 5); });"
    ].join('\n')
  });
  try {
    const report = runFileMutationTest({ filePath: fx.srcFile, repoRoot: fx.root, thresholdPercent: 80 });
    assert.equal(report.baselinePassed, true);
    assert.ok(report.survivedMutants >= 1);
    assert.ok(report.survivors.length >= 1);
    assert.equal(report.passedThreshold, false);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('runFileMutationTest fails closed on missing source, missing dist, missing tests, and failing baseline', () => {
  const missing = runFileMutationTest({ filePath: 'does/not/exist.ts', repoRoot: os.tmpdir() });
  assert.equal(missing.baselinePassed, false);
  assert.equal(missing.passedThreshold, false);

  const fx = createTempPackage({
    tsCode: 'export function ok(): boolean { return true; }\n',
    testJsCode: "const test = require('node:test');\nconst assert = require('node:assert/strict');\ntest('fail', () => { assert.equal(1, 2); });\n"
  });
  try {
    const baseFail = runFileMutationTest({ filePath: fx.srcFile, repoRoot: fx.root });
    assert.equal(baseFail.baselinePassed, false);
    assert.equal(baseFail.passedThreshold, false);

    fs.rmSync(path.join(fx.root, 'dist', 'calc.test.js'));
    const noTests = runFileMutationTest({ filePath: fx.srcFile, repoRoot: fx.root });
    assert.equal(noTests.baselinePassed, false);

    fs.rmSync(fx.distJs);
    const noDist = runFileMutationTest({ filePath: fx.srcFile, repoRoot: fx.root });
    assert.equal(noDist.baselinePassed, false);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('runFileMutationTest skips compile-error mutants and samples deterministically', () => {
  const tsCode = [
    'export function fn(x: Array<number > | null): number {',
    '  const a = 1 + 2;',
    '  const b = 3 + 4;',
    '  const c = 5 + 6;',
    '  return x ? a + b + c : 0;',
    '}'
  ].join('\n');
  const fx = createTempPackage({
    tsCode,
    testJsCode: [
      "const test = require('node:test');",
      "const assert = require('node:assert/strict');",
      "const { fn } = require('./calc.js');",
      "test('fn works', () => { assert.equal(fn([1]), 21); assert.equal(fn(null), 0); });"
    ].join('\n')
  });
  try {
    const report = runFileMutationTest({ filePath: fx.srcFile, repoRoot: fx.root, maxMutants: 2 });
    assert.equal(report.baselinePassed, true);
    assert.ok(report.skippedCompileErrors >= 1);
    assert.equal(report.sampledMutants, 2);
    assert.equal(report.killedMutants, 2);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('runFileMutationTest kills infinite-loop mutants via bounded timeout', () => {
  const tsCode = [
    'export function countDown(n: number): number {',
    '  let total = 0;',
    '  for (let i = n; i > 0; i = i - 1) {',
    '    total = total + 1;',
    '  }',
    '  return total;',
    '}'
  ].join('\n');
  const fx = createTempPackage({
    tsCode,
    testJsCode: [
      "const test = require('node:test');",
      "const assert = require('node:assert/strict');",
      "const { countDown } = require('./calc.js');",
      "test('counts down', () => { assert.equal(countDown(3), 3); });"
    ].join('\n')
  });
  try {
    const report = runFileMutationTest({ filePath: fx.srcFile, repoRoot: fx.root, testTimeoutMs: 1500 });
    assert.equal(report.baselinePassed, true);
    assert.equal(report.killedMutants, report.sampledMutants);
    assert.equal(report.passedThreshold, true);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('runFileMutationTest intercepts ESM modules via node:module register() without mutating dist', () => {
  const fx = createTempPackage({
    esm: true,
    tsCode: 'export function mul(a: number, b: number): number {\n  return a + b;\n}\n',
    testJsCode: [
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      "import { mul } from './calc.js';",
      "test('esm test', () => { assert.equal(mul(4, 5), 9); });"
    ].join('\n')
  });
  try {
    const report = runFileMutationTest({ filePath: fx.srcFile, repoRoot: fx.root });
    assert.equal(report.baselinePassed, true);
    assert.equal(report.killedMutants, 1);
    assert.equal(report.scorePercent, 100);
    assert.equal(fs.readFileSync(fx.distJs, 'utf8'), fx.distBefore);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});

test('runFileMutationTest handles .cts -> .cjs in ESM package and fails closed when all mutants fail compile', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-mut-cts-'));
  try {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'cts-pkg', type: 'module' }), 'utf8');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    const ctsFile = path.join(root, 'src', 'mod.cts');
    fs.writeFileSync(ctsFile, 'export function add(a: number, b: number): number { return a + b; }\n', 'utf8');
    fs.writeFileSync(path.join(root, 'dist', 'mod.cjs'), 'exports.add = (a, b) => a + b;\n', 'utf8');
    fs.writeFileSync(path.join(root, 'dist', 'mod.test.cjs'), "const test=require('node:test'), assert=require('node:assert/strict'), {add}=require('./mod.cjs'); test('cts', () => assert.equal(add(2, 3), 5));\n", 'utf8');
    const ctsReport = runFileMutationTest({ filePath: ctsFile, repoRoot: path.dirname(root) });
    assert.equal(ctsReport.baselinePassed, true);
    assert.equal(ctsReport.killedMutants, 1);
    assert.equal(ctsReport.passedThreshold, true);

    const brokenTs = path.join(root, 'src', 'broken.ts');
    fs.writeFileSync(brokenTs, 'export function len(x: Array<number > | null): number { return x ? x.length : 0; }\n', 'utf8');
    fs.writeFileSync(path.join(root, 'dist', 'broken.js'), 'export function len(x) { return x ? x.length : 0; }\n', 'utf8');
    fs.writeFileSync(path.join(root, 'dist', 'broken.test.js'), "import test from 'node:test'; import assert from 'node:assert/strict'; import {len} from './broken.js'; test('len', () => assert.equal(len([1]), 1));\n", 'utf8');
    const compileFailReport = runFileMutationTest({ filePath: brokenTs, repoRoot: root });
    assert.equal(compileFailReport.baselinePassed, true);
    assert.ok(compileFailReport.totalMutants >= 1);
    assert.equal(compileFailReport.skippedCompileErrors, compileFailReport.totalMutants);
    assert.equal(compileFailReport.scorePercent, 0);
    assert.equal(compileFailReport.passedThreshold, false);
    assert.match(compileFailReport.reason ?? '', /failed TypeScript compilation/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runFileMutationTest selects dependent tests via reverse imports and skips unrelated failing tests', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-mut-dep-'));
  try {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'dep-pkg' }), 'utf8');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    const helperTs = path.join(root, 'src', 'helper.ts');
    fs.writeFileSync(helperTs, 'export function inc(x: number): number { return x + 1; }\n', 'utf8');
    fs.writeFileSync(path.join(root, 'dist', 'helper.js'), 'exports.inc = (x) => x + 1;\n', 'utf8');
    fs.writeFileSync(path.join(root, 'dist', 'consumer.js'), "const { inc } = require('./helper'); exports.run = (x) => inc(x);\n", 'utf8');
    fs.writeFileSync(path.join(root, 'dist', 'suite.test.js'), "const test=require('node:test'), assert=require('node:assert/strict'), {run}=require('./consumer.js'); test('dep', () => assert.equal(run(1), 2));\n", 'utf8');
    fs.writeFileSync(path.join(root, 'dist', 'unrelated.test.js'), "const test=require('node:test'), assert=require('node:assert/strict'); test('fail', () => assert.equal(1, 2));\n", 'utf8');
    const depReport = runFileMutationTest({ filePath: helperTs, repoRoot: root });
    assert.equal(depReport.baselinePassed, true);
    assert.equal(depReport.killedMutants, 1);
    assert.equal(depReport.passedThreshold, true);
    assert.equal(runFileMutationTest({ filePath: helperTs, repoRoot: root, maxMutants: 0 }).sampledMutants, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runFileMutationTest scopes mutants to changedLines when provided', () => {
  const fx = createTempPackage({
    tsCode: 'export function a(x: number): number { return x + 1; }\nexport function b(x: number): number { return x - 1; }\n',
    testJsCode: [
      "const test = require('node:test');",
      "const assert = require('node:assert/strict');",
      "const { a } = require('./calc.js');",
      "test('only tests a', () => { assert.equal(a(2), 3); });"
    ].join('\n')
  });
  try {
    const passReport = runFileMutationTest({ filePath: fx.srcFile, repoRoot: fx.root, changedLines: new Set([1]) });
    assert.equal(passReport.totalMutants, 1);
    assert.equal(passReport.scorePercent, 100);
    assert.equal(passReport.passedThreshold, true);
    const failReport = runFileMutationTest({ filePath: fx.srcFile, repoRoot: fx.root, changedLines: new Set([2]) });
    assert.equal(failReport.totalMutants, 1);
    assert.equal(failReport.scorePercent, 0);
    assert.equal(failReport.passedThreshold, false);
    const emptyReport = runFileMutationTest({ filePath: fx.srcFile, repoRoot: fx.root, changedLines: new Set([99]) });
    assert.equal(emptyReport.totalMutants, 0);
    assert.equal(emptyReport.passedThreshold, true);
  } finally {
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
});
