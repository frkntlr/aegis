import { FuzzyMatcher, type CageViolation } from '@aegis/shared';

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
      this.checkTypedGDScript(filePath, fn, violations);
    }

    this.checkOnreadySafety(filePath, lines, violations);
    this.checkParentCoupling(filePath, lines, violations);
    this.checkBandAidPrevention(filePath, lines, violations);
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
    'InputEventScreenTouch', 'InputEventScreenDrag', 'InputEventAction',
    'RandomNumberGenerator', 'Image', 'Resource', 'AegisUiVerifier',
    'RefCounted', 'JSON', 'WordData', 'AegisCompatBridge', 'TCP_Server',
    'StreamPeerTCP', 'FileAccess', 'DirAccess', 'ImageTexture', 'AudioStream'
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
    const patterns = ['add_child(', 'queue_free(', '.free()', 'return ', 'parse_input_event(', '.append(', '.push_back(', 'connect(', 'self.'];
    return patterns.some(p => text.includes(p)) || /_\w+\s*=/.test(text) || /\w+\[.*\]\s*=/.test(text);
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
      let sig: string | null = null;
      const legacyMatch = line.match(/emit_signal\(\s*["']([^"']+)["']/);
      if (legacyMatch) {
        sig = legacyMatch[1];
      } else {
        const modernMatch = line.match(/\b([a-zA-Z_]\w*)\.emit\s*\(/);
        if (modernMatch && modernMatch[1] !== 'self') {
          sig = modernMatch[1];
        }
      }
      if (sig && !signals.has(sig) && !GDScriptRulesValidator.ENGINE_SIGNALS.has(sig)) {
        const allKnown = [...Array.from(signals), ...Array.from(GDScriptRulesValidator.ENGINE_SIGNALS)];
        const suggestion = FuzzyMatcher.suggest(sig, allKnown, 2);
        const msg = suggestion
          ? `Emitted signal '${sig}' is not declared in this script or known base classes. Did you mean '${suggestion}'?`
          : `Emitted signal '${sig}' is not declared in this script or known base classes.`;
        violations.push({
          rule: 'GD_004_SIGNAL_SAFETY',
          filePath,
          line: fn.startLine + i,
          message: msg,
          severity: 'warning'
        });
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

  private checkParentCoupling(filePath: string, lines: string[], violations: CageViolation[]): void {
    const parentRegex = /(?:\$["']\.\.|\bget_node\s*\(\s*["']\.\.|\bget_parent\s*\(\s*\))/;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].replace(/#.*$/, '');
      if (parentRegex.test(line)) {
        violations.push({
          rule: 'GD_007_COUPLING_PARENT_NODE',
          filePath,
          line: i + 1,
          message: "Direct parent coupling via '../' or 'get_parent()' detected. Decouple nodes using signals for upward communication.",
          severity: 'error'
        });
      }
    }
  }

  private checkBandAidPrevention(filePath: string, lines: string[], violations: CageViolation[]): void {
    const bandAidRegex = /\bis_instance_valid\s*\(/;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].replace(/#.*$/, '');
      if (bandAidRegex.test(line)) {
        violations.push({
          rule: 'GD_009_BAND_AID_PREVENTION',
          filePath,
          line: i + 1,
          message: "'is_instance_valid()' band-aid detected. Manage node lifecycle explicitly via signals or tree exit hooks.",
          severity: 'warning'
        });
      }
    }
  }

  private checkTypedGDScript(filePath: string, fn: FuncBlock, violations: CageViolation[]): void {
    let header = '';
    for (const line of fn.lines) {
      const stripped = line.replace(/#.*$/, '').trim();
      header += (header ? ' ' : '') + stripped;
      if (stripped.endsWith(':')) break;
    }
    const name = fn.name;
    const parenOpen = header.indexOf('(');
    const parenClose = header.lastIndexOf(')');
    if (parenOpen === -1 || parenClose <= parenOpen) return;

    if (name !== '_init' && !header.slice(parenClose).includes('->')) {
      violations.push({
        rule: 'GD_008_TYPED_GDSCRIPT',
        filePath,
        line: fn.startLine,
        message: `Function '${name}' is missing an explicit return type hint (e.g. '-> void').`,
        severity: 'warning'
      });
    }

    const paramsStr = header.slice(parenOpen + 1, parenClose).trim();
    if (paramsStr) {
      for (const p of paramsStr.split(',').map(s => s.trim())) {
        if (p && !p.includes(':')) {
          violations.push({
            rule: 'GD_008_TYPED_GDSCRIPT',
            filePath,
            line: fn.startLine,
            message: `Parameter '${p}' in function '${name}' is missing a static type hint.`,
            severity: 'warning'
          });
        }
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

      const isDef = /^(?:@\w+(?:\([^)]*\))?\s+)?(?:static\s+)?func\s+/.test(trimmed);
      const indent = (line.match(/^[\t\s]*/)?.[0] ?? '').replace(/\t/g, '    ').length;

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
