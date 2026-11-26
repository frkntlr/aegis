import * as fs from 'node:fs';
import * as path from 'node:path';
import { IronCageValidator, EvidenceBasedTriageGate } from '@aegis/iron-cage';
import { SymbolIndexer, GraphQueryEngine, RelationalGraph, CodebaseMemoryEngine, AstGrepBridge } from '@aegis/ast-skeleton';
import { RTKTokenKiller } from '@aegis/watchdog';
import { Context7Bridge } from '@aegis/github-live';
import { debugLogIgnored, type CageViolation } from '@aegis/shared';
import { collectSourceFiles } from './metrics-helpers.js';
import {
  isSafeIdentifier,
  isSafePackageName,
  isSafeTopicName,
  requireExistingRepoRoot,
  resolveContainedPath
} from './path-containment.js';

type TargetRes = { ok: true; root: string; base: string } | { ok: false; reason: string };
type CacheRes = { ok: true; root: string; cachePath: string } | { ok: false; reason: string };

function resolveTarget(targetDir: string | undefined, repoRoot?: string): TargetRes {
  const rootRes = requireExistingRepoRoot(repoRoot);
  if (!rootRes.ok) return rootRes;
  if (targetDir === undefined) {
    const pkgRes = resolveContainedPath(rootRes.root, 'packages', { allowNonExistent: false });
    return { ok: true, root: rootRes.root, base: pkgRes.ok ? pkgRes.realPath : rootRes.root };
  }
  const contained = resolveContainedPath(rootRes.root, targetDir, { allowNonExistent: true });
  return contained.ok ? { ok: true, root: rootRes.root, base: contained.realPath } : contained;
}

function resolveCache(relPath: string, repoRoot?: string): CacheRes {
  const rootRes = requireExistingRepoRoot(repoRoot);
  if (!rootRes.ok) return rootRes;
  const contained = resolveContainedPath(rootRes.root, relPath, { allowNonExistent: true });
  return contained.ok ? { ok: true, root: rootRes.root, cachePath: contained.realPath } : contained;
}

export class EngineAnalysisTools {
  private cageValidator = new IronCageValidator();
  private triageGate = new EvidenceBasedTriageGate();
  private memory = new CodebaseMemoryEngine({ persistToDisk: false });

  constructor(private readonly repoRoot?: string) {}

  private scanFilesForCage(root: string, files: string[]) {
    let compliant = 0;
    const violations: Array<{ file: string; rule: string; msg: string }> = [];
    const allViolations: CageViolation[] = [];
    const targetFiles: string[] = [];
    for (const f of files) {
      const rel = path.relative(root, f).replace(/\\/g, '/');
      targetFiles.push(rel);
      let text = '';
      try {
        text = fs.readFileSync(f, 'utf8');
      } catch (err: unknown) {
        debugLogIgnored('engine-analysis-tools:scanFilesForCage', err);
        continue;
      }
      const res = this.cageValidator.validateFileContent(rel, text);
      if (res.passed) compliant++;
      for (const v of res.violations) {
        violations.push({ file: rel, rule: v.rule, msg: v.message });
        allViolations.push(v);
      }
    }
    return { compliant, violations, allViolations, targetFiles };
  }

  public runCageCheck(targetDir?: string): Record<string, unknown> {
    const target = resolveTarget(targetDir, this.repoRoot);
    if (!target.ok) {
      return {
        tool: 'cage_check', filesScanned: 0, compliantCount: 0, compliancePercent: 0,
        violationsCount: 0, violations: [], unavailable: true, reason: target.reason,
        summary: `Demir Kafes Engellendi: ${target.reason} ❌`
      };
    }
    const files = collectSourceFiles(target.base);
    const { compliant, violations } = this.scanFilesForCage(target.root, files);
    const pct = files.length > 0 ? Math.round((compliant / files.length) * 100) : 100;
    return {
      tool: 'cage_check', filesScanned: files.length, compliantCount: compliant,
      compliancePercent: pct, violationsCount: violations.length, violations: violations.slice(0, 10),
      summary: violations.length === 0
        ? `Demir Kafes: %100 CLEAN (${compliant}/${files.length} dosya uyumlu) ✅`
        : `Demir Kafes: ${violations.length} ihlal tespit edildi (%${pct} uyumlu) ⚠️`
    };
  }

