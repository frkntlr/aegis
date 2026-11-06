import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SkeletonGenerator } from './skeleton-generator.js';

test('SkeletonGenerator caches results based on mtime and size', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-mtime-'));
  const filePath = path.join(tmpDir, 'service.ts');

  try {
    fs.writeFileSync(filePath, 'export function compute(): number { return 42; }', 'utf8');

    const generator = new SkeletonGenerator();
    const map1 = generator.generateForFiles(['service.ts'], tmpDir);
    const result1 = map1.entries.get('service.ts');
    assert.ok(result1);
    assert.ok(result1.skeletonContent.includes('function compute(): number;'));

    // Second run should return identical cached result reference
    const map2 = generator.generateForFiles(['service.ts'], tmpDir);
    const result2 = map2.entries.get('service.ts');
    assert.strictEqual(result2, result1);

    // Overwrite file with new size/content -> cache miss and update
    fs.writeFileSync(filePath, 'export function computeUpdated(val: number): number { return val * 2; }', 'utf8');
    const map3 = generator.generateForFiles(['service.ts'], tmpDir);
    const result3 = map3.entries.get('service.ts');
    assert.ok(result3);
    assert.notStrictEqual(result3, result1);
    assert.ok(result3.skeletonContent.includes('computeUpdated'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('SkeletonGenerator.clearCache evicts all cached results', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-clear-'));
  const filePath = path.join(tmpDir, 'item.ts');

  try {
    fs.writeFileSync(filePath, 'export class Item { run(): void {} }', 'utf8');

    const generator = new SkeletonGenerator();
    const map1 = generator.generateForFiles(['item.ts'], tmpDir);
    const result1 = map1.entries.get('item.ts');
    assert.ok(result1);

    // Clear cache, next generation re-extracts even if mtime and size match
    generator.clearCache();
    const map2 = generator.generateForFiles(['item.ts'], tmpDir);
    const result2 = map2.entries.get('item.ts');
    assert.ok(result2);
    assert.notStrictEqual(result2, result1);
    assert.strictEqual(result2.skeletonContent, result1.skeletonContent);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
