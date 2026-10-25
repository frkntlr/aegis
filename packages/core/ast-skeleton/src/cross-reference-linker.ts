import * as fs from 'node:fs';
import * as path from 'node:path';
import { RelationalGraph } from './relational-graph.js';
import { TscnRelationParser } from './tscn-relation-parser.js';
import { SymbolParser, type SymbolEntry } from './symbol-parser.js';

export class CrossReferenceLinker {
  private graph: RelationalGraph;

  constructor(graph?: RelationalGraph) {
    this.graph = graph || new RelationalGraph();
  }

  public getGraph(): RelationalGraph {
    return this.graph;
  }

  public linkFiles(filePaths: string[], baseDir = process.cwd()): RelationalGraph {
    for (const relPath of filePaths) {
      const fullPath = path.isAbsolute(relPath) ? relPath : path.join(baseDir, relPath);
      if (!fs.existsSync(fullPath)) continue;
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        this.linkSingleFile(relPath, content);
      } catch { /* ignore unreadable */ }
    }
    return this.graph;
  }

  public linkSingleFile(filePath: string, content: string): void {
    const normPath = filePath.replace(/\\/g, '/');
    const ext = path.extname(normPath).toLowerCase();
    this.graph.removeFileEdges(normPath);

    if (ext === '.tscn' || ext === '.tres') {
      const parsed = TscnRelationParser.parse(normPath, content);
      for (const n of parsed.nodes) this.graph.addNode(n);
      for (const e of parsed.edges) this.graph.addEdge(e);
      return;
    }

    this.graph.addNode({ id: normPath, name: path.basename(normPath), kind: 'file', filePath: normPath });

    if (ext === '.gd') {
      this.linkGDScript(normPath, content);
    } else if (['.ts', '.tsx', '.js'].includes(ext)) {
      this.linkTypeScript(normPath, content);
    } else if (ext === '.py') {
      this.linkPython(normPath, content);
    } else if (['.rs', '.go'].includes(ext)) {
      this.linkGeneric(normPath, content);
    }
  }

  private linkPython(filePath: string, content: string): void {
    const symbols = SymbolParser.parseGeneric(filePath, content);
    this.registerSymbols(filePath, symbols);
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      const extMatch = trimmed.match(/class\s+([a-zA-Z_]\w*)\s*\(\s*([a-zA-Z_]\w*)\s*\):/);
      if (extMatch) {
        this.graph.addEdge({ from: `${filePath}::${extMatch[1]}`, to: extMatch[2], type: 'EXTENDS' });
      }
      const impMatch = trimmed.match(/from\s+([.\w]+)\s+import/);
      if (impMatch) {
        this.graph.addEdge({ from: filePath, to: impMatch[1], type: 'CALLS' });
      }
    }
  }

  private linkGeneric(filePath: string, content: string): void {
    const symbols = SymbolParser.parseGeneric(filePath, content);
    this.registerSymbols(filePath, symbols);
  }

  private linkGDScript(filePath: string, content: string): void {
    const symbols = SymbolParser.parseGDScript(filePath, content);
    this.registerSymbols(filePath, symbols);

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      this.parseGdInheritance(filePath, line);
      this.parseGdSignalTriggers(filePath, line);
      this.parseGdConnections(filePath, line);
    }
  }

  private registerSymbols(filePath: string, symbols: SymbolEntry[]): void {
    for (const s of symbols) {
      const id = `${filePath}::${s.name}`;
      this.graph.addNode({ id, name: s.name, kind: 'symbol', filePath, line: s.startLine });
      if (s.kind === 'signal') {
        this.graph.addEdge({ from: filePath, to: id, type: 'DEFINES_SIGNAL' });
      }
    }
  }

  private parseGdInheritance(filePath: string, line: string): void {
    const extMatch = line.match(/^extends\s+(?:["']([^"']+)["']|([a-zA-Z_]\w*))/);
    if (extMatch) {
      const base = (extMatch[1] || extMatch[2]).replace(/^res:\/\//, '');
      this.graph.addEdge({ from: filePath, to: base, type: 'EXTENDS' });
    }
  }

  private parseGdSignalTriggers(filePath: string, line: string): void {
    const emitMatch = line.match(/\b([a-zA-Z_]\w*)\.emit\s*\(/) || line.match(/emit_signal\(\s*["']([^"']+)["']/);
    if (emitMatch && emitMatch[1] !== 'self') {
      this.graph.addEdge({
        from: filePath,
        to: emitMatch[1],
        type: 'EMITS_SIGNAL',
        metadata: { signal: emitMatch[1] }
      });
    }
  }

  private parseGdConnections(filePath: string, line: string): void {
    const conn1 = line.match(/([a-zA-Z_]\w*)\.connect\(\s*([a-zA-Z_]\w*)/);
    const conn2 = line.match(/connect\(\s*["']([a-zA-Z_]\w*)["']\s*,\s*(?:Callable\([^)]*,\s*["']([a-zA-Z_]\w*)["']\)|([a-zA-Z_]\w*))/);
    const sig = conn1 ? conn1[1] : (conn2 ? conn2[1] : undefined);
    const method = conn1 ? conn1[2] : (conn2 ? (conn2[2] || conn2[3]) : undefined);

    if (sig && method) {
      this.graph.addEdge({
        from: `${filePath}::${sig}`,
        to: `${filePath}::${method}`,
        type: 'CONNECTS_SIGNAL',
        metadata: { signal: sig, method }
      });
    }
  }

  private linkTypeScript(filePath: string, content: string): void {
    const symbols = SymbolParser.parseTypeScript(filePath, content);
    this.registerSymbols(filePath, symbols);

    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      const extMatch = trimmed.match(/class\s+([a-zA-Z_]\w*)\s+extends\s+([a-zA-Z_]\w*)/);
      if (extMatch) {
        this.graph.addEdge({ from: `${filePath}::${extMatch[1]}`, to: extMatch[2], type: 'EXTENDS' });
      }
      const impMatch = trimmed.match(/import\s+.*from\s+['"]([^'"]+)['"]/);
      if (impMatch) {
        let target = impMatch[1];
        if (target.startsWith('.')) {
          const dir = path.posix.dirname(filePath);
          const raw = path.posix.normalize(path.posix.join(dir, target));
          target = raw.replace(/\.jsx?$/, '.ts').replace(/\.mjsx?$/, '.mts').replace(/\.cjsx?$/, '.cts');
          if (!path.posix.extname(target)) target += '.ts';
        }
        this.graph.addEdge({ from: filePath, to: target, type: 'CALLS' });
      }
    }
  }
}