  public runBugTriage(targetDir?: string): Record<string, unknown> {
    const target = resolveTarget(targetDir, this.repoRoot);
    if (!target.ok) {
      return {
        tool: 'bug_triage', clean: false, criticalCount: 0, debtCount: 0, smellCount: 0,
        unavailable: true, reason: target.reason, summary: `Hata Triyajı Engellendi: ${target.reason} ❌`
      };
    }
    const files = collectSourceFiles(target.base);
    const { allViolations, targetFiles } = this.scanFilesForCage(target.root, files);
    const report = this.triageGate.evaluate({ targetFiles, violations: allViolations });
    return {
      tool: 'bug_triage', clean: report.clean, criticalCount: report.criticalCount,
      debtCount: report.debtCount, smellCount: report.smellCount, summary: report.summary
    };
  }

  public runSymbolFind(query?: string): Record<string, unknown> {
    const symbolQuery = query?.trim() || 'IronCageValidator';
    const cache = resolveCache('.aegis/cache/symbols.json', this.repoRoot);
    if (!cache.ok) {
      return {
        tool: 'symbol_find', query: symbolQuery, matchesCount: 0, topMatch: null,
        unavailable: true, reason: cache.reason, summary: `Sembol Arama Engellendi: ${cache.reason} ❌`
      };
    }
    const indexer = new SymbolIndexer();
    indexer.loadCache(cache.cachePath);
    let matches = indexer.findSymbols(symbolQuery);
    if (matches.length === 0) {
      const target = resolveTarget(undefined, this.repoRoot);
      const scanDir = target.ok ? target.base : cache.root;
      indexer.indexFiles(collectSourceFiles(scanDir), cache.root, cache.cachePath);
      matches = indexer.findSymbols(symbolQuery);
    }
    return {
      tool: 'symbol_find', query: symbolQuery, matchesCount: matches.length, topMatch: matches[0] || null,
      summary: matches.length > 0
        ? `'${symbolQuery}' bulundu: ${matches[0].filePath}:${matches[0].startLine} (${matches.length} eşleşme) ✅`
        : `'${symbolQuery}' sembolü bulunamadı ❌`
    };
  }

  public runRelationalTrace(target?: string): Record<string, unknown> {
    const query = target?.trim() || 'IronCageValidator';
    const cache = resolveCache('.aegis/cache/graph.json', this.repoRoot);
    if (!cache.ok) {
      return {
        tool: 'relational_trace', target: query, nodeKind: 'unknown',
        upstreamEdgesCount: 0, downstreamEdgesCount: 0, connectedScenesCount: 0,
        connectedSignalsCount: 0, blastRadiusFilesCount: 0, unavailable: true,
        reason: cache.reason, summary: `İlişkisel İzleme Engellendi: ${cache.reason} ❌`
      };
    }
    const graph = new RelationalGraph();
    graph.loadCache(cache.cachePath);
    const trace = new GraphQueryEngine(graph).trace(query);
    return {
      tool: 'relational_trace', target: query, nodeKind: trace.foundNode?.kind || 'unknown',
      upstreamEdgesCount: trace.upstreamEdges.length, downstreamEdgesCount: trace.downstreamEdges.length,
      connectedScenesCount: trace.connectedScenes.length, connectedSignalsCount: trace.connectedSignals.length,
      blastRadiusFilesCount: trace.blastRadiusFiles.length,
      summary: `İlişkisel İzleme '${query}': ${trace.upstreamEdges.length} çağıran, ${trace.blastRadiusFiles.length} etkilenen dosya`
    };
  }

  public runMemoryQuery(symbol?: string, worktreeId = 'default'): Record<string, unknown> {
    const sym = symbol?.trim() || 'IronCageValidator';
    const target = isSafeIdentifier(worktreeId) ? resolveTarget(undefined, this.repoRoot) : { ok: false as const, reason: 'Invalid worktreeId.' };
    if (!target.ok) {
      return {
        tool: 'memory_query', symbol: sym, found: false, callersCount: 0, calleesCount: 0,
        blastRadiusCount: 0, tokenSavingsPercent: 0, unavailable: true, reason: target.reason,
        summary: `Bellek Sorgusu Engellendi: ${target.reason} ❌`
      };
    }
    const stats = this.memory.getMemoryStats(worktreeId);
    if (stats.totalFiles === 0) this.memory.indexDirectory(target.base, worktreeId);
    const res = this.memory.queryMemory(sym, { worktreeId, repoRoot: target.root });
    return {
      tool: 'memory_query', symbol: sym, found: res.found, filePath: res.filePath,
      callersCount: res.callers.length, calleesCount: res.callees.length,
      blastRadiusCount: res.blastRadius.length, tokenSavingsPercent: res.tokenSavingsPercent,
      summary: res.found
        ? `Bellek Sorgusu '${sym}': ${res.callers.length} çağıran, %${res.tokenSavingsPercent} token tasarrufu ✅`
        : `Bellek Sorgusu: '${sym}' sembolü hafızada bulunamadı ⚠️`
    };
  }

