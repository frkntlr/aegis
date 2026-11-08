/**
 * @file godot-scene-slicer.ts
 * RFC-051 Zero-Token Targeted Scene Slicer (TSS) for Multi-Agent Godot Workflows.
 * Static AST parsing via GodotUiParser without engine cold-start (<2ms, <150 tokens).
 * Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import { GodotUiParser, type ParsedConnection, type ParsedScene, type ParsedUiNode } from './godot-ui-parser.js';

export interface TargetedSliceOptions {
  focusNode?: string;
  maxDepth?: number;
  compact?: boolean;
}

export interface SlicedNodeContext {
  node: ParsedUiNode;
  fullPath: string;
  parentPath: string | null;
  depth: number;
  childPaths: string[];
}

function extractExtResources(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of content.split(/\r?\n/)) {
    if (!line.startsWith('[ext_resource ')) continue;
    const id = line.match(/id="?([^"\s]+)"?/)?.[1];
    const resPath = line.match(/path="([^"]+)"/)?.[1];
    if (id && resPath) {
      map.set(id, resPath);
    }
  }
  return map;
}

function buildHierarchy(nodes: ParsedUiNode[]): Map<string, SlicedNodeContext> {
  const map = new Map<string, SlicedNodeContext>();
  if (nodes.length === 0) return map;

  const rootName = nodes[0]?.name ?? 'Root';

  for (const node of nodes) {
    let fullPath: string;
    let parentPath: string | null = null;
    let depth = 0;

    if (!node.parent) {
      fullPath = node.name;
    } else if (node.parent === '.') {
      parentPath = rootName;
      fullPath = `${rootName}/${node.name}`;
      depth = 1;
    } else {
      parentPath = `${rootName}/${node.parent}`;
      fullPath = `${parentPath}/${node.name}`;
      depth = node.parent.split('/').length + 1;
    }

    map.set(fullPath, { node, fullPath, parentPath, depth, childPaths: [] });
  }

  for (const ctx of map.values()) {
    if (ctx.parentPath && map.has(ctx.parentPath)) {
      map.get(ctx.parentPath)!.childPaths.push(ctx.fullPath);
    }
  }

  return map;
}

function findFocusContext(
  map: Map<string, SlicedNodeContext>,
  focus: string
): SlicedNodeContext | undefined {
  const clean = focus.startsWith('%') ? focus.slice(1) : focus;

  for (const ctx of map.values()) {
    const isUnique = ctx.node.properties.get('unique_name_in_owner') === 'true';
    if (isUnique && (ctx.node.name === clean || ctx.node.name === focus)) {
      return ctx;
    }
    if (ctx.node.name === clean || ctx.node.name === focus) {
      return ctx;
    }
  }

  const lower = clean.toLowerCase();
  for (const ctx of map.values()) {
    if (ctx.node.name.toLowerCase() === lower || ctx.fullPath.toLowerCase().endsWith('/' + lower)) {
      return ctx;
    }
  }

  return undefined;
}

function resolveAllowedPaths(
  map: Map<string, SlicedNodeContext>,
  focusNode?: string
): Set<string> | null {
  if (!focusNode) return null;

  const focus = findFocusContext(map, focusNode);
  if (!focus) return new Set();

  const allowed = new Set<string>();
  allowed.add(focus.fullPath);

  let cur = focus.parentPath;
  while (cur) {
    allowed.add(cur);
    cur = map.get(cur)?.parentPath ?? null;
  }

  for (const childPath of focus.childPaths) {
    allowed.add(childPath);
  }

  return allowed;
}

function formatAttributes(
  node: ParsedUiNode,
  conns: ParsedConnection[],
  ext: Map<string, string>
): string[] {
  const attrs: string[] = [];

  if (node.properties.has('anchors_preset')) {
    attrs.push(`anchors_preset: ${node.properties.get('anchors_preset')}`);
  }
  if (node.properties.has('custom_minimum_size')) {
    attrs.push(`custom_minimum_size: ${node.properties.get('custom_minimum_size')}`);
  }

  const script = node.properties.get('script');
  if (script) {
    const resId = script.match(/ExtResource\(["']?([^"'\)]+)["']?\)/)?.[1];
    const resolved = (resId && ext.get(resId)) || script;
    attrs.push(`script: ${resolved}`);
  }

  const nodeConns = conns.filter(c => c.from === node.name || c.from.endsWith('/' + node.name));
  if (nodeConns.length > 0) {
    const list = nodeConns.map(c => `${c.signal} -> ${c.to === '.' ? '' : c.to + '.'}${c.method}`);
    attrs.push(`signals: [${list.join(', ')}]`);
  }

  return attrs;
}

function formatNodeLine(
  ctx: SlicedNodeContext,
  conns: ParsedConnection[],
  ext: Map<string, string>,
  compact: boolean
): string {
  const isUnique = ctx.node.properties.get('unique_name_in_owner') === 'true';
  const name = isUnique && !ctx.node.name.startsWith('%') ? `%${ctx.node.name}` : ctx.node.name;
  const attrs = formatAttributes(ctx.node, conns, ext);
  const metaStr = attrs.length > 0 ? ` (${attrs.join(', ')})` : '';

  if (compact) {
    return `${'  '.repeat(ctx.depth)}${name} [${ctx.node.type}]${metaStr}`;
  }

  if (ctx.depth === 0) {
    return `${name} [${ctx.node.type}]${metaStr}`;
  }

  const prefix = `${'  '.repeat(ctx.depth - 1)}└── `;
  return `${prefix}${name} [${ctx.node.type}]${metaStr}`;
}

export class GodotSceneSlicer {
  public static parseFile(filePath: string): ParsedScene {
    const content = fs.readFileSync(filePath, 'utf8');
    return GodotUiParser.parseScene(content);
  }

  public static sliceContent(content: string, options?: TargetedSliceOptions): string {
    const scene = GodotUiParser.parseScene(content);
    if (scene.nodes.length === 0) return '';

    const hierarchy = buildHierarchy(scene.nodes);
    const allowed = resolveAllowedPaths(hierarchy, options?.focusNode);
    if (allowed && allowed.size === 0) return '';

    const ext = extractExtResources(content);
    const compact = options?.compact === true;
    const maxDepth = options?.maxDepth;

    const lines: string[] = [];
    for (const ctx of hierarchy.values()) {
      if (allowed && !allowed.has(ctx.fullPath)) continue;
      if (maxDepth !== undefined && ctx.depth > maxDepth) continue;
      lines.push(formatNodeLine(ctx, scene.connections, ext, compact));
    }

    return lines.join('\n');
  }

  public static sliceScene(scenePath: string, options?: TargetedSliceOptions): string {
    let content: string;
    if (fs.existsSync(scenePath)) {
      content = fs.readFileSync(scenePath, 'utf8');
    } else if (scenePath.includes('[node ') || scenePath.includes('[gd_scene')) {
      content = scenePath;
    } else {
      throw new Error(`Scene file not found: ${scenePath}`);
    }

    return this.sliceContent(content, options);
  }
}
