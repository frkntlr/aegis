import type { RelationalEdge, RelationalNode } from './relational-graph.js';

export interface ExtResourceItem {
  id: string;
  type: string;
  path: string;
}

export interface ParsedSceneRelations {
  nodes: RelationalNode[];
  edges: RelationalEdge[];
}

interface NodeContext {
  curNode: { name: string; scriptId?: string; instanceId?: string } | null;
  rootScriptPath: string | null;
}

export class TscnRelationParser {
  public static parse(sceneFilePath: string, content: string): ParsedSceneRelations {
    const lines = content.split(/\r?\n/);
    const extResources = new Map<string, ExtResourceItem>();
    const sceneNodes: RelationalNode[] = [{ id: sceneFilePath, name: sceneFilePath, kind: 'scene', filePath: sceneFilePath }];
    const edges: RelationalEdge[] = [];
    const ctx: NodeContext = { curNode: null, rootScriptPath: null };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      TscnRelationParser.parseExtResource(line, extResources);
      if (line.startsWith('[node ')) {
        if (ctx.curNode) TscnRelationParser.flushNodeEdges(sceneFilePath, ctx.curNode, extResources, edges);
        ctx.curNode = TscnRelationParser.extractNodeInfo(line);
        sceneNodes.push({ id: `${sceneFilePath}::${ctx.curNode.name}`, name: ctx.curNode.name, kind: 'scene', filePath: sceneFilePath });
      } else if (line.startsWith('[connection ')) {
        TscnRelationParser.parseConnection(sceneFilePath, line, ctx.rootScriptPath, edges);
      } else if (ctx.curNode) {
        TscnRelationParser.applyNodeProperty(line, ctx, extResources, sceneNodes.length === 2);
      }
    }
    if (ctx.curNode) TscnRelationParser.flushNodeEdges(sceneFilePath, ctx.curNode, extResources, edges);

    return { nodes: sceneNodes, edges };
  }

  private static applyNodeProperty(
    line: string,
    ctx: NodeContext,
    extResources: Map<string, ExtResourceItem>,
    isFirstChild: boolean
  ): void {
    if (!ctx.curNode) return;
    if (line.startsWith('script =')) {
      ctx.curNode.scriptId = TscnRelationParser.extractExtResourceId(line);
      if (ctx.curNode.name === '.' || isFirstChild) {
        const res = extResources.get(ctx.curNode.scriptId || '');
        if (res) ctx.rootScriptPath = res.path;
      }
    } else if (line.startsWith('instance =')) {
      ctx.curNode.instanceId = TscnRelationParser.extractExtResourceId(line);
    }
  }

  private static parseExtResource(line: string, extResources: Map<string, ExtResourceItem>): void {
    if (!line.startsWith('[ext_resource ')) return;
    const typeM = line.match(/type=["']([^"']+)["']/);
    const pathM = line.match(/path=["']([^"']+)["']/);
    const idM = line.match(/id=["']([^"']+)["']/);
    if (typeM && pathM && idM) {
      const cleanPath = pathM[1].replace(/^res:\/\//, '');
      extResources.set(idM[1], { id: idM[1], type: typeM[1], path: cleanPath });
    }
  }

  private static extractNodeInfo(line: string): { name: string } {
    const nameM = line.match(/name=["']([^"']+)["']/);
    return { name: nameM ? nameM[1] : 'UnknownNode' };
  }

  private static extractExtResourceId(line: string): string | undefined {
    const m = line.match(/ExtResource\(["']?([^"')]+)["']?\)/);
    return m ? m[1] : undefined;
  }

  private static flushNodeEdges(
    scenePath: string,
    node: { name: string; scriptId?: string; instanceId?: string },
    resources: Map<string, ExtResourceItem>,
    edges: RelationalEdge[]
  ): void {
    const nodeId = `${scenePath}::${node.name}`;
    if (node.scriptId) {
      const res = resources.get(node.scriptId);
      if (res) {
        edges.push({ from: nodeId, to: res.path, type: 'ATTACHES_SCRIPT' });
      }
    }
    if (node.instanceId) {
      const res = resources.get(node.instanceId);
      if (res) {
        edges.push({ from: nodeId, to: res.path, type: 'INSTANTIATES' });
      }
    }
  }

  private static parseConnection(
    scenePath: string,
    line: string,
    rootScriptPath: string | null,
    edges: RelationalEdge[]
  ): void {
    const sigM = line.match(/signal=["']([^"']+)["']/);
    const fromM = line.match(/from=["']([^"']+)["']/);
    const toM = line.match(/to=["']([^"']+)["']/);
    const methodM = line.match(/method=["']([^"']+)["']/);

    if (sigM && fromM && methodM) {
      const fromNodeId = `${scenePath}::${fromM[1]}`;
      const toTarget = toM ? toM[1] : '.';
      const targetScript = rootScriptPath || scenePath;
      const targetHandlerId = `${targetScript}::${methodM[1]}`;

      edges.push({
        from: fromNodeId,
        to: targetHandlerId,
        type: 'CONNECTS_SIGNAL',
        metadata: {
          signal: sigM[1],
          method: methodM[1],
          toNode: toTarget,
          scene: scenePath
        }
      });
    }
  }
}
