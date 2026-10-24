import type { CageViolation } from '@aegis/shared';

export interface GDScriptRulesOptions {
  maxFunctionLines?: number;
  maxFileLines?: number;
  maxComplexity?: number;
}

interface FuncBlock {
  name: string;
  startLine: number;
  lines: string[];
}

export class GDScriptRulesValidator {
  private maxFunctionLines: number;
  private maxFileLines: number;
  private maxComplexity: number;

  constructor(options: GDScriptRulesOptions = {}) {
    this.maxFunctionLines = options.maxFunctionLines ?? 40;
    this.maxFileLines = options.maxFileLines ?? 300;
    this.maxComplexity = options.maxComplexity ?? 10;
  }

  public validate(filePath: string, content: string): CageViolation[] {
    const violations: CageViolation[] = [];
    const lines = content.split(/\r?\n/);

    this.checkFileLength(filePath, lines.length, violations);
    const declaredSignals = this.findDeclaredSignals(lines);
    const functions = this.extractFunctions(lines);

    for (const fn of functions) {
      this.checkFunctionLength(filePath, fn, violations);
      this.checkComplexity(filePath, fn, violations);
      this.checkResourceLeaks(filePath, fn, violations);
      this.checkSignalUsage(filePath, fn, declaredSignals, violations);
    }

    this.checkOnreadySafety(filePath, lines, violations);
    return violations;
  }

  private checkFileLength(filePath: string, count: number, violations: CageViolation[]): void {
    if (count > this.maxFileLines) {
      violations.push({
        rule: 'GD_002_FILE_LENGTH',
        filePath,
        message: `GDScript exceeds ${this.maxFileLines} lines (actual: ${count}).`,
        severity: 'error'
      });
    }
  }

  private checkFunctionLength(filePath: string, fn: FuncBlock, violations: CageViolation[]): void {
    if (fn.lines.length > this.maxFunctionLines) {
      violations.push({
        rule: 'GD_001_FUNC_LENGTH',
        filePath,
        line: fn.startLine,
        message: `Function '${fn.name}' exceeds ${this.maxFunctionLines} lines (actual: ${fn.lines.length}).`,
        severity: 'error'
      });
    }
  }

  private checkComplexity(filePath: string, fn: FuncBlock, violations: CageViolation[]): void {
    let score = 1;
    const branchKeywords = /\b(if|elif|for|while|match|and|or)\b/;
    for (const l of fn.lines) {
      const stripped = l.replace(/#.*$/, '');
      const matches = stripped.match(new RegExp(branchKeywords, 'g'));
      if (matches) score += matches.length;
    }
    if (score > this.maxComplexity) {
      violations.push({
        rule: 'GD_006_CYCLOMATIC_COMPLEXITY',
        filePath,
        line: fn.startLine,
        message: `Function '${fn.name}' has cyclomatic complexity ${score} (max: ${this.maxComplexity}).`,
        severity: 'error'
      });
    }
  }

  private static readonly REF_COUNTED_TYPES = new Set([
    'RegEx', 'ConfigFile', 'InputEventKey', 'InputEventMouseButton',
    'InputEventScreenTouch', 'InputEventScreenDrag', 'RandomNumberGenerator',
    'Image', 'Resource', 'AegisUiVerifier', 'RefCounted', 'JSON',
    'WordData', 'AegisCompatBridge', 'TCP_Server', 'StreamPeerTCP'
  ]);

  private static readonly ENGINE_SIGNALS = new Set([
    'pressed', 'released', 'button_up', 'button_down', 'toggled', 'timeout',
    'ready', 'tree_entered', 'tree_exited', 'visibility_changed', 'draw',
    'resized', 'focus_entered', 'focus_exited', 'mouse_entered', 'mouse_exited',
    'item_selected', 'text_changed', 'text_submitted', 'request_completed', 'finished'
  ]);

  private hasNodeInstantiation(text: string): boolean {
    if (text.includes('.instantiate()')) return true;
    const newMatches = text.matchAll(/([A-Z]\w+)\.new\(\)/g);
    for (const match of newMatches) {
      if (!GDScriptRulesValidator.REF_COUNTED_TYPES.has(match[1])) {
        return true;
      }
    }
    return false;
  }

  private hasRetentionOrCleanup(text: string): boolean {
    return (
      text.includes('add_child(') ||
      text.includes('queue_free(') ||
      text.includes('return ') ||
      text.includes('parse_input_event(') ||
      text.includes('.append(') ||
      text.includes('.push_back(') ||
      text.includes('connect(')
    );
  }

  private checkResourceLeaks(filePath: string, fn: FuncBlock, violations: CageViolation[]): void {
    const text = fn.lines.join('\n');
    if (this.hasNodeInstantiation(text) && !this.hasRetentionOrCleanup(text)) {
      violations.push({
        rule: 'GD_005_RESOURCE_LEAK',
        filePath,
        line: fn.startLine,
        message: `Function '${fn.name}' instantiates a node without add_child(), queue_free(), or retaining it.`,
        severity: 'warning'
      });
    }
  }

  private findDeclaredSignals(lines: string[]): Set<string> {
    const signals = new Set<string>();
    for (const line of lines) {
      const m = line.trim().match(/^signal\s+([a-zA-Z_]\w*)/);
      if (m) signals.add(m[1]);
    }
    return signals;
  }

  private checkSignalUsage(
    filePath: string,
    fn: FuncBlock,
    signals: Set<string>,
    violations: CageViolation[]
  ): void {
    for (let i = 0; i < fn.lines.length; i++) {
      const line = fn.lines[i];
      const emitMatch = line.match(/emit_signal\(\s*["']([^"']+)["']/);
      if (emitMatch) {
        const sig = emitMatch[1];
        if (!signals.has(sig) && !GDScriptRulesValidator.ENGINE_SIGNALS.has(sig)) {
          violations.push({
            rule: 'GD_004_SIGNAL_SAFETY',
            filePath,
            line: fn.startLine + i,
            message: `Emitted signal '${sig}' is not declared in this script or known base classes.`,
            severity: 'warning'
          });
        }
      }
    }
  }

  private checkOnreadySafety(filePath: string, lines: string[], violations: CageViolation[]): void {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('@onready') && (line.includes('$""') || line.includes("$''"))) {
        violations.push({
          rule: 'GD_003_ONREADY_SAFETY',
          filePath,
          line: i + 1,
          message: 'Empty @onready node path reference detected.',
          severity: 'error'
        });
      }
    }
  }

  private extractFunctions(lines: string[]): FuncBlock[] {
    const blocks: FuncBlock[] = [];
    let current: FuncBlock | null = null;
    let baseIndent = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const isDef = trimmed.startsWith('func ') || trimmed.startsWith('static func ');
      const indent = (line.match(/^(\t|\s)*/)?.[0] ?? '').length;

      if (current && indent <= baseIndent && !isDef) {
        blocks.push(current);
        current = null;
      }
      if (isDef) {
        if (current) blocks.push(current);
        const nameMatch = trimmed.match(/func\s+([a-zA-Z_]\w*)/);
        current = { name: nameMatch ? nameMatch[1] : 'anonymous', startLine: i + 1, lines: [line] };
        baseIndent = indent;
      } else if (current) {
        current.lines.push(line);
      }
    }
    if (current) blocks.push(current);
    return blocks;
  }
}
