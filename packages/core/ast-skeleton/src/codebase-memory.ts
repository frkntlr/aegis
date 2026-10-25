import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SymbolIndexer } from './symbol-indexer.js';
import { SymbolSliceExtractor, type SliceResult } from './symbol-slice-extractor.js';
import { RelationalGraph } from './relational-graph.js';
import { GraphQueryEngine } from './graph-query-engine.js';
import { CrossReferenceLinker } from './cross-reference-linker.js';

export interface CodebaseMemoryAdapters {
  docProvider?: (library: string, topic: string) => string | null;
  logCompressor?: (rawText: string) => { text: string; tokenSavingsPercent: number };
  constitutionProvider?: (filePath: string) => string[];
  persistToDisk?: boolean;
}

export interface MemoryQueryOptions {
  worktreeId?: string;
  rawLogs?: string;
  contextLines?: number;
  maxDepth?: number;
}

export interface MemoryQueryResult {
  symbol: string;
  found: boolean;
  filePath?: string;
  slice?: string;
  startLine?: number;
  endLine?: number;
  tokenSavingsPercent?: number;
  callers: string[];
  callees: string[];
  blastRadius: string[];
  connectedSignals: string[];
  connectedScenes: string[];
  groundTruthDocs: string[];
  constitutionRules: string[];
  compressedLogs?: string;
}

export interface MemoryStats {
  worktreeId: string;
  totalFiles: number;
  totalSymbols: number;
  totalNodes: number;
  totalEdges: number;
  estimatedTokenSavings: number;
}

interface MemoryNamespace {
  indexer: SymbolIndexer;
  extractor: SymbolSliceExtractor;
  graph: RelationalGraph;
  linker: CrossReferenceLinker;
  queryEngine: GraphQueryEngine;
  fileHashes: Map<string, string>;
  fileContents: Map<string, string>;
}

export class CodebaseMemoryEngine {
  private namespaces = new Map<string, MemoryNamespace>();
  private adapters: CodebaseMemoryAdapters;

  constructor(adapters: CodebaseMemoryAdapters = {}) {
    this.adapters = adapters;
  }

  private getNamespace(id = 'default'): MemoryNamespace {
    let ns = this.namespaces.get(id);
    if (!ns) {
      const indexer = new SymbolIndexer();
      const extractor = new SymbolSliceExtractor(indexer);
      const graph = new RelationalGraph();
      const linker = new CrossReferenceLinker(graph);
      const queryEngine = new GraphQueryEngine(graph);
      ns = { indexer, extractor, graph, linker, queryEngine, fileHashes: new Map(), fileContents: new Map() };
      this.loadNamespaceFromDisk(id, ns);
      this.namespaces.set(id, ns);
    }
    return ns;
  }

