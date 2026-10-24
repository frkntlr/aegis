import * as path from 'node:path';
import { CrossReferenceLinker, GraphQueryEngine, RelationalGraph } from '@aegis/ast-skeleton';
import { showBanner } from './banner.js';
import { collectSourceFiles } from './dev-helpers.js';

export function handleTrace(queryArg?: string): void {
  showBanner();
  if (!queryArg) {
    console.error('❌ Usage: aegis trace <symbolOrPath>');
    process.exit(1);
  }

  const cachePath = path.resolve(process.cwd(), '.aegis', 'cache', 'graph.json');
  const graph = new RelationalGraph();
  const cacheLoaded = graph.loadCache(cachePath);

  if (!cacheLoaded) {
    console.log('🔄 Building Relational Knowledge Graph for workspace...');
    const srcFiles = collectSourceFiles(path.resolve(process.cwd(), 'packages'));
    const linker = new CrossReferenceLinker(graph);
    linker.linkFiles(srcFiles, process.cwd());
    graph.saveCache(cachePath);
  }

  const engine = new GraphQueryEngine(graph);
  const result = engine.trace(queryArg);

  console.log(engine.formatTrace(result));
}
