/**
 * @file godot-ui-linter.ts
 * Static AST & structural linter for Godot 4.x UI scenes (.tscn).
 * Inspects responsive anchors, container children hygiene, touch targets, and signal integrity.
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
    'GridContainer', 'FlowContainer', 'HFlowContainer', 'MarginContainer',
    'PanelContainer', 'CenterContainer', 'ScrollContainer', 'TabContainer',
    'AspectRatioContainer', 'HSplitContainer', 'VSplitContainer'
  ]);

  private static readonly INTERACTIVE_BUTTON_TYPES = new Set([
    'Button', 'TextureButton', 'CheckButton', 'CheckBox', 'OptionButton', 'MenuButton'
  ]);

  public static lintScene(scenePath: string, gdScriptPath?: string): UiLintReport {
    if (!fs.existsSync(scenePath)) {
      return { valid: false, scenePath, nodeCount: 0, issues: [{
        severity: 'error', nodeName: 'Scene', rule: 'FILE_NOT_FOUND',
        message: `Scene file not found: ${scenePath}`, fixSuggestion: 'Verify the file path exists.'
      }], score: 0 };
    }
    const content = fs.readFileSync(scenePath, 'utf8');
    return this.lintContent(content, scenePath, gdScriptPath);
  }

  public static lintContent(content: string, scenePath = 'scene.tscn', gdScriptPath?: string): UiLintReport {
    const { nodes, connections } = this.parseScene(content);
    const issues: UiLintIssue[] = [];
    const rootNode = nodes[0];

    if (rootNode) {
      this.checkRootResponsiveness(rootNode, issues);
    }
    this.checkNodesInScene(nodes, issues);
    this.checkSignalConnections(connections, nodes, gdScriptPath, issues);

    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const score = Math.max(0, 100 - (errorCount * 25) - (warningCount * 10));

    return {
      valid: errorCount === 0,
      scenePath,
      rootNodeType: rootNode?.type,
      nodeCount: nodes.length,
      issues,
      score
    };
  }

  private static parseScene(content: string): { nodes: ParsedUiNode[]; connections: ParsedConnection[] } {
    const nodes: ParsedUiNode[] = [];
    const connections: ParsedConnection[] = [];
    const lines = content.split(/\r?\n/);
    let currentNode: ParsedUiNode | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith('[node ')) {
        if (currentNode) nodes.push(currentNode);
        currentNode = this.parseNodeHeader(line);
      } else if (line.startsWith('[connection ')) {
        if (currentNode) { nodes.push(currentNode); currentNode = null; }
        const conn = this.parseConnectionHeader(line);
        if (conn) connections.push(conn);
      } else if (currentNode && line.includes('=') && !line.startsWith('[')) {
        const eqIdx = line.indexOf('=');
        const key = line.slice(0, eqIdx).trim();
        const val = line.slice(eqIdx + 1).trim();
        currentNode.properties.set(key, val);
      }
    }
    if (currentNode) nodes.push(currentNode);
    return { nodes, connections };
  }

  private static parseNodeHeader(line: string): ParsedUiNode {
    const nameM = line.match(/name="([^"]+)"/);
    const typeM = line.match(/type="([^"]+)"/);
    const parentM = line.match(/parent="([^"]+)"/);
    return {
      name: nameM ? nameM[1] : 'Unknown',
      type: typeM ? typeM[1] : 'Node',
      parent: parentM ? parentM[1] : null,
      properties: new Map()
    };
  }

  private static parseConnectionHeader(line: string): ParsedConnection | null {
    const sigM = line.match(/signal="([^"]+)"/);
    const fromM = line.match(/from="([^"]+)"/);
    const toM = line.match(/to="([^"]+)"/);
    const methM = line.match(/method="([^"]+)"/);
    if (!sigM || !fromM || !toM || !methM) return null;
    return { signal: sigM[1], from: fromM[1], to: toM[1], method: methM[1] };
  }

  private static checkRootResponsiveness(root: ParsedUiNode, issues: UiLintIssue[]): void {
    const isControl = root.type === 'Control' || root.type.endsWith('Container') || root.type === 'ColorRect';
    if (!isControl) return;

    const hasPreset = root.properties.has('anchors_preset');
    const hasAnchors = root.properties.has('anchor_right') || root.properties.has('anchor_bottom');
    if (!hasPreset && !hasAnchors) {
      issues.push({
        severity: 'warning',
        nodeName: root.name,
        rule: 'ROOT_CONTROL_RESPONSIVENESS',
        message: `Root ${root.type} lacks anchors_preset; will not resize with viewport window.`,
        fixSuggestion: 'Set "anchors_preset = 15" (Full Rect) and "grow_horizontal = 2, grow_vertical = 2" on root Control.'
      });
    }
  }

  private static checkNodesInScene(nodes: ParsedUiNode[], issues: UiLintIssue[]): void {
    const nodeMap = new Map<string, ParsedUiNode>();
    for (const n of nodes) nodeMap.set(n.name, n);

    for (const node of nodes) {
      this.checkContainerChildConflict(node, nodeMap, issues);
      this.checkButtonTouchTarget(node, issues);
      this.checkScrollContainerSizing(node, issues);
    }
  }

  private static checkContainerChildConflict(node: ParsedUiNode, map: Map<string, ParsedUiNode>, issues: UiLintIssue[]): void {
    if (!node.parent || node.parent === '.') return;
    const parentName = node.parent.split('/').pop() || '';
    const parentNode = map.get(parentName);
    if (!parentNode || !this.CONTAINER_TYPES.has(parentNode.type)) return;

    if (node.properties.has('position') || node.properties.has('offset_left') || node.properties.has('offset_top')) {
      issues.push({
        severity: 'warning',
        nodeName: node.name,
        rule: 'CONTAINER_CHILD_CONFLICT',
        message: `Node "${node.name}" inside container "${parentNode.name}" defines manual position/offsets.`,
        fixSuggestion: 'Remove manual position/offset. Container manages child layout; use size_flags and custom_minimum_size instead.'
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
    const match = minSize.match(/Vector2\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
    if (match) {
      const w = parseFloat(match[1]);
      const h = parseFloat(match[2]);
      if (w < 44 || h < 44) {
        issues.push({
          severity: 'warning',
          nodeName: node.name,
          rule: 'TOUCH_TARGET_SIZE',
          message: `Button "${node.name}" custom_minimum_size (${w}x${h}px) is below recommended 44x44px.`,
          fixSuggestion: 'Increase custom_minimum_size to at least Vector2(44, 44).'
        });
      }
    }
  }

  private static checkScrollContainerSizing(node: ParsedUiNode, issues: UiLintIssue[]): void {
    if (node.type !== 'ScrollContainer') return;
    if (!node.properties.has('size_flags_vertical') && !node.properties.has('custom_minimum_size')) {
      issues.push({
        severity: 'info',
        nodeName: node.name,
        rule: 'SCROLL_CONTAINER_SIZING',
        message: `ScrollContainer "${node.name}" lacks size_flags_vertical and custom_minimum_size; may collapse to 0 height.`,
        fixSuggestion: 'Set size_flags_vertical = 3 (Expand | Fill) or custom_minimum_size with explicit height.'
      });
    }
  }

  private static checkSignalConnections(
    connections: ParsedConnection[],
    nodes: ParsedUiNode[],
    scriptPath: string | undefined,
    issues: UiLintIssue[]
  ): void {
    const nodeNames = new Set(nodes.map(n => n.name));
    let scriptMethods: Set<string> | null = null;
    if (scriptPath && fs.existsSync(scriptPath)) {
      scriptMethods = this.extractScriptMethods(fs.readFileSync(scriptPath, 'utf8'));
    }

    for (const c of connections) {
      const fromLeaf = c.from.split('/').pop() || c.from;
      if (c.from !== '.' && !nodeNames.has(fromLeaf)) {
        issues.push({
          severity: 'error',
          nodeName: c.from,
          rule: 'DANGLING_SIGNAL_NODE',
          message: `Connection from node "${c.from}" references non-existent node in scene.`,
          fixSuggestion: `Verify node path "${c.from}" matches a valid node name in the scene tree.`
        });
      }
      if (scriptMethods && !scriptMethods.has(c.method)) {
        issues.push({
          severity: 'error',
          nodeName: c.to,
          rule: 'SCRIPT_METHOD_MISSING',
          message: `Target method "${c.method}" connected to signal "${c.signal}" is not implemented in script.`,
          fixSuggestion: `Define "func ${c.method}():" in attached script ${scriptPath}.`
        });
      }
    }
  }

  private static extractScriptMethods(scriptContent: string): Set<string> {
    const methods = new Set<string>();
    const lines = scriptContent.split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^func\s+([a-zA-Z0-9_]+)\s*\(/);
      if (m) methods.add(m[1]);
    }
    return methods;
  }
}
