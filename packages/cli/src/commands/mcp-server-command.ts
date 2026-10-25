import * as fs from 'node:fs';
import * as readline from 'node:readline';
import { AstGrepBridge } from '@aegis/ast-skeleton';
import { Context7Bridge } from '@aegis/github-live';
import { RTKTokenKiller } from '@aegis/watchdog';
import { IronCageValidator, EvidenceBasedTriageGate } from '@aegis/iron-cage';
import { getSharedMemoryEngine } from './memory-command.js';
import { collectSourceFiles } from './dev-helpers.js';

interface JsonRpcRequest {
  jsonrpc: string;
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

const MCP_TOOLS = [
  { name: 'memory_query', description: '5-Layer Codebase Memory query', inputSchema: { type: 'object', properties: { symbol: { type: 'string' }, worktreeId: { type: 'string' } }, required: ['symbol'] } },
  { name: 'memory_stats', description: 'Codebase Memory diagnostics', inputSchema: { type: 'object', properties: { worktreeId: { type: 'string' } } } },
  { name: 'ast_search', description: 'Structural AST search via ast-grep', inputSchema: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] } },
  { name: 'ast_replace', description: 'Structural AST replace via ast-grep', inputSchema: { type: 'object', properties: { pattern: { type: 'string' }, rewrite: { type: 'string' }, file: { type: 'string' } }, required: ['pattern', 'rewrite', 'file'] } },
  { name: 'rtk_compress', description: 'Compress terminal logs via RTK', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: 'context7_query', description: 'Query official library documentation', inputSchema: { type: 'object', properties: { library: { type: 'string' }, topic: { type: 'string' } }, required: ['library', 'topic'] } },
  { name: 'cage_check', description: 'Audit Demir Kafes compliance', inputSchema: { type: 'object', properties: { dir: { type: 'string' } } } },
  { name: 'triage', description: 'Evidence-Based Bug Triage', inputSchema: { type: 'object', properties: { dir: { type: 'string' } } } },
  { name: 'find_symbol', description: 'AST symbol lookup and surgical slice', inputSchema: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] } },
  { name: 'trace_relational', description: 'Trace callers, signals and blast radius', inputSchema: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] } }
];

function ensureIndexed(engine: ReturnType<typeof getSharedMemoryEngine>, wt = 'default'): void {
  const stats = engine.getMemoryStats(wt);
  if (stats.totalFiles === 0 || stats.totalEdges === 0) {
    const scanDir = fs.existsSync('packages') ? 'packages' : '.';
    engine.indexDirectory(scanDir, wt);
  }
}

export function executeMcpTool(name: string, args: Record<string, unknown> = {}): string {
  const engine = getSharedMemoryEngine();
  switch (name) {
    case 'memory_query': {
      const wt = String(args.worktreeId || 'default');
      ensureIndexed(engine, wt);
      const q = engine.queryMemory(String(args.symbol || ''), { worktreeId: wt });
      return JSON.stringify(q, null, 2);
    }
    case 'memory_stats': {
      const wt = String(args.worktreeId || 'default');
      ensureIndexed(engine, wt);
      const s = engine.getMemoryStats(wt);
      return JSON.stringify(s, null, 2);
    }
    case 'context7_query': {
      const res = new Context7Bridge().query(String(args.library || ''), String(args.topic || ''));
      return JSON.stringify(res, null, 2);
    }
    case 'rtk_compress': {
      const c = RTKTokenKiller.compress(String(args.text || ''));
      return JSON.stringify({ savings: c.tokenSavingsPercent, text: c.compressedText }, null, 2);
    }
    case 'cage_check': {
      const files = collectSourceFiles(String(args.dir || 'packages'));
      const v = new IronCageValidator();
      const passed = files.filter(f => {
        try {
          return v.validateFileContent(f, fs.readFileSync(f, 'utf8')).passed;
        } catch {
          return false;
        }
      }).length;
      return JSON.stringify({ total: files.length, compliant: passed, percent: Math.round((passed / (files.length || 1)) * 100) }, null, 2);
    }
    default:
      return executeSecondaryTool(name, args);
  }
}

function executeSecondaryTool(name: string, args: Record<string, unknown>): string {
  const engine = getSharedMemoryEngine();
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
  if (name === 'ast_search') {
    const matches = AstGrepBridge.searchDirectory(String(args.path || '.'), String(args.pattern || ''));
    return JSON.stringify({ count: matches.length, matches: matches.slice(0, 10) }, null, 2);
  }
  if (name === 'ast_replace') {
    const res = AstGrepBridge.replaceInFile(String(args.file || ''), String(args.pattern || ''), String(args.rewrite || ''));
    return JSON.stringify(res, null, 2);
  }
  if (name === 'triage') {
    const files = collectSourceFiles(String(args.dir || 'packages'));
    const validator = new IronCageValidator();
    const violations = files.flatMap(f => {
      try {
        return validator.validateFileContent(f, fs.readFileSync(f, 'utf8')).violations;
      } catch {
        return [];
      }
    });
    const report = new EvidenceBasedTriageGate(validator).evaluate({ targetFiles: files, violations });
    return JSON.stringify(report, null, 2);
  }
  return JSON.stringify({ error: `Unknown tool: ${name}` });
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
    } catch (e: unknown) {
      const err = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } };
      process.stdout.write(JSON.stringify(err) + '\n');
    }
  });
}
