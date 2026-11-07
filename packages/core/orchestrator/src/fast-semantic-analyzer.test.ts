import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { FastSemanticAnalyzer } from './fast-semantic-analyzer.js';

test('FastSemanticAnalyzer extracts normalized keywords ignoring stop words', () => {
  const analyzer = new FastSemanticAnalyzer();
  const kw = analyzer.extractKeywords('Fix the tokenRefresh and session_cache in auth service with turbo');
  assert.ok(kw.includes('token'));
  assert.ok(kw.includes('refresh'));
  assert.ok(kw.includes('session'));
  assert.ok(kw.includes('cache'));
  assert.ok(kw.includes('auth'));
  assert.ok(kw.includes('service'));
  assert.ok(!kw.includes('the'));
  assert.ok(!kw.includes('with'));
  assert.ok(!kw.includes('in'));
});

test('FastSemanticAnalyzer scores files and auto-discovers relevant targets', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-analyzer-test-'));
  const srcDir = path.join(tmpDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  fs.writeFileSync(path.join(srcDir, 'auth-service.ts'), 'export class AuthService {}', 'utf8');
  fs.writeFileSync(path.join(srcDir, 'session-cache.ts'), 'export class SessionCache {}', 'utf8');
  fs.writeFileSync(path.join(srcDir, 'other-module.ts'), 'export class OtherModule {}', 'utf8');

  try {
    const analyzer = new FastSemanticAnalyzer(tmpDir);
    const result = analyzer.analyze('Improve auth-service and session-cache performance');

    assert.ok(result.targetFiles.length >= 2);
    assert.ok(result.targetFiles.some(f => f.includes('auth-service.ts')));
    assert.ok(result.targetFiles.some(f => f.includes('session-cache.ts')));
    assert.ok(result.confidence > 0);
    assert.ok(result.durationMs < 500);

    // Test caching on second run
    const second = analyzer.analyze('auth session');
    assert.strictEqual(second.fromCache, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('FastSemanticAnalyzer respects explicit files when provided', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-analyzer-explicit-'));
  try {
    const analyzer = new FastSemanticAnalyzer(tmpDir);
    const explicit = ['src/custom-entry.ts'];
    const res = analyzer.analyze('arbitrary objective', explicit);
    assert.ok(res.targetFiles.includes('src/custom-entry.ts'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('FastSemanticAnalyzer creates and utilizes persistent disk cache with git index validation', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-analyzer-disk-'));
  const gitDir = path.join(tmpDir, '.git');
  fs.mkdirSync(gitDir, { recursive: true });
  fs.writeFileSync(path.join(gitDir, 'index'), 'dummy-index-content', 'utf8');

  const srcDir = path.join(tmpDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'module.ts'), 'export const x = 1;', 'utf8');

  try {
    const analyzer1 = new FastSemanticAnalyzer(tmpDir);
    const files1 = analyzer1.listCandidateFiles();
    assert.ok(files1.includes('src/module.ts'));

    const manifestPath = path.join(tmpDir, '.aegis', 'cache', 'fast-semantic-manifest.json');
    assert.ok(fs.existsSync(manifestPath));
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.ok(Array.isArray(manifest.files));
    assert.strictEqual(typeof manifest.gitIndexMtime, 'number');

    const analyzer2 = new FastSemanticAnalyzer(tmpDir);
    const t0 = Date.now();
    const files2 = analyzer2.listCandidateFiles();
    const duration = Date.now() - t0;
    assert.deepStrictEqual(files2, files1);
    assert.ok(duration < 500, `Cached disk candidate lookup took ${duration}ms, expected fast cache hit`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('FastSemanticAnalyzer expands Turkish multi-agent and task synonyms', () => {
  const analyzer = new FastSemanticAnalyzer();
  const kw = analyzer.extractKeywords('çoklu ajan mimarisinde görevleri dağıt, parçalara böl ve performans optimizasyonu sağla');
  assert.ok(kw.includes('multi'));
  assert.ok(kw.includes('teamwork'));
  assert.ok(kw.includes('agent'));
  assert.ok(kw.includes('shard'));
  assert.ok(kw.includes('decompose'));
  assert.ok(kw.includes('performance'));
});

test('FastSemanticAnalyzer penalizes test files and boosts packages/*/src/ implementation files', () => {
  const analyzer = new FastSemanticAnalyzer();
  const implFile = 'packages/core/orchestrator/src/branch-reconciler.ts';
  const testFile1 = 'packages/core/orchestrator/src/branch-reconciler.test.ts';
  const specFile = 'packages/core/orchestrator/src/branch-reconciler.spec.ts';
  const testsDirFile = 'packages/core/orchestrator/__tests__/branch-reconciler.ts';

  const kw = ['branch', 'reconciler'];

  // Without test intent: implementation file receives +15 boost, test files penalized by -15
  const implScore = analyzer.scoreCandidate(implFile, kw, false);
  const testScore1 = analyzer.scoreCandidate(testFile1, kw, false);
  const specScore = analyzer.scoreCandidate(specFile, kw, false);
  const testsDirScore = analyzer.scoreCandidate(testsDirFile, kw, false);

  assert.ok(implScore > testScore1, `Expected implScore (${implScore}) > testScore1 (${testScore1})`);
  assert.ok(implScore > specScore, `Expected implScore (${implScore}) > specScore (${specScore})`);
  assert.ok(implScore > testsDirScore, `Expected implScore (${implScore}) > testsDirScore (${testsDirScore})`);
  assert.strictEqual(implScore - testScore1, 30, 'Implementation file should have 30 points advantage over test file');

  // With test intent: test penalty is waived
  for (const intent of ['test', 'spec', 'audit', 'triage', 'qa']) {
    const scoredWithIntent = analyzer.scoreCandidate(testFile1, kw, true);
    assert.strictEqual(scoredWithIntent, testScore1 + 15, `Test penalty should be waived for intent ${intent}`);
    assert.strictEqual(analyzer.hasTestIntent(`run ${intent} on reconciler`), true);
  }
});

test('FastSemanticAnalyzer memoizes extractKeywords across calls', () => {
  const analyzer = new FastSemanticAnalyzer();
  const query = 'optimize session cache and auth token flow';
  const first = analyzer.extractKeywords(query);
  const second = analyzer.extractKeywords(query);
  assert.deepStrictEqual(first, second);
  assert.ok(first.includes('session'));
  assert.ok(first.includes('token'));
});

test('FastSemanticAnalyzer analyze prioritizes implementation file over test file unless test intent is present', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-analyzer-ranking-'));
  const pkgSrcDir = path.join(tmpDir, 'packages', 'auth', 'src');
  fs.mkdirSync(pkgSrcDir, { recursive: true });

  fs.writeFileSync(path.join(pkgSrcDir, 'authenticator.ts'), 'export class Authenticator {}', 'utf8');
  fs.writeFileSync(path.join(pkgSrcDir, 'authenticator.test.ts'), 'test("auth", () => {})', 'utf8');

  try {
    const analyzer = new FastSemanticAnalyzer(tmpDir);
    const resultImpl = analyzer.analyze('Improve authenticator token verification');
    assert.strictEqual(resultImpl.targetFiles[0], 'packages/auth/src/authenticator.ts');

    const resultTest = analyzer.analyze('Run unit test for authenticator', [], 2);
    assert.ok(resultTest.targetFiles.includes('packages/auth/src/authenticator.test.ts'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});


