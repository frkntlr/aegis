import { FuzzyMatcher, type CageViolation } from '@aegis/shared';
import {
  type GDScriptFuncBlock,
  GDSCRIPT_REF_COUNTED_TYPES,
  GDSCRIPT_ENGINE_SIGNALS
} from './gdscript-constants.js';

export function hasNodeInstantiation(text: string): boolean {
  if (text.includes('.instantiate()')) return true;
  const newMatches = text.matchAll(/([A-Z]\w+)\.new\(\)/g);
  for (const match of newMatches) {
    if (!GDSCRIPT_REF_COUNTED_TYPES.has(match[1])) {
      return true;
    }
  }
  return false;
}

export function hasRetentionOrCleanup(text: string): boolean {
  const patterns = ['add_child(', 'queue_free(', '.free()', 'return ', 'parse_input_event(', '.append(', '.push_back(', 'connect(', 'self.'];
  return patterns.some(p => text.includes(p)) || /_\w+\s*=/.test(text) || /\w+\[.*\]\s*=/.test(text);
}

export function findDeclaredSignals(lines: string[]): Set<string> {
  const signals = new Set<string>();
  for (const line of lines) {
    const m = line.trim().match(/^signal\s+([a-zA-Z_]\w*)/);
    if (m) signals.add(m[1]);
  }
  return signals;
}

export function checkSignalUsage(
  filePath: string,
  fn: GDScriptFuncBlock,
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
    if (sig && !signals.has(sig) && !GDSCRIPT_ENGINE_SIGNALS.has(sig)) {
      const allKnown = [...Array.from(signals), ...Array.from(GDSCRIPT_ENGINE_SIGNALS)];
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

export function checkOnreadySafety(filePath: string, lines: string[], violations: CageViolation[]): void {
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

export function checkParentCoupling(filePath: string, lines: string[], violations: CageViolation[]): void {
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

export function checkBandAidPrevention(filePath: string, lines: string[], violations: CageViolation[]): void {
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

export function checkTypedGDScript(filePath: string, fn: GDScriptFuncBlock, violations: CageViolation[]): void {
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

export function extractGDScriptFunctions(lines: string[]): GDScriptFuncBlock[] {
  const blocks: GDScriptFuncBlock[] = [];
  let current: GDScriptFuncBlock | null = null;
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
