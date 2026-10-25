import { test } from 'node:test';
import * as assert from 'node:assert';
import { TsCallGraphExtractor } from './ts-call-graph-extractor.js';
import { CrossReferenceLinker } from './cross-reference-linker.js';

const sampleCallerCode = [
  "import { helperFunction, HelperClass } from './utils/helper.js';",
  "import type { ConfigOptions } from './types.js';",
  '',
  'export class Service {',
  '  public run(opts: ConfigOptions): void {',
  '    this.init();',
  '    helperFunction();',
  '    const instance = new HelperClass();',
  '  }',
  '',
  '  private init(): void {',
  '    console.log("initialized");',
  '  }',
  '}'
].join('\n');

test('TsCallGraphExtractor resolves relative and external module specifiers', () => {
  const resolved = TsCallGraphExtractor.resolveImportPath('src/services/app.ts', './utils/helper.js');
  assert.strictEqual(resolved, 'src/services/utils/helper.ts');

  const external = TsCallGraphExtractor.resolveImportPath('src/services/app.ts', 'typescript');
  assert.strictEqual(external, 'typescript');
});

test('TsCallGraphExtractor extracts calls, instantiations, and type references', () => {
  const edges = TsCallGraphExtractor.extractCallEdges('src/services/service.ts', sampleCallerCode);

  const thisCall = edges.find(e => e.type === 'CALLS_SYMBOL' && e.to === 'src/services/service.ts::Service.init');
  assert.ok(thisCall, 'Should capture this.init call');
  assert.strictEqual(thisCall.from, 'src/services/service.ts::Service.run');

  const helperCall = edges.find(e => e.type === 'CALLS_SYMBOL' && e.to === 'src/services/utils/helper.ts::helperFunction');
  assert.ok(helperCall, 'Should capture imported helperFunction call');

  const newEdge = edges.find(e => e.type === 'INSTANTIATES' && e.to === 'src/services/utils/helper.ts::HelperClass');
  assert.ok(newEdge, 'Should capture new HelperClass instantiation');

  const typeEdge = edges.find(e => e.type === 'REFERENCES_TYPE' && e.to === 'src/services/types.ts::ConfigOptions');
  assert.ok(typeEdge, 'Should capture opts: ConfigOptions type reference');
});

test('CrossReferenceLinker automatically populates symbol-level edges in RelationalGraph', () => {
  const linker = new CrossReferenceLinker();
  linker.linkSingleFile('src/services/service.ts', sampleCallerCode);
  const graph = linker.getGraph();

  assert.strictEqual(graph.hasEdge('src/services/service.ts::Service.run', 'src/services/service.ts::Service.init', 'CALLS_SYMBOL'), true);
  assert.strictEqual(graph.hasEdge('src/services/service.ts::Service.run', 'src/services/utils/helper.ts::HelperClass', 'INSTANTIATES'), true);
  assert.strictEqual(graph.hasEdge('src/services/service.ts::Service.run', 'src/services/types.ts::ConfigOptions', 'REFERENCES_TYPE'), true);
});
