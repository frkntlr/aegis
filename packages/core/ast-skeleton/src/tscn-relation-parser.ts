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
  nodeScripts: Map<string, string>;
}

export class TscnRelationParser {
  public static parse(sceneFilePath: string, content: string): ParsedSceneRelations {
    const normScenePath = sceneFilePath.replace(/\\/g, '/');
    const lines = content.split(/\r?\n/);
    const extResources = new Map<string, ExtResourceItem>();
    const sceneNodes: RelationalNode[] = [{ id: normScenePath, name: normScenePath, kind: 'scene', filePath: normScenePath }];
    const edges: RelationalEdge[] = [];
    const ctx: NodeContext = { curNode: null, rootScriptPath: null, nodeScripts: new Map() };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      TscnRelationParser.parseExtResource(line, extResources);
      if (line.startsWith('[node ')) {
        if (ctx.curNode) TscnRelationParser.flushNodeEdges(normScenePath, ctx.curNode, extResources, edges);
        ctx.curNode = TscnRelationParser.extractNodeInfo(line);
        sceneNodes.push({ id: `${normScenePath}::${ctx.curNode.name}`, name: ctx.curNode.name, kind: 'scene', filePath: normScenePath });
      } else if (line.startsWith('[connection ')) {
        TscnRelationParser.parseConnection(normScenePath, line, ctx, edges);
      } else if (ctx.curNode) {
        TscnRelationParser.applyNodeProperty(line, ctx, extResources, sceneNodes.length === 2);
      }
    }
    if (ctx.curNode) TscnRelationParser.flushNodeEdges(normScenePath, ctx.curNode, extResources, edges);

    return { nodes: sceneNodes, edges };
  }

  private static applyNodeProperty(
    line: string,
    ctx: NodeContext,
    extResources: Map<string, ExtResourceItem>,
    isFirstChild: boolean
  ): void {
    if (!ctx.curNode) return;
    if (/^script\s*=/.test(line)) {
      ctx.curNode.scriptId = TscnRelationParser.extractExtResourceId(line);
      const res = extResources.get(ctx.curNode.scriptId || '');
      if (res) {
        ctx.nodeScripts.set(ctx.curNode.name, res.path);
        if (ctx.curNode.name === '.' || isFirstChild) ctx.rootScriptPath = res.path;
      }
    } else if (/^instance\s*=/.test(line)) {
      ctx.curNode.instanceId = TscnRelationParser.extractExtResourceId(line);
    }
  }

  private static parseExtResource(line: string, extResources: Map<string, ExtResourceItem>): void {
    if (!line.startsWith('[ext_resource ')) return;
    const typeM = line.match(/type\s*=\s*["']([^"']+)["']/);
    const pathM = line.match(/path\s*=\s*["']([^"']+)["']/);
    const idM = line.match(/id\s*=\s*["']?([^"'\s\]]+)["']?/);
    if (typeM && pathM && idM) {
      const cleanPath = pathM[1].replace(/^res:\/\//, '').replace(/\\/g, '/');
      extResources.set(idM[1], { id: idM[1], type: typeM[1], path: cleanPath });
    }
  }

  private static extractNodeInfo(line: string): { name: string } {
    const nameM = line.match(/name\s*=\s*["']([^"']+)["']/);
    return { name: nameM ? nameM[1] : 'UnknownNode' };
  }

  private static extractExtResourceId(line: string): string | undefined {
    const m = line.match(/ExtResource\(\s*["']?([^"')\s]+)["']?\s*\)/);
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
    ctx: NodeContext,
    edges: RelationalEdge[]
  ): void {
    const sigM = line.match(/signal\s*=\s*["']([^"']+)["']/);
    const fromM = line.match(/from\s*=\s*["']([^"']+)["']/);
    const toM = line.match(/to\s*=\s*["']([^"']+)["']/);
    const methodM = line.match(/method\s*=\s*["']([^"']+)["']/);

    if (sigM && fromM && methodM) {
      const fromNodeId = `${scenePath}::${fromM[1]}`;
      const toTarget = toM ? toM[1] : '.';
      const targetScript = (toTarget === '.' ? ctx.rootScriptPath : ctx.nodeScripts.get(toTarget)) || ctx.rootScriptPath || scenePath;
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
