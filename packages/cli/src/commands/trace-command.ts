import * as fs from 'node:fs';
import * as path from 'node:path';
import { CrossReferenceLinker, GraphQueryEngine, RelationalGraph } from '@aegis/ast-skeleton';
import { showBanner } from './banner.js';
import { collectSourceFiles } from './dev-helpers.js';

function autoBuildGraph(graph: RelationalGraph, cachePath: string): void {
  console.log('🔄 Building Relational Knowledge Graph for workspace...');
  const pkgDir = path.resolve(process.cwd(), 'packages');
  const baseDir = fs.existsSync(pkgDir) ? pkgDir : process.cwd();
  const srcFiles = collectSourceFiles(baseDir, true);
  const linker = new CrossReferenceLinker(graph);
  linker.linkFiles(srcFiles, process.cwd());
  graph.saveCache(cachePath);
}

export function handleTrace(queryArg?: string): void {
  showBanner();
  if (!queryArg) {
    console.error('❌ Usage: aegis trace <symbolOrPath>');
    process.exit(1);
  }

  const cachePath = path.resolve(process.cwd(), '.aegis', 'cache', 'graph.json');
  const graph = new RelationalGraph();
  if (!graph.loadCache(cachePath)) {
    autoBuildGraph(graph, cachePath);
  }

  const engine = new GraphQueryEngine(graph);
  const result = engine.trace(queryArg);

  console.log(engine.formatTrace(result));
}
