/**
 * @file godot-ui-linter.ts
 * Static AST & structural linter for Godot 4.x UI scenes (.tscn).
 * Inspects responsive anchors, container children hygiene, touch targets, accessibility, and signals.
 * Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';

export interface UiLintIssue {
  severity: 'error' | 'warning' | 'info';
  nodeName: string;
  rule: string;
  message: string;
  fixSuggestion: string;
}

export interface UiLintReport {
  valid: boolean;
  scenePath: string;
  rootNodeType?: string;
  nodeCount: number;
  issues: UiLintIssue[];
  score: number;
}

interface ParsedUiNode {
  name: string;
  type: string;
  parent: string | null;
  properties: Map<string, string>;
}

interface ParsedConnection {
  signal: string;
  from: string;
  to: string;
  method: string;
}

export class GodotUiLinter {
  private static readonly CONTAINER_TYPES = new Set([
    'Container', 'BoxContainer', 'VBoxContainer', 'HBoxContainer',
    'GridContainer', 'FlowContainer', 'HFlowContainer', 'VFlowContainer',
    'MarginContainer', 'PanelContainer', 'CenterContainer', 'ScrollContainer',
    'TabContainer', 'AspectRatioContainer', 'SplitContainer', 'HSplitContainer',
    'VSplitContainer', 'SubViewportContainer'
  ]);

  private static readonly INTERACTIVE_BUTTON_TYPES = new Set([
    'Button', 'TextureButton', 'CheckButton', 'CheckBox', 'OptionButton',
    'MenuButton', 'LinkButton', 'ColorPickerButton'
  ]);

  public static lintScene(scenePath: string, gdScriptPath?: string): UiLintReport {
    if (!fs.existsSync(scenePath)) {
      return { valid: false, scenePath, nodeCount: 0, issues: [{
        severity: 'error', nodeName: 'Scene', rule: 'FILE_NOT_FOUND',
        message: `Scene file not found: ${scenePath}`, fixSuggestion: 'Verify the file path exists.'
      }], score: 0 };
    }
    return this.lintContent(fs.readFileSync(scenePath, 'utf8'), scenePath, gdScriptPath);
  }

  public static lintContent(content: string, scenePath = 'scene.tscn', gdScriptPath?: string): UiLintReport {
    const { nodes, connections } = this.parseScene(content);
    const issues: UiLintIssue[] = [];
    const root = nodes[0];

    if (root) this.checkRootResponsiveness(root, issues);
    this.checkNodesInScene(nodes, issues);
    this.checkSignalConnections(connections, nodes, gdScriptPath, issues);

    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const score = Math.max(0, 100 - (errorCount * 25) - (warningCount * 10));

    return {
      valid: errorCount === 0,
      scenePath,
      rootNodeType: root?.type,
      nodeCount: nodes.length,
      issues,
      score
    };
  }

  private static parseScene(content: string): { nodes: ParsedUiNode[]; connections: ParsedConnection[] } {
    const nodes: ParsedUiNode[] = [];
    const connections: ParsedConnection[] = [];
    let cur: ParsedUiNode | null = null;

    for (const raw of content.split(/\r?\n/)) {
      const line = raw.trim();
      if (line.startsWith('[node ')) {
        if (cur) nodes.push(cur);
        cur = this.parseNodeHeader(line);
      } else if (line.startsWith('[connection ')) {
        if (cur) { nodes.push(cur); cur = null; }
        const conn = this.parseConnectionHeader(line);
        if (conn) connections.push(conn);
      } else if (cur && line.includes('=') && !line.startsWith('[')) {
        const idx = line.indexOf('=');
        cur.properties.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
      }
    }
    if (cur) nodes.push(cur);
    return { nodes, connections };
  }

  private static parseNodeHeader(line: string): ParsedUiNode {
    const name = line.match(/name="([^"]+)"/)?.[1] || 'Unknown';
    const type = line.match(/type="([^"]+)"/)?.[1] || 'Node';
    const parent = line.match(/parent="([^"]+)"/)?.[1] || null;
    return { name, type, parent, properties: new Map() };
  }

  private static parseConnectionHeader(line: string): ParsedConnection | null {
    const sig = line.match(/signal="([^"]+)"/)?.[1];
    const from = line.match(/from="([^"]+)"/)?.[1];
    const to = line.match(/to="([^"]+)"/)?.[1];
    const meth = line.match(/method="([^"]+)"/)?.[1];
    if (!sig || !from || !to || !meth) return null;
    return { signal: sig, from, to, method: meth };
  }

  private static checkRootResponsiveness(root: ParsedUiNode, issues: UiLintIssue[]): void {
    const isCtrl = root.type === 'Control' || root.type.endsWith('Container') || root.type === 'ColorRect';
    if (!isCtrl) return;
    const hasPreset = root.properties.has('anchors_preset');
    const hasAnchors = root.properties.has('anchor_right') || root.properties.has('anchor_bottom');
    if (!hasPreset && !hasAnchors) {
      issues.push({
        severity: 'warning',
        nodeName: root.name,
        rule: 'ROOT_CONTROL_RESPONSIVENESS',
        message: `Root ${root.type} lacks anchors_preset; will not resize with viewport window.`,
        fixSuggestion: 'Set "anchors_preset = 15" (Full Rect) and "grow_horizontal = 2, grow_vertical = 2".'
      });
    }
  }

  private static checkNodesInScene(nodes: ParsedUiNode[], issues: UiLintIssue[]): void {
    const map = new Map<string, ParsedUiNode>();
    for (const n of nodes) map.set(n.name, n);
    for (const node of nodes) {
      this.checkContainerChildConflict(node, map, issues);
      this.checkButtonTouchTarget(node, issues);
      this.checkScrollContainerSizing(node, issues);
      this.checkAccessibilityMetadata(node, issues);
    }
  }

  private static checkContainerChildConflict(node: ParsedUiNode, map: Map<string, ParsedUiNode>, issues: UiLintIssue[]): void {
    if (!node.parent || node.parent === '.') return;
    const parent = map.get(node.parent.split('/').pop() || '');
    if (!parent || !this.CONTAINER_TYPES.has(parent.type)) return;

    if (node.properties.has('position') || node.properties.has('offset_left') || node.properties.has('offset_top')) {
      issues.push({
        severity: 'warning',
        nodeName: node.name,
        rule: 'CONTAINER_CHILD_CONFLICT',
        message: `Node "${node.name}" inside container "${parent.name}" defines manual position/offsets.`,
        fixSuggestion: 'Remove manual position/offset. Container manages child layout; use size_flags instead.'
      });
    }
    const layout = node.properties.get('layout_mode');
    if (layout === '0' || layout === '1') {
      issues.push({
        severity: 'warning',
        nodeName: node.name,
        rule: 'CONTAINER_LAYOUT_MODE',
        message: `Node "${node.name}" inside container "${parent.name}" specifies manual layout_mode (${layout}).`,
        fixSuggestion: 'Use "layout_mode = 2" (Container Sizing) or omit layout_mode when inside a Container.'
      });
    }
  }

  private static checkButtonTouchTarget(node: ParsedUiNode, issues: UiLintIssue[]): void {
    if (!this.INTERACTIVE_BUTTON_TYPES.has(node.type)) return;
    const minSize = node.properties.get('custom_minimum_size');
    if (!minSize) {
      issues.push({
        severity: 'info',
        nodeName: node.name,
        rule: 'TOUCH_TARGET_SIZE',
        message: `Button "${node.name}" lacks custom_minimum_size; may be difficult to press on touch devices.`,
        fixSuggestion: 'Set custom_minimum_size = Vector2(44, 44) or larger for accessible mobile/touch targets.'
      });
      return;
    }
    const m = minSize.match(/Vector2\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
    if (m && (parseFloat(m[1]) < 44 || parseFloat(m[2]) < 44)) {
      issues.push({
        severity: 'warning',
        nodeName: node.name,
        rule: 'TOUCH_TARGET_SIZE',
        message: `Button "${node.name}" custom_minimum_size (${m[1]}x${m[2]}px) is below recommended 44x44px.`,
        fixSuggestion: 'Increase custom_minimum_size to at least Vector2(44, 44).'
      });
    }
  }

  private static checkAccessibilityMetadata(node: ParsedUiNode, issues: UiLintIssue[]): void {
    if (!this.INTERACTIVE_BUTTON_TYPES.has(node.type)) return;
    const text = node.properties.get('text');
    const tip = node.properties.get('tooltip_text');
    if ((!text || text === '""') && (!tip || tip === '""') && !node.properties.has('accessibility_name')) {
      issues.push({
        severity: 'info',
        nodeName: node.name,
        rule: 'ACCESSIBILITY_METADATA',
        message: `Interactive control "${node.name}" lacks text, tooltip_text, and accessibility_name.`,
        fixSuggestion: 'Provide a descriptive "tooltip_text" or "accessibility_name" for screen reader accessibility.'
      });
    }
  }

  private static checkScrollContainerSizing(node: ParsedUiNode, issues: UiLintIssue[]): void {
    if (node.type !== 'ScrollContainer') return;
    if (!node.properties.has('size_flags_vertical') && !node.properties.has('custom_minimum_size')) {
      issues.push({
        severity: 'info',
        nodeName: node.name,
        rule: 'SCROLL_CONTAINER_SIZING',
        message: `ScrollContainer "${node.name}" lacks size_flags_vertical and custom_minimum_size; may collapse.`,
        fixSuggestion: 'Set size_flags_vertical = 3 (Expand | Fill) or custom_minimum_size with explicit height.'
      });
    }
  }

  private static checkSignalConnections(
    conns: ParsedConnection[],
    nodes: ParsedUiNode[],
    scriptPath: string | undefined,
    issues: UiLintIssue[]
  ): void {
    const nodeNames = new Set(nodes.map(n => n.name));
    let methods: Set<string> | null = null;
    if (scriptPath && fs.existsSync(scriptPath)) {
      methods = this.extractScriptMethods(fs.readFileSync(scriptPath, 'utf8'));
    }

    for (const c of conns) {
      const fromLeaf = c.from.split('/').pop() || c.from;
      if (c.from !== '.' && !nodeNames.has(fromLeaf)) {
        issues.push({
          severity: 'error', nodeName: c.from, rule: 'DANGLING_SIGNAL_NODE',
          message: `Connection from node "${c.from}" references non-existent node in scene.`,
          fixSuggestion: `Verify node path "${c.from}" matches a valid node name in the scene tree.`
        });
      }
      if (methods && !methods.has(c.method)) {
        issues.push({
          severity: 'error', nodeName: c.to, rule: 'SCRIPT_METHOD_MISSING',
          message: `Target method "${c.method}" connected to signal "${c.signal}" is not implemented in script.`,
          fixSuggestion: `Define "func ${c.method}():" in attached script ${scriptPath}.`
        });
      }
    }
  }

  private static extractScriptMethods(scriptContent: string): Set<string> {
    const methods = new Set<string>();
    for (const line of scriptContent.split(/\r?\n/)) {
      const m = line.match(/^func\s+([a-zA-Z0-9_]+)\s*\(/);
      if (m) methods.add(m[1]);
    }
    return methods;
  }
}
