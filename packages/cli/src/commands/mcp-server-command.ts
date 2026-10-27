import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { AstGrepBridge, SkeletonGenerator } from '@aegis/ast-skeleton';
import { Context7Bridge } from '@aegis/github-live';
import { RTKTokenKiller } from '@aegis/watchdog';
import { IronCageValidator, EvidenceBasedTriageGate, LineBudgetRadar } from '@aegis/iron-cage';
import { PolyglotStackTraceParser, SymptomClassifier, SymbioticDiagnosticTriangulator, DynamicHypothesisGenerator } from '@aegis/dialogue-engine';
import { WorktreeManager } from '@aegis/orchestrator';
import { getSharedMemoryEngine } from './memory-command.js';
import { collectSourceFiles } from './dev-helpers.js';

interface JsonRpcRequest {
  jsonrpc: string;
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export const MCP_TOOLS = [
  { name: 'memory_query', description: '5-Layer Codebase Memory query (AST, callers, callees, locks)', inputSchema: { type: 'object', properties: { symbol: { type: 'string' }, worktreeId: { type: 'string' } }, required: ['symbol'] } },
  { name: 'memory_stats', description: 'Codebase Memory diagnostics & token savings', inputSchema: { type: 'object', properties: { worktreeId: { type: 'string' } } } },
  { name: 'find_symbol', description: 'Fast AST symbol lookup and precision surgical slice', inputSchema: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] } },
  { name: 'trace_relational', description: 'Trace relational callers, signals and blast radius', inputSchema: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] } },
  { name: 'ast_search', description: 'Structural AST search via ast-grep with wildcard support', inputSchema: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] } },
  { name: 'ast_replace', description: 'Structural AST replace via ast-grep with metavars', inputSchema: { type: 'object', properties: { pattern: { type: 'string' }, rewrite: { type: 'string' }, file: { type: 'string' } }, required: ['pattern', 'rewrite', 'file'] } },
  { name: 'skeleton_extract', description: 'Extract token-saving AST skeleton folding function/method bodies', inputSchema: { type: 'object', properties: { filePath: { type: 'string' } }, required: ['filePath'] } },
  { name: 'budget_inspect', description: 'Inspect Demir Kafes line budget quota remaining & decomposition advice', inputSchema: { type: 'object', properties: { filePath: { type: 'string' } }, required: ['filePath'] } },
  { name: 'cage_check', description: 'Audit codebase or directory against Demir Kafes compliance', inputSchema: { type: 'object', properties: { dir: { type: 'string' } } } },
  { name: 'triage', description: 'Evidence-Based Bug Triage (zero false alarms)', inputSchema: { type: 'object', properties: { dir: { type: 'string' } } } },
  { name: 'socratic_diagnose', description: 'Instant Socratic evidence parsing & diagnostic hypothesis generation', inputSchema: { type: 'object', properties: { rawLog: { type: 'string' } }, required: ['rawLog'] } },
  { name: 'context7_query', description: 'Query official library ground-truth documentation', inputSchema: { type: 'object', properties: { library: { type: 'string' }, topic: { type: 'string' } }, required: ['library', 'topic'] } },
  { name: 'rtk_compress', description: 'Compress terminal logs via RTK Token Killer', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: 'worktree_status', description: 'Inspect active worktrees and active file mutex locks', inputSchema: { type: 'object', properties: {} } }
];

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
    const scanDir = fs.existsSync('packages') ? 'packages' : '.';
    engine.indexDirectory(scanDir, wt);
  }
}

