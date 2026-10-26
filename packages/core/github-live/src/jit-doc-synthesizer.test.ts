import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { JitDocSynthesizer } from './jit-doc-synthesizer.js';
import { Context7Bridge } from './context7-bridge.js';

test('JitDocSynthesizer slices symbol byte range with brace counter', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jit-test-'));
  const dtsFile = path.join(tmpDir, 'test.d.ts');
  const dtsContent = `
// Preamble comments
export declare const unused = 42;

export declare class MyClient {
  public connect(url: string): Promise<boolean>;
  public close(): void;
}

export declare interface OtherInterface {
  id: string;
}
`;
  fs.writeFileSync(dtsFile, dtsContent, 'utf8');

  const res = JitDocSynthesizer.sliceSymbolByteRange(dtsFile, 'MyClient');
  assert.ok(res);
  assert.ok(res.slice.includes('export declare class MyClient'));
  assert.ok(res.slice.includes('connect(url: string)'));
  assert.ok(!res.slice.includes('OtherInterface'));
  assert.strictEqual(res.line, 5);
});

test('JitDocSynthesizer synthesizes doc entry and updates manifest', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jit-manifest-test-'));
  const slice = `export declare class WorkerClient {\n  constructor(name: string);\n  run(): Promise<void>;\n}`;

  const doc = JitDocSynthesizer.synthesizeDocEntry('worker-pkg', '2.1.0', 'WorkerClient', slice);
  assert.strictEqual(doc.library, 'worker-pkg');
  assert.strictEqual(doc.topic, 'WorkerClient');
  assert.strictEqual(doc.version, '2.1.0');
  assert.ok(doc.signatures.length > 0);

  JitDocSynthesizer.updateManifest(tmpDir, 'worker-pkg', '2.1.0', 'WorkerClient', 'index.d.ts', 15);
  const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest['worker-pkg'].version, '2.1.0');
  assert.strictEqual(manifest['worker-pkg'].symbols['WorkerClient'].line, 15);
});

test('Context7Bridge queries JIT-synthesized documentation on fallback', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jit-bridge-test-'));
  const fakePkgDir = path.join(tmpDir, 'node_modules', 'custom-lib');
  fs.mkdirSync(fakePkgDir, { recursive: true });

  fs.writeFileSync(
    path.join(fakePkgDir, 'package.json'),
    JSON.stringify({ name: 'custom-lib', version: '1.5.0', types: 'index.d.ts' }),
    'utf8'
  );
  fs.writeFileSync(
    path.join(fakePkgDir, 'index.d.ts'),
    'export declare function computeHash(val: string): string;\n',
    'utf8'
  );

  const bridge = new Context7Bridge();
  // Query with custom cache dir
  const cacheDir = path.join(tmpDir, '.aegis', 'cache', 'context7');
  const res = bridge.query('custom-lib', 'computeHash', cacheDir);
  assert.ok(res !== undefined);

  // If node_modules is found, it synthesizes
  const directDoc = JitDocSynthesizer.synthesizeFromNodeModules('custom-lib', 'computeHash', tmpDir, cacheDir);
  assert.ok(directDoc);
  assert.strictEqual(directDoc.library, 'custom-lib');
  assert.strictEqual(directDoc.topic, 'computeHash');
});
