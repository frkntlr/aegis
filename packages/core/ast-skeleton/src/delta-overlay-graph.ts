/**
 * @file delta-overlay-graph.ts
 * Delta-Overlay Graph (DOG) Architecture: Decouples pure first-party graph storage from
 * immutable, cross-worktree persistent external ground-truth overlay.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  RelationalGraph,
  type RelationalNode,
  type RelationalEdge,
  type RelationalEdgeType,
  type GraphSerialized
} from './relational-graph.js';

export interface DeltaOverlayGraphOptions {
  localGraphPath?: string;
  externalCachePath?: string;
  localGraph?: RelationalGraph;
  externalOverlay?: RelationalGraph;
}

export class CompositeGraphView {
  constructor(
    private readonly localGraph: RelationalGraph,
    private readonly externalOverlay: RelationalGraph
  ) {}

  public getNode(id: string): RelationalNode | undefined {
    return this.localGraph.getNode(id) || this.externalOverlay.getNode(id);
  }

  public hasNode(id: string): boolean {
    return this.localGraph.hasNode(id) || this.externalOverlay.hasNode(id);
  }

  public getOutgoing(id: string): RelationalEdge[] {
    const localEdges = this.localGraph.getOutgoing(id);
    const extEdges = this.externalOverlay.getOutgoing(id);
    const seen = new Set(localEdges.map((e: RelationalEdge) => `${e.from}->${e.to}:${e.type}`));
    const combined: RelationalEdge[] = [...localEdges];
    for (const e of extEdges) {
      const k = `${e.from}->${e.to}:${e.type}`;
      if (!seen.has(k)) {
        seen.add(k);
        combined.push(e);
      }
    }
    return combined;
  }

  public getIncoming(id: string): RelationalEdge[] {
    const localEdges = this.localGraph.getIncoming(id);
    const extEdges = this.externalOverlay.getIncoming(id);
    return [...localEdges, ...extEdges];
  }

  public getExternalCallees(symbolId: string): RelationalNode[] {
    const edges = this.getOutgoing(symbolId);
    const externalNodes: RelationalNode[] = [];
    for (const e of edges) {
      if (e.type === 'CALLS_EXTERNAL' || e.type === 'EXTENDS_FRAMEWORK') {
        let target = this.getNode(e.to);
        if (!target && (e.to.includes('::') || e.to.includes(':'))) {
          const parts = e.to.split(/::|:/);
          const lib = parts.length > 2 ? parts[1] : 'external';
          const sym = parts[parts.length - 1];
          target = {
            id: e.to,
            name: sym,
            kind: 'external_doc',
            filePath: `external://${lib}`,
            metadata: { library: lib, ...(e.metadata || {}) }
          };
        }
        if (target && target.kind === 'external_doc') {
          externalNodes.push(target);
        }
      }
    }
    return externalNodes;
  }

  public getAllNodes(): RelationalNode[] {
    const local = this.localGraph.getAllNodes();
    const seen = new Set(local.map((n: RelationalNode) => n.id));
    const combined: RelationalNode[] = [...local];
    for (const n of this.externalOverlay.getAllNodes()) {
      if (!seen.has(n.id)) {
        seen.add(n.id);
        combined.push(n);
      }
    }
    return combined;
  }
}

export class DeltaOverlayGraph {
  public readonly localGraph: RelationalGraph;
  public readonly externalOverlay: RelationalGraph;
  private readonly localPath: string;
  private readonly externalPath: string;
  private readonly packageVersions = new Map<string, string>();

  constructor(options: DeltaOverlayGraphOptions = {}) {
    this.localGraph = options.localGraph || new RelationalGraph();
    this.externalOverlay = options.externalOverlay || new RelationalGraph();
    this.localPath = options.localGraphPath || path.resolve(process.cwd(), '.aegis', 'cache', 'graph.json');
    this.externalPath = options.externalCachePath || path.resolve(process.cwd(), '.aegis', 'cache', 'context7', 'external-graph.cache');
  }

  public addExternalNode(lib: string, symbol: string, metadata: Record<string, string> = {}): RelationalNode {
    const id = `context7::${lib}::${symbol}`.replace(/\\/g, '/');
    const node: RelationalNode = {
      id,
      name: symbol,
      kind: 'external_doc',
      filePath: `external://${lib}`,
      metadata: { library: lib, ...metadata }
    };
    this.externalOverlay.addNode(node);
    return node;
  }

  public addCrossBoundaryEdge(
    fromLocalId: string,
    toExternalId: string,
    type: 'CALLS_EXTERNAL' | 'EXTENDS_FRAMEWORK',
    metadata?: Record<string, string>
  ): void {
    const edge: RelationalEdge = {
      from: fromLocalId.replace(/\\/g, '/'),
      to: toExternalId.replace(/\\/g, '/'),
      type: type as RelationalEdgeType,
      metadata
    };
    this.externalOverlay.addEdge(edge);
  }

  public isPackageVersionCached(pkg: string, version: string): boolean {
    return this.packageVersions.get(pkg) === version;
  }

  public registerPackageVersion(pkg: string, version: string): void {
    this.packageVersions.set(pkg, version);
  }

  public saveLocal(customPath?: string): boolean {
    const p = customPath || this.localPath;
    try {
      this.localGraph.saveCache(p);
      return fs.existsSync(p);
    } catch {
      return false;
    }
  }

  public saveExternal(customPath?: string): boolean {
    const p = customPath || this.externalPath;
    const payload = {
      version: '1.0',
      packages: Object.fromEntries(this.packageVersions.entries()),
      graph: this.externalOverlay.toJSON()
    };
    try {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(payload, null, 2), 'utf8');
      return true;
    } catch {
      return false;
    }
  }

  public loadLocal(customPath?: string): boolean {
    const p = customPath || this.localPath;
    return this.localGraph.loadCache(p);
  }

  public loadExternal(customPath?: string): boolean {
    const p = customPath || this.externalPath;
    if (!fs.existsSync(p)) return false;
    try {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (parsed.packages) {
        for (const [k, v] of Object.entries(parsed.packages)) {
          this.packageVersions.set(k, String(v));
        }
      }
      if (parsed.graph) {
        this.externalOverlay.fromJSON(parsed.graph as GraphSerialized);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  public getCompositeView(): CompositeGraphView {
    return new CompositeGraphView(this.localGraph, this.externalOverlay);
  }
}
