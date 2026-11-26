import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  hasUnsafePathSyntax,
  isPathWithinBase,
  isSafeIdentifier,
  isSafePackageName,
  isSafeTopicName,
  requireExistingRepoRoot,
  resolveContainedPath
} from './path-containment.js';
import { AegisEngineService } from './engine-service.js';
import { EngineAnalysisTools } from './engine-analysis-tools.js';

function createSymlinkOrSkip(target: string, linkPath: string, type: 'file' | 'dir' | 'junction'): boolean {
  try {
    fs.symlinkSync(target, linkPath, type);
    return true;
  } catch {
    return false;
  }
}

test('path-containment primitives reject unsafe syntax, prefix collisions, symlinks, and missing roots', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-pc-base-'));
  const sibling = `${base}-evil`;
  fs.mkdirSync(sibling, { recursive: true });
  try {
    assert.strictEqual(hasUnsafePathSyntax(''), true);
    assert.strictEqual(hasUnsafePathSyntax('   '), true);
    assert.strictEqual(hasUnsafePathSyntax('a\0b'), true);
    assert.strictEqual(hasUnsafePathSyntax('\\\\?\\C:\\Windows'), true);
    assert.strictEqual(hasUnsafePathSyntax('C:relative.ts'), true);
    assert.strictEqual(hasUnsafePathSyntax('src/index.ts'), false);
    assert.strictEqual(isPathWithinBase(base, sibling), false);
    assert.strictEqual(isPathWithinBase(base, path.join(base, 'src')), true);
    assert.strictEqual(requireExistingRepoRoot(undefined).ok, true);
    assert.strictEqual(requireExistingRepoRoot('   ').ok, false);
    assert.strictEqual(requireExistingRepoRoot(path.join(base, 'missing')).ok, false);
    assert.strictEqual(requireExistingRepoRoot(base).ok, true);
    assert.strictEqual(resolveContainedPath(base, '..\\outside').ok, false);
    assert.strictEqual(resolveContainedPath(base, path.join(sibling, 'x.ts'), { allowNonExistent: true }).ok, false);
    assert.strictEqual(resolveContainedPath(base, 'sub/new.ts', { allowNonExistent: true }).ok, true);
    assert.strictEqual(resolveContainedPath(base, 'sub/new.ts', { allowNonExistent: false }).ok, false);
    const linkDir = path.join(base, 'escape-junction');
    if (createSymlinkOrSkip(sibling, linkDir, process.platform === 'win32' ? 'junction' : 'dir')) {
      assert.strictEqual(resolveContainedPath(base, 'escape-junction/x.ts', { allowNonExistent: true }).ok, false);
    }

    assert.strictEqual(isSafeIdentifier('solver'), true);
    assert.strictEqual(isSafeIdentifier('../evil'), false);
    assert.strictEqual(isSafeIdentifier(''), false);
    assert.strictEqual(isSafePackageName('@aegis/shared'), true);
    assert.strictEqual(isSafePackageName('../../evil'), false);
    assert.strictEqual(isSafeTopicName('node-test'), true);
    assert.strictEqual(isSafeTopicName('(a+)+$'), false);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
    fs.rmSync(sibling, { recursive: true, force: true });
  }
});

