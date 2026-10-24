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
    const ext = path.extname(filePath).toLowerCase();
    this.graph.removeFileEdges(filePath);

    if (ext === '.tscn') {
      const parsed = TscnRelationParser.parse(filePath, content);
      for (const n of parsed.nodes) this.graph.addNode(n);
      for (const e of parsed.edges) this.graph.addEdge(e);
      return;
    }

    this.graph.addNode({ id: filePath, name: path.basename(filePath), kind: 'file', filePath });

    if (ext === '.gd') {
      this.linkGDScript(filePath, content);
    } else if (['.ts', '.tsx', '.js'].includes(ext)) {
      this.linkTypeScript(filePath, content);
    }
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
    const connMatch = line.match(/([a-zA-Z_]\w*)\.connect\(\s*([a-zA-Z_]\w*)/);
    if (connMatch) {
      this.graph.addEdge({
        from: `${filePath}::${connMatch[1]}`,
        to: `${filePath}::${connMatch[2]}`,
        type: 'CONNECTS_SIGNAL',
        metadata: { signal: connMatch[1], method: connMatch[2] }
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
        this.graph.addEdge({ from: filePath, to: impMatch[1], type: 'CALLS' });
      }
    }
  }
}
