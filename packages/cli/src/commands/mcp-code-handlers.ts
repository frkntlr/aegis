/**
 * @file mcp-code-handlers.ts
 * Leaf handlers for Memory, AST, and Quality MCP tools.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { AstGrepBridge, SkeletonGenerator } from '@aegis/ast-skeleton';
import { IronCageValidator, EvidenceBasedTriageGate, LineBudgetRadar } from '@aegis/iron-cage';
import { resolveSafeRepoRoot } from '@aegis/shared';
import { getSharedMemoryEngine } from './memory-command.js';
import { collectSourceFiles } from './dev-helpers.js';

function resolveFilePath(fp: string): string {
  if (!fp) return '';
  if (path.isAbsolute(fp) && fs.existsSync(fp)) return fp;
  if (fs.existsSync(fp)) return path.resolve(fp);
  const fromCwd = path.resolve(process.cwd(), fp);
  if (fs.existsSync(fromCwd)) return fromCwd;
  const fromRoot = path.resolve(process.cwd(), '..', '..', fp);
  if (fs.existsSync(fromRoot)) return fromRoot;
  return fp;
}

function ensureIndexed(engine: ReturnType<typeof getSharedMemoryEngine>, wt = 'default'): void {
  const stats = engine.getMemoryStats(wt);
  const isTest = process.env.NODE_ENV === 'test' || process.env.AEGIS_TEST === '1';
  if (stats.totalFiles === 0 && !isTest) {
    const root = resolveSafeRepoRoot();
    const pkgDir = path.join(root, 'packages');
    const scanDir = fs.existsSync(pkgDir) ? pkgDir : root;
    engine.indexDirectory(scanDir, wt);
  }
}

export function executeMemoryTool(name: string, args: Record<string, unknown>): string {
  const engine = getSharedMemoryEngine();
  if (name === 'memory_query') {
    const wt = String(args.worktreeId || 'default');
    ensureIndexed(engine, wt);
    return JSON.stringify(engine.queryMemory(String(args.symbol || ''), { worktreeId: wt }), null, 2);
  }
  if (name === 'memory_stats') {
    const wt = String(args.worktreeId || 'default');
    ensureIndexed(engine, wt);
    return JSON.stringify(engine.getMemoryStats(wt), null, 2);
  }
  if (name === 'find_symbol') {
    ensureIndexed(engine);
    const q = engine.queryMemory(String(args.symbol || ''));
    return JSON.stringify({ found: q.found, symbol: q.symbol, filePath: q.filePath, slice: q.slice, tokenSavingsPercent: q.tokenSavingsPercent }, null, 2);
  }
  if (name === 'trace_relational') {
    ensureIndexed(engine);
    const q = engine.queryMemory(String(args.target || ''));
    return JSON.stringify({ target: q.symbol, callers: q.callers, callees: q.callees, blastRadius: q.blastRadius, signals: q.connectedSignals, scenes: q.connectedScenes }, null, 2);
  }
  return JSON.stringify({ error: `Unknown memory tool: ${name}` });
}

export function executeAstTool(name: string, args: Record<string, unknown>): string {
  if (name === 'ast_search') {
    const matches = AstGrepBridge.searchDirectory(String(args.path || '.'), String(args.pattern || ''));
    return JSON.stringify({ count: matches.length, matches: matches.slice(0, 15) }, null, 2);
  }
  if (name === 'ast_replace') {
    return JSON.stringify(AstGrepBridge.replaceInFile(String(args.file || ''), String(args.pattern || ''), String(args.rewrite || '')), null, 2);
  }
  if (name === 'skeleton_extract') {
    const rawFp = String(args.filePath || '');
    const fp = resolveFilePath(rawFp);
    if (!fs.existsSync(fp)) return JSON.stringify({ error: `File not found: ${rawFp}` });
    const content = fs.readFileSync(fp, 'utf8');
    const res = new SkeletonGenerator().extractFile(fp, content);
    return JSON.stringify({ filePath: fp, skeleton: res.skeletonContent, tokenSavingsPercent: res.tokenSavingsPercent, originalLength: res.originalLength, skeletonLength: res.skeletonLength }, null, 2);
  }
  return JSON.stringify({ error: `Unknown AST tool: ${name}` });
}

export function executeQualityTool(name: string, args: Record<string, unknown>): string {
  if (name === 'budget_inspect') {
    const rawFp = String(args.filePath || '');
    const fp = resolveFilePath(rawFp);
    if (!fs.existsSync(fp)) return JSON.stringify({ filePath: rawFp, fileLines: 0, maxFileLines: 300, fileQuotaRemaining: 300, status: 'SAFE' });
    const analysis = LineBudgetRadar.analyze(fp, fs.readFileSync(fp, 'utf8'));
    return JSON.stringify({ filePath: fp, fileLines: analysis.fileLines, maxFileLines: analysis.maxFileLines, fileQuotaRemaining: analysis.fileQuotaRemaining, status: analysis.status, mustDecompose: analysis.fileQuotaRemaining < 15 || analysis.status === 'CRITICAL_QUOTA', advice: analysis.advice?.recommendedAction ?? analysis.formattedReport }, null, 2);
  }
  if (name === 'cage_check') {
    const files = collectSourceFiles(String(args.dir || 'packages'));
    const v = new IronCageValidator();
    const passed = files.filter(f => {
      try { return v.validateFileContent(f, fs.readFileSync(f, 'utf8')).passed; }
      catch { /* non-UTF8 or unreadable source file treated as non-compliant */ return false; }
    }).length;
    return JSON.stringify({ total: files.length, compliant: passed, percent: Math.round((passed / (files.length || 1)) * 100) }, null, 2);
  }
  if (name === 'triage') {
    const files = collectSourceFiles(String(args.dir || 'packages'));
    const validator = new IronCageValidator();
    const violations = files.flatMap(f => {
      try { return validator.validateFileContent(f, fs.readFileSync(f, 'utf8')).violations; }
      catch { /* skip unreadable file during triage scan */ return []; }
    });
    return JSON.stringify(new EvidenceBasedTriageGate(validator).evaluate({ targetFiles: files, violations }), null, 2);
  }
  return JSON.stringify({ error: `Unknown quality tool: ${name}` });
}
