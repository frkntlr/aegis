import * as path from 'node:path';
import { CrossReferenceLinker, RelationalGraph } from '@aegis/ast-skeleton';
import { showBanner } from './banner.js';
import { collectSourceFiles } from './dev-helpers.js';

export function handleGraphScan(targetDir?: string): void {
  showBanner();
  const base = targetDir ? path.resolve(process.cwd(), targetDir) : path.resolve(process.cwd(), 'packages');
  console.log(`🕸️  Building Relational Knowledge Graph for: ${path.relative(process.cwd(), base) || '.'}...`);

  const t0 = performance.now();
  const files = collectSourceFiles(base);
  const graph = new RelationalGraph();
  const linker = new CrossReferenceLinker(graph);

  linker.linkFiles(files, process.cwd());

  const cachePath = path.resolve(process.cwd(), '.aegis', 'cache', 'graph.json');
  graph.saveCache(cachePath);

  const durationMs = (performance.now() - t0).toFixed(2);
  const allNodes = graph.getAllNodes();
  const scenesCount = allNodes.filter(n => n.kind === 'scene').length;
  const symbolsCount = allNodes.filter(n => n.kind === 'symbol').length;

  console.log(` • Files Scanned:       ${files.length}`);
  console.log(` • Relational Nodes:    ${allNodes.length} (${symbolsCount} symbols, ${scenesCount} scenes)`);
  console.log(` • Graph Saved:         .aegis/cache/graph.json (${durationMs}ms)`);
  console.log('✅ Relational Knowledge Graph ready for instant zero-hallucination queries!');
}
