/**
 * @file godot-ui-perf-auditor.ts
 * Static UI Performance & Zero-Stutter Optimizer for Godot 4.x scenes (.tscn).
 * Audits mouse-filter overhead, clip-contents penalties, overdraw, and deep hierarchies.
 * Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';

export interface UiPerfIssue {
  severity: 'high' | 'medium' | 'low';
  nodeName: string;
  rule: string;
  message: string;
  fixSuggestion: string;
}

export interface UiPerfReport {
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  scenePath: string;
  totalNodes: number;
  issues: UiPerfIssue[];
  metrics: {
    mouseFilterStopOnNonInteractive: number;
    clipContentsCount: number;
    maxContainerDepth: number;
    inlineStyleBoxCount: number;
  };
}

interface ParsedNode {
  name: string;
  type: string;
  parent: string | null;
  properties: Map<string, string>;
}

export class GodotUiPerfAuditor {
  private static readonly DECORATIVE_TYPES = new Set([
    'ColorRect', 'TextureRect', 'NinePatchRect', 'Panel', 'MarginContainer',
    'BoxContainer', 'VBoxContainer', 'HBoxContainer', 'GridContainer',
    'CenterContainer', 'PanelContainer', 'AspectRatioContainer', 'Label'
  ]);

  public static auditScene(scenePath: string): UiPerfReport {
    if (!fs.existsSync(scenePath)) {
      return this.buildReport(scenePath, 0, [], {
        mouseFilterStopOnNonInteractive: 0, clipContentsCount: 0,
        maxContainerDepth: 0, inlineStyleBoxCount: 0
      });
    }
    try {
      return this.auditContent(fs.readFileSync(scenePath, 'utf8'), scenePath);
    } catch {
      return this.buildReport(scenePath, 0, [{
        severity: 'high', nodeName: 'Scene', rule: 'FILE_READ_ERROR',
        message: `Failed to read scene file: ${scenePath}`, fixSuggestion: 'Check file permissions.'
      }], {
        mouseFilterStopOnNonInteractive: 0, clipContentsCount: 0,
        maxContainerDepth: 0, inlineStyleBoxCount: 0
      });
    }
  }

  public static auditContent(content: string, scenePath = 'scene.tscn'): UiPerfReport {
    const nodes = this.parseNodes(content);
    const issues: UiPerfIssue[] = [];
    const metrics = {
      mouseFilterStopOnNonInteractive: 0,
      clipContentsCount: 0,
      maxContainerDepth: this.calculateMaxDepth(nodes),
      inlineStyleBoxCount: (content.match(/\[sub_resource type="StyleBoxFlat"/g) || []).length
    };

    for (const node of nodes) {
      this.checkMouseFilter(node, issues, metrics);
      this.checkClipContents(node, issues, metrics);
    }
    this.checkHierarchyAndStyles(metrics, issues);

    const penalty = (issues.filter(i => i.severity === 'high').length * 20) +
                    (issues.filter(i => i.severity === 'medium').length * 10) +
                    (issues.filter(i => i.severity === 'low').length * 5);
    const score = Math.max(0, 100 - penalty);

    return this.buildReport(scenePath, score, issues, metrics, nodes.length);
  }

  private static checkMouseFilter(node: ParsedNode, issues: UiPerfIssue[], m: { mouseFilterStopOnNonInteractive: number }): void {
    if (!this.DECORATIVE_TYPES.has(node.type)) return;
    const filter = node.properties.get('mouse_filter');
    if (!filter || filter === '0') {
      m.mouseFilterStopOnNonInteractive++;
      issues.push({
        severity: 'medium',
        nodeName: node.name,
        rule: 'MOUSE_FILTER_OVERHEAD',
        message: `Decorative node "${node.name}" (${node.type}) handles mouse picking (mouse_filter=0).`,
        fixSuggestion: 'Set "mouse_filter = 2" (Ignore) to bypass mouse raycast loops on non-interactive controls.'
      });
    }
  }

  private static checkClipContents(node: ParsedNode, issues: UiPerfIssue[], m: { clipContentsCount: number }): void {
    if (node.properties.get('clip_contents') === 'true' && node.type !== 'ScrollContainer') {
      m.clipContentsCount++;
      issues.push({
        severity: 'medium',
        nodeName: node.name,
        rule: 'CLIP_CONTENTS_PENALTY',
        message: `Node "${node.name}" has clip_contents=true; breaks 2D batching and incurs scissor switches.`,
        fixSuggestion: 'Disable clip_contents unless strictly required to hide overflowing content.'
      });
    }
  }

  private static checkHierarchyAndStyles(m: { maxContainerDepth: number; inlineStyleBoxCount: number }, issues: UiPerfIssue[]): void {
    if (m.maxContainerDepth > 5) {
      issues.push({
        severity: 'high',
        nodeName: 'ContainerTree',
        rule: 'DEEP_CONTAINER_NESTING',
        message: `Container nesting depth (${m.maxContainerDepth}) exceeds recommended maximum of 5.`,
        fixSuggestion: 'Flatten UI hierarchy to prevent layout thrashing during dynamic resizing.'
      });
    }
    if (m.inlineStyleBoxCount > 6) {
      issues.push({
        severity: 'low',
        nodeName: 'ThemeOverrides',
        rule: 'INLINE_STYLEBOX_FRAGMENTATION',
        message: `Scene contains ${m.inlineStyleBoxCount} inline StyleBoxes; may fragment GPU batching.`,
        fixSuggestion: 'Consolidate styles into a shared .tres Theme resource.'
      });
    }
  }

  public static optimizeContent(content: string): { optimizedContent: string; fixesApplied: string[] } {
    const lines = content.split(/\r?\n/);
    const fixes: string[] = [];
    const output: string[] = [];
    let curType = '';
    let curName = '';
    let hasFilter = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('[node ')) {
        if (curName && this.DECORATIVE_TYPES.has(curType) && !hasFilter) {
          output.push('mouse_filter = 2');
          fixes.push(`Added mouse_filter = 2 to decorative node "${curName}" (${curType})`);
        }
        curName = line.match(/name="([^"]+)"/)?.[1] || '';
        curType = line.match(/type="([^"]+)"/)?.[1] || '';
        hasFilter = false;
        output.push(line);
      } else if (line.trim().startsWith('mouse_filter = 0') && this.DECORATIVE_TYPES.has(curType)) {
        output.push('mouse_filter = 2');
        fixes.push(`Upgraded mouse_filter from 0 to 2 on "${curName}"`);
        hasFilter = true;
      } else if (line.trim().startsWith('clip_contents = true') && curType !== 'ScrollContainer') {
        fixes.push(`Removed redundant clip_contents from "${curName}"`);
      } else {
        if (line.trim().startsWith('mouse_filter')) hasFilter = true;
        output.push(line);
      }
    }
    if (curName && this.DECORATIVE_TYPES.has(curType) && !hasFilter) {
      output.push('mouse_filter = 2');
      fixes.push(`Added mouse_filter = 2 to decorative node "${curName}" (${curType})`);
    }
    return { optimizedContent: output.join('\n'), fixesApplied: fixes };
  }

  private static parseNodes(content: string): ParsedNode[] {
    const nodes: ParsedNode[] = [];
    let cur: ParsedNode | null = null;
    for (const raw of content.split(/\r?\n/)) {
      const line = raw.trim();
      if (line.startsWith('[node ')) {
        if (cur) nodes.push(cur);
        cur = {
          name: line.match(/name="([^"]+)"/)?.[1] || 'Node',
          type: line.match(/type="([^"]+)"/)?.[1] || 'Node',
          parent: line.match(/parent="([^"]+)"/)?.[1] || null,
          properties: new Map()
        };
      } else if (cur && line.includes('=') && !line.startsWith('[')) {
        const idx = line.indexOf('=');
        cur.properties.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
      }
    }
    if (cur) nodes.push(cur);
    return nodes;
  }

  private static calculateMaxDepth(nodes: ParsedNode[]): number {
    let max = 0;
    for (const node of nodes) {
      if (!node.parent || node.parent === '.') continue;
      const depth = node.parent.split('/').length + 1;
      if (depth > max) max = depth;
    }
    return max;
  }

  private static buildReport(
    scenePath: string, score: number, issues: UiPerfIssue[],
    metrics: UiPerfReport['metrics'], totalNodes = 0
  ): UiPerfReport {
    const grade = score >= 95 ? 'A+' : score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
    return { score, grade, scenePath, totalNodes, issues, metrics };
  }
}