  private loadNamespaceFromDisk(id: string, ns: MemoryNamespace): void {
    if (this.adapters.persistToDisk === false) return;
    const cacheDir = path.resolve(process.cwd(), '.aegis', 'memory', id);
    const symPath = path.join(cacheDir, 'symbols.json');
    const graphPath = path.join(cacheDir, 'graph.json');
    const metaPath = path.join(cacheDir, 'meta.json');
    if (fs.existsSync(symPath)) ns.indexer.loadCache(symPath);
    if (fs.existsSync(graphPath)) ns.graph.loadCache(graphPath);
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        if (meta.hashes) ns.fileHashes = new Map(Object.entries(meta.hashes));
      } catch { /* ignore parse error */ }
    }
  }

  public saveNamespaceToDisk(id = 'default'): void {
    if (this.adapters.persistToDisk === false) return;
    const ns = this.namespaces.get(id);
    if (!ns) return;
    const cacheDir = path.resolve(process.cwd(), '.aegis', 'memory', id);
    fs.mkdirSync(cacheDir, { recursive: true });
    ns.indexer.saveCache(path.join(cacheDir, 'symbols.json'));
    ns.graph.saveCache(path.join(cacheDir, 'graph.json'));
    const meta = { hashes: Object.fromEntries(ns.fileHashes) };
    fs.writeFileSync(path.join(cacheDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  }

  public static hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  public indexFile(filePath: string, content: string, worktreeId = 'default'): boolean {
    const norm = filePath.replace(/\\/g, '/');
    const ns = this.getNamespace(worktreeId);
    const hash = CodebaseMemoryEngine.hashContent(content);
    if (ns.fileHashes.get(norm) === hash) return false;

    ns.fileHashes.set(norm, hash);
    ns.fileContents.set(norm, content);
    ns.indexer.indexFile(norm, content);
    ns.linker.linkSingleFile(norm, content);
    return true;
  }

  public removeFile(filePath: string, worktreeId = 'default'): boolean {
    const norm = filePath.replace(/\\/g, '/');
    const ns = this.getNamespace(worktreeId);
    if (!ns.fileHashes.has(norm)) return false;
    ns.fileHashes.delete(norm);
    ns.fileContents.delete(norm);
    delete ns.indexer.getDatabase().files[norm];
    ns.graph.removeFileEdges(norm);
    this.saveNamespaceToDisk(worktreeId);
    return true;
  }

  public indexDirectory(dirPath: string, worktreeId = 'default', exts = ['.ts', '.tsx', '.gd', '.py', '.tscn', '.tres', '.rs', '.go', '.cpp']): { indexed: number; cached: number } {
    let indexed = 0;
    let cached = 0;
    if (!fs.existsSync(dirPath)) return { indexed, cached };

    const scan = (cur: string) => {
      for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
        const full = path.join(cur, e.name);
        if (e.isDirectory()) {
          if (!['node_modules', '.git', 'dist', '.aegis'].includes(e.name)) scan(full);
        } else if (e.isFile() && exts.some(x => e.name.endsWith(x))) {
          try {
            const content = fs.readFileSync(full, 'utf8');
            if (this.indexFile(full, content, worktreeId)) indexed++;
            else cached++;
          } catch { /* skip read error */ }
        }
      }
    };
    scan(dirPath);
    if (indexed > 0) this.saveNamespaceToDisk(worktreeId);
    return { indexed, cached };
  }

  private resolveSlice(ns: MemoryNamespace, symbol: string, contextLines: number): SliceResult | null {
    let matches = ns.indexer.findSymbols(symbol);
    if (matches.length === 0) {
      const norm = symbol.replace(/\\/g, '/');
      for (const [fPath, fileObj] of Object.entries(ns.indexer.getDatabase().files)) {
        if (fPath === norm || fPath.endsWith('/' + norm) || fPath.endsWith('/' + symbol)) {
          if (fileObj.symbols && fileObj.symbols.length > 0) {
            matches = [fileObj.symbols[0]];
            break;
          }
        }
      }
    }
    if (matches.length === 0) return null;
    const target = matches[0];
    const stored = ns.fileContents.get(target.filePath);
    if (stored) {
      return ns.extractor.sliceContent(target.name, target.filePath, stored, target.startLine, target.endLine, contextLines);
    }
    return ns.extractor.extractSliceFromEntry(target, process.cwd(), contextLines);
  }

  public queryMemory(symbol: string, options: MemoryQueryOptions = {}): MemoryQueryResult {
    const ns = this.getNamespace(options.worktreeId || 'default');
    const sliceResult = this.resolveSlice(ns, symbol, options.contextLines ?? 3);
    const traceResult = ns.queryEngine.trace(symbol, options.maxDepth ?? 5);

    const callers = traceResult.upstreamEdges.map(e => e.from);
    const callees = traceResult.downstreamEdges.map(e => e.to);
    const targetFile = sliceResult ? sliceResult.filePath : undefined;

    return {
      symbol,
      found: Boolean(sliceResult || traceResult.foundNode),
      filePath: targetFile,
      slice: sliceResult?.codeSlice,
      startLine: sliceResult?.startLine,
      endLine: sliceResult?.endLine,
      tokenSavingsPercent: sliceResult?.tokenSavingsPercent ?? 0,
      callers: [...new Set(callers)],
      callees: [...new Set(callees)],
      blastRadius: traceResult.blastRadiusFiles,
      connectedSignals: traceResult.connectedSignals,
      connectedScenes: traceResult.connectedScenes,
      groundTruthDocs: this.resolveGroundTruth(sliceResult?.codeSlice || symbol, targetFile),
      constitutionRules: this.resolveConstitution(targetFile),
      compressedLogs: this.compressLogs(options.rawLogs)
    };
  }

  private resolveGroundTruth(code: string, filePath?: string): string[] {
    const docs: string[] = [];
    if (!this.adapters.docProvider) return docs;

    const isGodot = (filePath && filePath.endsWith('.gd')) || /PackedScene|CharacterBody2D|Node|signal/.test(code);
    if (isGodot) {
      const topic = /velocity|move_and_slide/.test(code) ? 'physics' : (/signal|emit|connect/.test(code) ? 'signals' : 'lifecycle');
      const doc = this.adapters.docProvider('godot4', topic) || this.adapters.docProvider('godot4', 'lifecycle');
      if (doc) docs.push(doc);
    }
    const isTs = (filePath && (filePath.endsWith('.ts') || filePath.endsWith('.tsx'))) || /interface|type\s+|declare/.test(code);
    if (isTs) {
      const topic = /test|assert/.test(code) ? 'node-test' : 'clean-arch';
      const doc = this.adapters.docProvider('typescript', topic) || this.adapters.docProvider('typescript', 'node-test');
      if (doc) docs.push(doc);
    }
    return docs;
  }

  private resolveConstitution(filePath?: string): string[] {
    if (this.adapters.constitutionProvider && filePath) {
      return this.adapters.constitutionProvider(filePath);
    }
    const rules = [
      'Iron Cage Rule 1: Max 300 lines per source file.',
      'Iron Cage Rule 2: Max 40 lines per function body.',
      'Iron Cage Rule 3: Surgical unified diff modifications only.'
    ];
    if (filePath && filePath.endsWith('.gd')) {
      rules.push('Godot Rule GD_007: Do not use get_parent() directly; decouple with signals.');
      rules.push('Godot Rule GD_005: Always free or add instantiated nodes to the scene tree.');
    }
    return rules;
  }

  private compressLogs(rawLogs?: string): string | undefined {
    if (!rawLogs) return undefined;
    if (this.adapters.logCompressor) {
      return this.adapters.logCompressor(rawLogs).text;
    }
    return rawLogs.split('\n').filter(l => !l.includes('node:internal')).join('\n');
  }

  public getMemoryStats(worktreeId = 'default'): MemoryStats {
    const ns = this.getNamespace(worktreeId);
    const db = ns.indexer.getDatabase();
    const files = Object.keys(db.files);
    let totalSymbols = 0;
    for (const f of files) {
      totalSymbols += db.files[f]?.symbols?.length || 0;
    }
    const nodes = ns.graph.getAllNodes();
    let totalEdges = 0;
    for (const n of nodes) {
      totalEdges += ns.graph.getOutgoing(n.id).length;
    }
    return {
      worktreeId,
      totalFiles: files.length,
      totalSymbols,
      totalNodes: nodes.length,
      totalEdges,
      estimatedTokenSavings: files.length > 0 ? 75 : 0
    };
  }

  public clearCache(worktreeId?: string): void {
    if (worktreeId) this.namespaces.delete(worktreeId);
    else this.namespaces.clear();
  }
}
