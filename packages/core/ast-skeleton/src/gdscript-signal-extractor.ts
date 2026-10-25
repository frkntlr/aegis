import type { RelationalEdge, RelationalNode } from './relational-graph.js';
import type { SymbolEntry } from './symbol-parser.js';

export interface GdSignalExtractionResult {
  edges: RelationalEdge[];
  nodes: RelationalNode[];
}

export class GdSignalExtractor {
  public static extract(filePath: string, content: string, symbols: SymbolEntry[]): GdSignalExtractionResult {
    const edges: RelationalEdge[] = [];
    const nodes: RelationalNode[] = [];
    const localSignals = new Set<string>(
      symbols.filter(s => s.kind === 'signal').map(s => s.name)
    );
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

      const lineNum = i + 1;
      const enclosingFunc = GdSignalExtractor.findEnclosingFunction(symbols, lineNum);

      const emitEdge = GdSignalExtractor.parseEmission(line, filePath, enclosingFunc, localSignals);
      if (emitEdge) {
        edges.push(emitEdge);
        GdSignalExtractor.ensureSignalNode(emitEdge.to, nodes);
      }

      const connEdge = GdSignalExtractor.parseConnection(line, filePath, localSignals);
      if (connEdge) {
        edges.push(connEdge);
        GdSignalExtractor.ensureSignalNode(connEdge.from, nodes);
      }
    }

    return { edges, nodes };
  }

  private static findEnclosingFunction(symbols: SymbolEntry[], line: number): string | undefined {
    for (const s of symbols) {
      if (s.kind === 'function' && s.startLine <= line && s.endLine >= line) {
        return s.name;
      }
    }
    return undefined;
  }

  private static parseEmission(
    line: string,
    filePath: string,
    enclosingFunc: string | undefined,
    localSignals: Set<string>
  ): RelationalEdge | undefined {
    const emitMatch = line.match(/(?:([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)\.)?([a-zA-Z_]\w*)\.emit\s*\(/)
      || line.match(/emit_signal\(\s*["']([a-zA-Z_]\w*)["']/);
    if (!emitMatch) return undefined;

    const caller = enclosingFunc ? `${filePath}::${enclosingFunc}` : filePath;
    const isLegacy = line.includes('emit_signal(');
    const sigName = isLegacy ? emitMatch[1] : emitMatch[2];
    const emitterExpr = isLegacy ? undefined : emitMatch[1];

    if (emitterExpr === 'self' && !localSignals.has(sigName)) {
      return undefined;
    }

    const targetSignal = GdSignalExtractor.resolveEmitter(filePath, emitterExpr, sigName, localSignals);
    return {
      from: caller,
      to: targetSignal,
      type: 'EMITS_SIGNAL',
      metadata: { signal: sigName, ...(emitterExpr ? { emitter: emitterExpr } : {}) }
    };
  }

  private static parseConnection(
    line: string,
    filePath: string,
    localSignals: Set<string>
  ): RelationalEdge | undefined {
    const connGd4 = line.match(/(?:(\$?[a-zA-Z_]\w*(?:\/[a-zA-Z_]\w*)*)\.)?([a-zA-Z_]\w*)\.connect\(\s*(.*)\)\s*$/);
    const connLegacy = line.match(/(?:(\$?[a-zA-Z_]\w*)\.)?connect\(\s*["']([a-zA-Z_]\w*)["']\s*,\s*(.*)\)\s*$/);

    const m = connGd4 || connLegacy;
    if (!m) return undefined;

    const emitterExpr = m[1];
    const sigName = m[2];
    const callableExpr = m[3];

    const fromNode = GdSignalExtractor.resolveEmitter(filePath, emitterExpr, sigName, localSignals);
    const toNode = GdSignalExtractor.parseCallableTarget(filePath, callableExpr);

    return {
      from: fromNode,
      to: toNode,
      type: 'CONNECTS_SIGNAL',
      metadata: { signal: sigName, ...(emitterExpr ? { emitter: emitterExpr.replace(/^\$/, '') } : {}) }
    };
  }

  private static resolveEmitter(
    filePath: string,
    emitterExpr: string | undefined,
    sigName: string,
    localSignals: Set<string>
  ): string {
    if (!emitterExpr || emitterExpr === 'self') {
      return localSignals.has(sigName) ? `${filePath}::${sigName}` : `${filePath}::${sigName}`;
    }
    const clean = emitterExpr.replace(/^\$/, '');
    return `${clean}::${sigName}`;
  }

  private static parseCallableTarget(filePath: string, callableExpr: string): string {
    const trimmed = callableExpr.trim();
    const callableMatch = trimmed.match(/Callable\(\s*([^,]+)\s*,\s*["']([^"']+)["']\s*\)/);
    if (callableMatch) {
      const obj = callableMatch[1].trim();
      const method = callableMatch[2].trim();
      return obj === 'self' ? `${filePath}::${method}` : `${obj}::${method}`;
    }

    const dotMatch = trimmed.match(/^([a-zA-Z_$][\w$]*)\.([a-zA-Z_]\w*)$/);
    if (dotMatch) {
      const obj = dotMatch[1];
      const method = dotMatch[2];
      return obj === 'self' ? `${filePath}::${method}` : `${obj}::${method}`;
    }

    const idMatch = trimmed.match(/^([a-zA-Z_]\w*)$/);
    if (idMatch) {
      return `${filePath}::${idMatch[1]}`;
    }

    return `${filePath}::${trimmed}`;
  }

  private static ensureSignalNode(nodeId: string, nodes: RelationalNode[]): void {
    if (nodeId.includes('::') && !nodes.some(n => n.id === nodeId)) {
      const parts = nodeId.split('::');
      nodes.push({
        id: nodeId,
        name: parts[parts.length - 1],
        kind: 'signal',
        filePath: parts[0]
      });
    }
  }
}
