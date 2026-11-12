import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FastSemanticAnalyzer } from './fast-semantic-analyzer.js';
import { readSemanticManifest, saveSemanticManifest } from './semantic-file-manifest.js';

function fixture(run: (root: string, index: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-semantic-freshness-'));
  const index = path.join(root, '.git/index');
  fs.mkdirSync(path.dirname(index));
  fs.writeFileSync(index, 'fixture');
  try { run(root, index); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('disk manifest expires independently of unchanged Git index', t => fixture((root, index) => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  fs.writeFileSync(path.join(root, 'inventory.ts'), 'export const inventory = 1;');
  const first = new FastSemanticAnalyzer(root).listCandidateFiles();
  assert.ok(first.includes('inventory.ts'));
  const initialMtime = fs.statSync(index).mtimeMs;
  fs.writeFileSync(path.join(root, 'inventory-new.ts'), 'export const inventoryNew = 2;');
  now += 9000;
  const reused = new FastSemanticAnalyzer(root);
  assert.ok(!reused.listCandidateFiles().includes('inventory-new.ts'));
  now += 1001;
  assert.ok(reused.listCandidateFiles().includes('inventory-new.ts'));
  now += 10001;
  assert.equal(reused.analyze('inventory').fromCache, false);
  assert.equal(new FastSemanticAnalyzer(root).analyze('inventory').fromCache, true);
  assert.equal(fs.statSync(index).mtimeMs, initialMtime);
}));

test('deleted cached candidates are skipped immediately while explicit new files remain allowed', () => fixture(root => {
  const file = path.join(root, 'inventory.ts');
  fs.writeFileSync(file, 'export const inventory = 1;');
  const analyzer = new FastSemanticAnalyzer(root);
  assert.deepEqual(analyzer.analyze('inventory').targetFiles, ['inventory.ts']);
  fs.unlinkSync(file);
  assert.deepEqual(analyzer.analyze('inventory').targetFiles, []);
  assert.deepEqual(analyzer.analyze('inventory', ['inventory-next.ts']).targetFiles, ['inventory-next.ts']);
}));

test('disk cache rejects untimestamped, future and malformed inventories', () => fixture((root, index) => {
  const file = path.join(root, '.aegis/cache/fast-semantic-manifest.json');
  saveSemanticManifest(root, index, { files: ['inventory.ts'], timestamp: 100 });
  assert.deepEqual(readSemanticManifest(root, index, 10000, 101)?.files, ['inventory.ts']);
  assert.equal(readSemanticManifest(root, index, 10000, 99), null);
  const base = { gitIndexMtime: fs.statSync(index).mtimeMs, files: ['inventory.ts'] };
  fs.writeFileSync(file, JSON.stringify(base));
  assert.equal(readSemanticManifest(root, index, 10000, 101), null);
  fs.writeFileSync(file, JSON.stringify({ ...base, timestamp: 100, files: [false] }));
  assert.equal(readSemanticManifest(root, index, 10000, 101), null);
}));
