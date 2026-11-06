/**
 * @file godot-ui-linter.ts
 * Static AST & structural linter for Godot 4.x UI scenes (.tscn).
 * Inspects responsive anchors, container children hygiene, touch targets, accessibility, and signals.
 * Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import {
  GodotUiParser,
  type ParsedConnection,
  type ParsedScene,
  type ParsedUiNode
} from './godot-ui-parser.js';

export {
  GodotUiParser,
  type ParsedConnection,
  type ParsedScene,
  type ParsedUiNode
};

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

export class GodotUiLinter {
  public static readonly CONTAINER_TYPES = GodotUiParser.CONTAINER_TYPES;

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
    try {
      return this.lintContent(fs.readFileSync(scenePath, 'utf8'), scenePath, gdScriptPath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { valid: false, scenePath, nodeCount: 0, issues: [{
        severity: 'error', nodeName: 'Scene', rule: 'FILE_READ_ERROR',
        message: `Failed to read scene file: ${msg}`, fixSuggestion: 'Check file permissions.'
      }], score: 0 };
    }
  }

  public static lintContent(content: string, scenePath = 'scene.tscn', gdScriptPath?: string): UiLintReport {
    const { nodes, connections } = GodotUiParser.parseScene(content);
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

  private static checkRootResponsiveness(root: ParsedUiNode, issues: UiLintIssue[]): void {
    const isCtrl = root.type === 'Control' || GodotUiParser.isContainerType(root.type) || root.type === 'ColorRect';
    if (!isCtrl) return;
    if (!GodotUiParser.isResponsiveLayout(root)) {
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
    if (!parent || !GodotUiParser.isContainerType(parent.type)) return;

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
    const methods = this.loadScriptMethods(scriptPath);

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

  private static loadScriptMethods(scriptPath?: string): Set<string> | null {
    if (!scriptPath || !fs.existsSync(scriptPath)) return null;
    try {
      return GodotUiParser.extractScriptMethods(fs.readFileSync(scriptPath, 'utf8'));
    } catch {
      return null;
    }
  }
}
