import * as fs from 'node:fs';
import * as path from 'node:path';
import { IronCageValidator, EvidenceBasedTriageGate } from '@aegis/iron-cage';
import { SymbolIndexer, GraphQueryEngine, RelationalGraph, CodebaseMemoryEngine } from '@aegis/ast-skeleton';
import type { CageViolation } from '@aegis/shared';
import { collectSourceFiles } from './metrics-helpers.js';

function resolveTargetDir(targetDir?: string): string {
  if (targetDir) return path.resolve(process.cwd(), targetDir);
  const localPkg = path.resolve(process.cwd(), 'packages');
  if (fs.existsSync(localPkg)) return localPkg;
  const rootPkg = path.resolve(process.cwd(), '..', '..', 'packages');
  if (fs.existsSync(rootPkg)) return rootPkg;
  return process.cwd();
}

function resolveCachePath(fileName: string): string {
  const local = path.resolve(process.cwd(), '.aegis', 'cache', fileName);
  if (fs.existsSync(path.dirname(local))) return local;
  return path.resolve(process.cwd(), '..', '..', '.aegis', 'cache', fileName);
}

export class EngineAnalysisTools {
  private cageValidator = new IronCageValidator();
  private triageGate = new EvidenceBasedTriageGate();

  public runCageCheck(targetDir?: string): Record<string, unknown> {
    const base = resolveTargetDir(targetDir);
    const files = collectSourceFiles(base);
    let compliant = 0;
    const violations: Array<{ file: string; rule: string; msg: string }> = [];

    for (const f of files) {
      const rel = path.relative(process.cwd(), f).replace(/\\/g, '/');
      const content = fs.readFileSync(f, 'utf8');
      const res = this.cageValidator.validateFileContent(rel, content);
      if (res.passed) {
        compliant++;
      } else {
        for (const v of res.violations) {
          violations.push({ file: rel, rule: v.rule, msg: v.message });
        }
      }
    }

    const pct = files.length > 0 ? Math.round((compliant / files.length) * 100) : 100;
    return {
      tool: 'cage_check',
      filesScanned: files.length,
      compliantCount: compliant,
      compliancePercent: pct,
      violationsCount: violations.length,
      violations: violations.slice(0, 10),
      summary: violations.length === 0
        ? `Demir Kafes: %100 CLEAN (${compliant}/${files.length} dosya uyumlu) ✅`
        : `Demir Kafes: ${violations.length} ihlal tespit edildi (%${pct} uyumlu) ⚠️`
    };
  }

  public runBugTriage(targetDir?: string): Record<string, unknown> {
    const base = resolveTargetDir(targetDir);
    const files = collectSourceFiles(base);
    const allViolations: CageViolation[] = [];

    for (const f of files) {
      const rel = path.relative(process.cwd(), f).replace(/\\/g, '/');
      const content = fs.readFileSync(f, 'utf8');
      const res = this.cageValidator.validateFileContent(rel, content);
      allViolations.push(...res.violations);
    }

    const report = this.triageGate.evaluate({
      targetFiles: files.map(f => path.relative(process.cwd(), f).replace(/\\/g, '/')),
      violations: allViolations
    });

    return {
      tool: 'bug_triage',
      clean: report.clean,
      criticalCount: report.criticalCount,
      debtCount: report.debtCount,
      smellCount: report.smellCount,
      summary: report.summary
    };
  }

  public runSymbolFind(query?: string): Record<string, unknown> {
    const symbolQuery = query?.trim() || 'IronCageValidator';
    const indexer = new SymbolIndexer();
    const cachePath = resolveCachePath('symbols.json');
    indexer.loadCache(cachePath);
    let matches = indexer.findSymbols(symbolQuery);

    if (matches.length === 0) {
      const files = collectSourceFiles(resolveTargetDir());
      indexer.indexFiles(files, process.cwd(), cachePath);
      matches = indexer.findSymbols(symbolQuery);
    }

    return {
      tool: 'symbol_find',
      query: symbolQuery,
      matchesCount: matches.length,
      topMatch: matches[0] || null,
      summary: matches.length > 0
        ? `'${symbolQuery}' bulundu: ${matches[0].filePath}:${matches[0].startLine} (${matches.length} eşleşme) ✅`
        : `'${symbolQuery}' sembolü bulunamadı ❌`
    };
  }

  public runRelationalTrace(target?: string): Record<string, unknown> {
    const query = target?.trim() || 'IronCageValidator';
    const graphCachePath = resolveCachePath('graph.json');
    const graph = new RelationalGraph();
    graph.loadCache(graphCachePath);
    const engine = new GraphQueryEngine(graph);
    const trace = engine.trace(query);

    return {
      tool: 'relational_trace',
      target: query,
      nodeKind: trace.foundNode?.kind || 'unknown',
      upstreamEdgesCount: trace.upstreamEdges.length,
      downstreamEdgesCount: trace.downstreamEdges.length,
      connectedScenesCount: trace.connectedScenes.length,
      connectedSignalsCount: trace.connectedSignals.length,
      blastRadiusFilesCount: trace.blastRadiusFiles.length,
      summary: `İlişkisel İzleme '${query}': ${trace.upstreamEdges.length} çağıran, ${trace.blastRadiusFiles.length} etkilenen dosya`
    };
  }

  public runMemoryQuery(symbol?: string, worktreeId = 'default'): Record<string, unknown> {
    const sym = symbol?.trim() || 'IronCageValidator';
    const engine = new CodebaseMemoryEngine();
    const stats = engine.getMemoryStats(worktreeId);
    if (stats.totalFiles === 0) {
      engine.indexDirectory(resolveTargetDir(), worktreeId);
    }
    const res = engine.queryMemory(sym, { worktreeId });
    return {
      tool: 'memory_query',
      symbol: sym,
      found: res.found,
      filePath: res.filePath,
      callersCount: res.callers.length,
      calleesCount: res.callees.length,
      blastRadiusCount: res.blastRadius.length,
      tokenSavingsPercent: res.tokenSavingsPercent,
      summary: res.found
        ? `Bellek Sorgusu '${sym}': ${res.callers.length} çağıran, %${res.tokenSavingsPercent} token tasarrufu ✅`
        : `Bellek Sorgusu: '${sym}' sembolü hafızada bulunamadı ⚠️`
    };
  }

  public runMemoryStats(worktreeId = 'default'): Record<string, unknown> {
    const engine = new CodebaseMemoryEngine();
    let stats = engine.getMemoryStats(worktreeId);
    if (stats.totalFiles === 0) {
      engine.indexDirectory(resolveTargetDir(), worktreeId);
      stats = engine.getMemoryStats(worktreeId);
    }
    return {
      tool: 'memory_stats',
      worktreeId,
      totalFiles: stats.totalFiles,
      totalSymbols: stats.totalSymbols,
      totalNodes: stats.totalNodes,
      totalEdges: stats.totalEdges,
      estimatedTokenSavings: stats.estimatedTokenSavings,
      summary: `Hafıza İstatistikleri [${worktreeId}]: ${stats.totalFiles} dosya, ${stats.totalSymbols} sembol (~%${stats.estimatedTokenSavings} tasarruf) 🧠`
    };
  }
}
