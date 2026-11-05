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
    assert.ok(duration < 50);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