  public runMemoryStats(worktreeId = 'default'): Record<string, unknown> {
    const target = isSafeIdentifier(worktreeId) ? resolveTarget(undefined, this.repoRoot) : { ok: false as const, reason: 'Invalid worktreeId.' };
    if (!target.ok) {
      return {
        tool: 'memory_stats', worktreeId, totalFiles: 0, totalSymbols: 0, totalNodes: 0,
        totalEdges: 0, estimatedTokenSavings: 0, unavailable: true, reason: target.reason,
        summary: `Hafıza İstatistikleri Engellendi: ${target.reason} ❌`
      };
    }
    let stats = this.memory.getMemoryStats(worktreeId);
    if (stats.totalFiles === 0) {
      this.memory.indexDirectory(target.base, worktreeId);
      stats = this.memory.getMemoryStats(worktreeId);
    }
    return {
      tool: 'memory_stats', worktreeId, totalFiles: stats.totalFiles, totalSymbols: stats.totalSymbols,
      totalNodes: stats.totalNodes, totalEdges: stats.totalEdges, estimatedTokenSavings: stats.estimatedTokenSavings,
      summary: `Hafıza İstatistikleri [${worktreeId}]: ${stats.totalFiles} dosya, ${stats.totalSymbols} sembol (~%${stats.estimatedTokenSavings} tasarruf) 🧠`
    };
  }

  public runAstSearch(pattern?: string, targetDir?: string): Record<string, unknown> {
    const pat = pattern?.trim() || 'class $NAME';
    const target = resolveTarget(targetDir, this.repoRoot);
    if (!target.ok) {
      return {
        tool: 'ast_search', pattern: pat, matchCount: 0, matches: [],
        unavailable: true, reason: target.reason, summary: `AST Arama Engellendi: ${target.reason} ❌`
      };
    }
    const matches = AstGrepBridge.searchDirectory(target.base, pat);
    return {
      tool: 'ast_search', pattern: pat, matchCount: matches.length, matches: matches.slice(0, 5),
      summary: `AST Arama: '${pat}' ile ${matches.length} eşleşme bulundu 🔎`
    };
  }

  public runRtkCompress(text?: string): Record<string, unknown> {
    const input = text || 'Test Log\n    at node:internal/process/task_queues:95:5\nPASSED (10ms)';
    const res = RTKTokenKiller.compress(input);
    return {
      tool: 'rtk_compress', tokenSavingsPercent: res.tokenSavingsPercent,
      compressedText: res.compressedText,
      summary: `RTK Sıkıştırma: %${res.tokenSavingsPercent} token tasarrufu sağlandı ⚡`
    };
  }

  public runContext7Query(library?: string, topic?: string): Record<string, unknown> {
    const lib = library?.trim() || 'godot4';
    const top = topic?.trim() || 'lifecycle';
    const validInputs = isSafePackageName(lib) && isSafeTopicName(top);
    const cache = validInputs
      ? resolveCache('.aegis/cache/context7', this.repoRoot)
      : { ok: false as const, reason: 'Invalid library or topic.' };
    if (!cache.ok) {
      return {
        tool: 'context7_query', library: lib, topic: top, found: false, content: null,
        unavailable: true, reason: cache.reason, summary: `Context7 Engellendi: ${cache.reason} ❌`
      };
    }
    const doc = new Context7Bridge().query(lib, top, cache.cachePath);
    return {
      tool: 'context7_query', library: lib, topic: top, found: Boolean(doc), content: doc,
      summary: doc ? `Context7 Dokümanı: [${lib}::${top}] başarıyla alındı 📚` : `Context7: [${lib}::${top}] dokümanı bulunamadı ⚠️`
    };
  }
}
