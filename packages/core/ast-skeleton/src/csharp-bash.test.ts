import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CSharpSkeletonExtractor } from './csharp-extractor.js';
import { BashSkeletonExtractor } from './bash-extractor.js';
import { PolyglotParser } from './polyglot-parser.js';
import { SkeletonGenerator } from './skeleton-generator.js';
import { CodebaseMemoryEngine } from './codebase-memory.js';

const sampleCSharpCode = `
using System;
using System.Threading.Tasks;

namespace Enterprise.Services;

[Serializable]
public class OrderService : IOrderService
{
    public string ServiceName { get; set; }

    [HttpGet]
    public async Task<int> ProcessOrderAsync(int orderId)
    {
        var result = await FetchDbAsync(orderId);
        return result * 2;
    }
}

public interface IOrderService
{
    Task<int> ProcessOrderAsync(int orderId);
}

public record OrderDto(int Id, string Customer);
`.trim();

const sampleBashCode = `
#!/usr/bin/env bash
set -euo pipefail

export ENVIRONMENT="production"
export APP_PORT=8080

# Build and package application
function build_app() {
    echo "Compiling sources..."
    dotnet build -c Release
}

deploy_service() {
    echo "Deploying systemd service..."
    systemctl restart my-service
}
`.trim();

test('CSharpSkeletonExtractor extracts C# classes, records, and folds methods', () => {
  const extractor = new CSharpSkeletonExtractor();
  const res = extractor.extract('OrderService.cs', sampleCSharpCode);

  assert.ok(res.skeletonContent.includes('namespace Enterprise.Services;'));
  assert.ok(res.skeletonContent.includes('public class OrderService : IOrderService'));
  assert.ok(res.skeletonContent.includes('public string ServiceName { get; set; }'));
  assert.ok(res.skeletonContent.includes('public async Task<int> ProcessOrderAsync(int orderId) { /* body omitted */ }'));
  assert.ok(res.skeletonContent.includes('public interface IOrderService'));
  assert.ok(res.skeletonContent.includes('public record OrderDto(int Id, string Customer);'));
  assert.ok(res.tokenSavingsPercent > 0);
});

test('BashSkeletonExtractor extracts Linux shell functions and exports', () => {
  const extractor = new BashSkeletonExtractor();
  const res = extractor.extract('deploy.sh', sampleBashCode);

  assert.ok(res.skeletonContent.includes('#!/usr/bin/env bash'));
  assert.ok(res.skeletonContent.includes('export ENVIRONMENT="production"'));
  assert.ok(res.skeletonContent.includes('build_app() { /* body omitted */ }'));
  assert.ok(res.skeletonContent.includes('deploy_service() { /* body omitted */ }'));
  assert.ok(res.tokenSavingsPercent > 0);
});

test('PolyglotParser.parseCSharp extracts symbols from C# code', () => {
  const symbols = PolyglotParser.parseCSharp('OrderService.cs', sampleCSharpCode);

  assert.ok(symbols.some(s => s.name === 'OrderService' && s.kind === 'class'));
  assert.ok(symbols.some(s => s.name === 'IOrderService' && s.kind === 'interface'));
  assert.ok(symbols.some(s => s.name === 'OrderDto' && s.kind === 'class'));
  assert.ok(symbols.some(s => s.name === 'OrderService.ProcessOrderAsync' && s.kind === 'method'));
  assert.ok(symbols.some(s => s.name === 'OrderService.ServiceName' && s.kind === 'variable'));
});

test('PolyglotParser.parseBash extracts functions from shell scripts', () => {
  const symbols = PolyglotParser.parseBash('deploy.sh', sampleBashCode);

  assert.ok(symbols.some(s => s.name === 'build_app' && s.kind === 'function'));
  assert.ok(symbols.some(s => s.name === 'deploy_service' && s.kind === 'function'));
});

test('SkeletonGenerator routes .cs and .sh to registered extractors', () => {
  const gen = new SkeletonGenerator();
  const reg = gen.getRegistry();

  assert.ok(reg.listLanguages().includes('csharp'));
  assert.ok(reg.listLanguages().includes('bash'));

  const csExt = reg.getExtractor('App.cs');
  assert.strictEqual(csExt?.languageId, 'csharp');

  const shExt = reg.getExtractor('run.sh');
  assert.strictEqual(shExt?.languageId, 'bash');
});

test('CodebaseMemoryEngine indexes and queries C# and Linux Shell symbols', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-csharp-bash-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'OrderService.cs'), sampleCSharpCode, 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'deploy.sh'), sampleBashCode, 'utf8');

    const engine = new CodebaseMemoryEngine({ persistToDisk: false });
    const stats = engine.indexDirectory(tmpDir, 'test-wt');
    assert.strictEqual(stats.indexed, 2);

    const csResult = engine.queryMemory('OrderService', { worktreeId: 'test-wt' });
    assert.strictEqual(csResult.found, true);
    assert.strictEqual(csResult.symbol, 'OrderService');

    const bashResult = engine.queryMemory('build_app', { worktreeId: 'test-wt' });
    assert.strictEqual(bashResult.found, true);
    assert.strictEqual(bashResult.symbol, 'build_app');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