function executeMemoryTool(name: string, args: Record<string, unknown>, engine: ReturnType<typeof getSharedMemoryEngine>): string {
  if (name === 'memory_query') {
    const wt = String(args.worktreeId || 'default');
    ensureIndexed(engine, wt);
    const q = engine.queryMemory(String(args.symbol || ''), { worktreeId: wt });
    return JSON.stringify(q, null, 2);
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

function executeAstTool(name: string, args: Record<string, unknown>): string {
  if (name === 'ast_search') {
    const matches = AstGrepBridge.searchDirectory(String(args.path || '.'), String(args.pattern || ''));
    return JSON.stringify({ count: matches.length, matches: matches.slice(0, 15) }, null, 2);
  }
  if (name === 'ast_replace') {
    const res = AstGrepBridge.replaceInFile(String(args.file || ''), String(args.pattern || ''), String(args.rewrite || ''));
    return JSON.stringify(res, null, 2);
  }
  if (name === 'skeleton_extract') {
    const rawFp = String(args.filePath || '');
    const fp = resolveFilePath(rawFp);
    if (!fs.existsSync(fp)) return JSON.stringify({ error: `File not found: ${rawFp}` });
    const content = fs.readFileSync(fp, 'utf8');
    const res = new SkeletonGenerator().extractFile(fp, content);
    return JSON.stringify({
      filePath: fp,
      skeleton: res.skeletonContent,
      tokenSavingsPercent: res.tokenSavingsPercent,
      originalLength: res.originalLength,
      skeletonLength: res.skeletonLength
    }, null, 2);
  }
  return JSON.stringify({ error: `Unknown AST tool: ${name}` });
}

function executeQualityTool(name: string, args: Record<string, unknown>): string {
  if (name === 'budget_inspect') {
    const rawFp = String(args.filePath || '');
    const fp = resolveFilePath(rawFp);
    if (!fs.existsSync(fp)) return JSON.stringify({ filePath: rawFp, fileLines: 0, maxFileLines: 300, fileQuotaRemaining: 300, status: 'SAFE' });
    const content = fs.readFileSync(fp, 'utf8');
    const analysis = LineBudgetRadar.analyze(fp, content);
    return JSON.stringify({
      filePath: fp,
      fileLines: analysis.fileLines,
      maxFileLines: analysis.maxFileLines,
      fileQuotaRemaining: analysis.fileQuotaRemaining,
      status: analysis.status,
      mustDecompose: analysis.fileQuotaRemaining < 15 || analysis.status === 'CRITICAL_QUOTA',
      advice: analysis.advice?.recommendedAction ?? analysis.formattedReport
    }, null, 2);
  }
  if (name === 'cage_check') {
    const files = collectSourceFiles(String(args.dir || 'packages'));
    const v = new IronCageValidator();
    const passed = files.filter(f => {
      try { return v.validateFileContent(f, fs.readFileSync(f, 'utf8')).passed; } catch { return false; }
    }).length;
    return JSON.stringify({ total: files.length, compliant: passed, percent: Math.round((passed / (files.length || 1)) * 100) }, null, 2);
  }
  if (name === 'triage') {
    const files = collectSourceFiles(String(args.dir || 'packages'));
    const validator = new IronCageValidator();
    const violations = files.flatMap(f => {
      try { return validator.validateFileContent(f, fs.readFileSync(f, 'utf8')).violations; } catch { return []; }
    });
    return JSON.stringify(new EvidenceBasedTriageGate(validator).evaluate({ targetFiles: files, violations }), null, 2);
  }
  return JSON.stringify({ error: `Unknown quality tool: ${name}` });
}

function executeUtilityTool(name: string, args: Record<string, unknown>): string {
  if (name === 'socratic_diagnose') {
    const rawLog = String(args.rawLog || '');
    const parser = new PolyglotStackTraceParser();
    const parsed = parser.parse(rawLog);
    const category = SymptomClassifier.classify(rawLog);
    let boundaryOpt;
    if (args.callSiteCode && args.library && args.symbol) {
      const diag = SymbioticDiagnosticTriangulator.triangulate({
        callSiteCode: String(args.callSiteCode),
        contract: {
          library: String(args.library),
          symbol: String(args.symbol),
          expectedSignature: args.expectedSignature ? String(args.expectedSignature) : undefined,
          isDeprecated: Boolean(args.isDeprecated),
          deprecationNotice: args.deprecationNotice ? String(args.deprecationNotice) : undefined
        },
        runtimeError: rawLog
      });
      boundaryOpt = SymbioticDiagnosticTriangulator.toClarificationOption(diag);
    }
    const options = DynamicHypothesisGenerator.generate(category, undefined, undefined, boundaryOpt);
    return JSON.stringify({ category, evidence: parsed, clarificationOptions: options }, null, 2);
  }
  if (name === 'context7_query') {
    return JSON.stringify(new Context7Bridge().query(String(args.library || ''), String(args.topic || '')), null, 2);
  }
  if (name === 'rtk_compress') {
    const c = RTKTokenKiller.compress(String(args.text || ''));
    return JSON.stringify({ savings: c.tokenSavingsPercent, text: c.compressedText }, null, 2);
  }
  if (name === 'worktree_status') {
    const wm = new WorktreeManager({ persistLocks: true });
    const list = wm.listWorktrees();
    const locks = Object.fromEntries(wm.getLockedFiles().entries());
    return JSON.stringify({ worktrees: list.worktrees, lockedFiles: locks, activeCount: list.activeCount }, null, 2);
  }
  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

export function executeMcpTool(name: string, args: Record<string, unknown> = {}): string {
  const engine = getSharedMemoryEngine();
  if (name.startsWith('memory_') || name === 'find_symbol' || name === 'trace_relational') {
    return executeMemoryTool(name, args, engine);
  }
  if (name.startsWith('ast_') || name === 'skeleton_extract') {
    return executeAstTool(name, args);
  }
  if (name === 'budget_inspect' || name === 'cage_check' || name === 'triage') {
    return executeQualityTool(name, args);
  }
  return executeUtilityTool(name, args);
}

export function handleJsonRpc(req: JsonRpcRequest): Record<string, unknown> | null {
  if (req.method === 'notifications/initialized') return null;

  if (req.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: req.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'aegis', version: '0.1.0' }
      }
    };
  }

  if (req.method === 'tools/list') {
    return { jsonrpc: '2.0', id: req.id, result: { tools: MCP_TOOLS } };
  }

  if (req.method === 'tools/call') {
    const params = req.params || {};
    const toolName = String(params.name || '');
    const toolArgs = (params.arguments || {}) as Record<string, unknown>;
    const textResult = executeMcpTool(toolName, toolArgs);
    return { jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: textResult }] } };
  }

  return { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `Method not found: ${req.method}` } };
}

export function startMcpServer(): void {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const req = JSON.parse(trimmed) as JsonRpcRequest;
      const res = handleJsonRpc(req);
      if (res) process.stdout.write(JSON.stringify(res) + '\n');
    } catch (_e: unknown) {
      const err = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } };
      process.stdout.write(JSON.stringify(err) + '\n');
    }
  });
}