test('AegisEngineService.runMutationGate blocks traversal and missing repoRoot without executing outside tests', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-mut-trav-'));
  const repo = path.join(parent, 'repo');
  const outside = path.join(parent, 'outside');
  const marker = path.join(outside, 'EXECUTED.txt');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.mkdirSync(path.join(outside, 'src'), { recursive: true });
  fs.mkdirSync(path.join(outside, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(outside, 'package.json'), JSON.stringify({ name: 'out-pkg' }), 'utf8');
  fs.writeFileSync(path.join(outside, 'src', 'pwn.ts'), 'export const x = 1 + 2;\n', 'utf8');
  fs.writeFileSync(path.join(outside, 'dist', 'pwn.js'), 'exports.x = 1 + 2;\n', 'utf8');
  fs.writeFileSync(path.join(outside, 'dist', 'pwn.test.js'), `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'pwn');\n`, 'utf8');
  try {
    const svc = new AegisEngineService(repo);
    const relEsc = svc.runMutationGate('..\\outside\\src\\pwn.ts');
    assert.strictEqual(relEsc.passed, false);
    assert.strictEqual(relEsc.unavailable, true);
    assert.strictEqual(fs.existsSync(marker), false);

    const absEsc = svc.runMutationGate(path.join(outside, 'src', 'pwn.ts'));
    assert.strictEqual(absEsc.passed, false);
    assert.strictEqual(absEsc.unavailable, true);
    assert.strictEqual(fs.existsSync(marker), false);

    const missingSvc = new AegisEngineService(path.join(parent, 'does-not-exist'));
    const missingRes = missingSvc.runMutationGate('src/pwn.ts');
    assert.strictEqual(missingRes.passed, false);
    assert.strictEqual(missingRes.unavailable, true);
    assert.strictEqual(missingRes.file, 'src/pwn.ts');

    const nonExistentTarget = svc.runMutationGate('src/missing.ts');
    assert.strictEqual(nonExistentTarget.passed, false);
    assert.strictEqual(nonExistentTarget.unavailable, true);
    assert.ok(String(nonExistentTarget.reason).includes('Target path does not exist'));
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('AegisEngineService.runUiInspector and runDiffValidator block traversal, symlinks, and missing repoRoot', async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-ui-trav-'));
  const repo = path.join(parent, 'repo');
  const outside = path.join(parent, 'outside');
  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  const secretJson = path.join(outside, 'secret.json');
  fs.writeFileSync(secretJson, JSON.stringify([{ id: 'Out', x: 0, y: 0, width: 10, height: 10 }]), 'utf8');
  try {
    const svc = new AegisEngineService(repo);
    assert.strictEqual(svc.runUiInspector('..\\outside\\secret.json').unavailable, true);
    assert.strictEqual(svc.runUiInspector(secretJson).unavailable, true);

    const linkFile = path.join(repo, 'link.json');
    if (createSymlinkOrSkip(secretJson, linkFile, 'file')) {
      assert.strictEqual(svc.runUiInspector('link.json').unavailable, true);
    }
    const missingSvc = new AegisEngineService(path.join(parent, 'missing-root'));
    assert.strictEqual(missingSvc.runUiInspector().unavailable, true);
    assert.strictEqual((await missingSvc.runDiffValidator()).isSurgical, false);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('AegisEngineService.runOracleAudit rejects outside paths, mixed arrays, symlinks, and missing repoRoot', async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-orc-trav-'));
  const repo = path.join(parent, 'repo');
  const outside = path.join(parent, 'outside');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.mkdirSync(path.join(repo, '.aegis', 'cache'), { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(repo, 'src', 'mod.ts'), 'export const val = 1;\n', 'utf8');
  fs.writeFileSync(path.join(repo, 'src', 'mod.test.ts'), "import * as assert from 'node:assert';\nassert.strictEqual(1, 1);\n", 'utf8');
  fs.writeFileSync(path.join(repo, '.aegis', 'cache', 'last-test-run.json'), JSON.stringify({ numPassedTests: 1, numFailedTests: 0 }), 'utf8');
  fs.writeFileSync(path.join(outside, 'leak.ts'), 'export const s = 1;\n', 'utf8');
  fs.writeFileSync(path.join(outside, 'leak.test.ts'), "import * as assert from 'node:assert';\nassert.strictEqual(1, 1);\n", 'utf8');
  try {
    const svc = new AegisEngineService(repo);
    const single = await svc.runOracleAudit(['..\\outside\\leak.ts']);
    assert.strictEqual(single.verdict, 'REJECTED');
    assert.strictEqual(single.suspicious, true);

    const mixed = await svc.runOracleAudit(['src/mod.ts', '..\\outside\\leak.ts']);
    assert.strictEqual(mixed.verdict, 'REJECTED');
    assert.strictEqual(mixed.suspicious, true);

    const linkTarget = path.join(repo, 'src', 'link.test.ts');
    if (createSymlinkOrSkip(path.join(outside, 'leak.test.ts'), linkTarget, 'file')) {
      const symRes = await svc.runOracleAudit(['src/link.test.ts']);
      assert.strictEqual(symRes.verdict, 'REJECTED');
    }
    const missing = await new AegisEngineService(path.join(parent, 'missing')).runOracleAudit(['src/mod.ts']);
    assert.strictEqual(missing.verdict, 'UNAVAILABLE');
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('EngineAnalysisTools enforces containment, skips symlinks, and fails closed on missing repoRoot across all 8 methods', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-tools-trav-'));
  const repo = path.join(parent, 'repo');
  const sibling = path.join(parent, 'repo-evil');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.mkdirSync(sibling, { recursive: true });
  const evilFile = path.join(sibling, 'evil.ts');
  fs.writeFileSync(evilFile, 'export const x: any = 1;\n', 'utf8');
  try {
    const tools = new EngineAnalysisTools(repo);
    assert.strictEqual(tools.runCageCheck('..\\repo-evil').unavailable, true);
    assert.strictEqual(tools.runCageCheck(sibling).unavailable, true);
    assert.strictEqual(tools.runBugTriage('..\\repo-evil').unavailable, true);
    assert.strictEqual(tools.runAstSearch('class $N', '..\\repo-evil').unavailable, true);
    assert.strictEqual(tools.runMemoryQuery('Foo', '../evil').unavailable, true);
    assert.strictEqual(tools.runMemoryStats('').unavailable, true);
    assert.strictEqual(tools.runContext7Query('../../evil', 'x').unavailable, true);
    assert.strictEqual(tools.runContext7Query('godot4', '(a+)+$').unavailable, true);

    if (createSymlinkOrSkip(evilFile, path.join(repo, 'src', 'sym.ts'), 'file')) {
      assert.strictEqual(tools.runCageCheck('src').filesScanned, 0);
    }
    const missing = new EngineAnalysisTools(path.join(parent, 'missing-root'));
    assert.strictEqual(missing.runCageCheck().unavailable, true);
    assert.strictEqual(missing.runBugTriage().unavailable, true);
    assert.strictEqual(missing.runSymbolFind('X').unavailable, true);
    assert.strictEqual(missing.runRelationalTrace('X').unavailable, true);
    assert.strictEqual(missing.runMemoryQuery('X', 'wt').unavailable, true);
    assert.strictEqual(missing.runMemoryStats('wt').unavailable, true);
    assert.strictEqual(missing.runAstSearch('class $N').unavailable, true);
    assert.strictEqual(missing.runContext7Query('godot4', 'lifecycle').unavailable, true);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
