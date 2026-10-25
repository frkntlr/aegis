/**
 * Diagnostic Triage Enricher
 * Precision classification, stack frame sanitation, and error-to-context correlation.
 * Demir Kafes compliant: max 300 lines/file, max 40 lines/function.
 */

export type DiagnosticCategory =
  | 'SYNTAX_ERROR'
  | 'TYPE_ERROR'
  | 'CIRCULAR_DEPENDENCY'
  | 'GODOT_PARSE_ERROR'
  | 'GODOT_RUNTIME_ERROR'
  | 'MERGE_CONFLICT'
  | 'TEST_FAILURE'
  | 'RUNTIME_ERROR';

export interface EnrichedDiagnostic {
  category: DiagnosticCategory;
  title: string;
  filePath?: string;
  line?: number;
  column?: number;
  evidence: string;
  filteredStack?: string;
  remediation?: string;
  packageScope?: string;
}

const TS_CONTEXT7_REMEDIATIONS: Record<string, string> = {
  TS2304: 'TS2304 (Cannot find name): Verify import paths or check Context7 registry for missing exports.',
  TS2345: 'TS2345 (Argument type mismatch): Verify function signature types in Context7 specifications.',
  TS2554: 'TS2554 (Expected arguments count): Inspect method contract in Context7 docs for optional parameters.',
  TS2339: 'TS2339 (Property does not exist): Check interface definitions and type guards.',
  TS2322: 'TS2322 (Type not assignable): Check assignment target type against source schema.'
};

export class DiagnosticTriageEnricher {
  /**
   * Strip ANSI escape codes from terminal / runner output (#204)
   */
  public static stripAnsi(text: string): string {
    return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
  }

  /**
   * Filter out node_modules and node:internal frames from stack trace (#200)
   */
  public static filterStackFrames(stack: string): string {
    const clean = this.stripAnsi(stack);
    const lines = clean.split('\n');
    return lines
      .filter(l => !l.includes('node_modules') && !l.includes('node:internal') && !l.includes('node:test'))
      .join('\n')
      .trim();
  }

  /**
   * Extract Turbo monorepo package prefix from log lines (#202)
   */
  public static attributeTurboPackage(text: string): { packageScope?: string; cleanText: string } {
    const match = text.match(/^(?:@([a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+)|([a-zA-Z0-9_-]+)):test:\s*(.*)$/);
    if (match) {
      const pkg = match[1] ? `@${match[1]}` : match[2];
      return { packageScope: pkg, cleanText: match[3] };
    }
    return { cleanText: text };
  }

  /**
   * Extract precise file path and line number from Jest, Vitest, Node test runner (#199)
   */
  public static extractLocation(text: string): { filePath?: string; line?: number; column?: number } {
    const clean = this.stripAnsi(text);
    // Vitest pattern: ❯ path/to/file.ts:12:34
    const vitestMatch = clean.match(/❯\s+([^\s:]+\.[a-zA-Z0-9]+):(\d+):(\d+)/);
    if (vitestMatch) {
      return { filePath: vitestMatch[1].replace(/\\/g, '/'), line: parseInt(vitestMatch[2], 10), column: parseInt(vitestMatch[3], 10) };
    }
    // Jest / Node pattern: at ... (path/to/file.ts:12:34) or at path/to/file.ts:12:34
    const stackMatch = clean.match(/at\s+(?:[^\n(]*\()?([^\s():]+\.[a-zA-Z0-9]+):(\d+):(\d+)\)?/);
    if (stackMatch && !stackMatch[1].includes('node_modules') && !stackMatch[1].includes('node:')) {
      return { filePath: stackMatch[1].replace(/\\/g, '/'), line: parseInt(stackMatch[2], 10), column: parseInt(stackMatch[3], 10) };
    }
    // Simple path:line:col pattern
    const simpleMatch = clean.match(/([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+):(\d+):(\d+)/);
    if (simpleMatch && !simpleMatch[1].includes('node_modules') && !simpleMatch[1].includes('node:')) {
      return { filePath: simpleMatch[1].replace(/\\/g, '/'), line: parseInt(simpleMatch[2], 10), column: parseInt(simpleMatch[3], 10) };
    }
    return {};
  }

  /**
   * Classify error into precise category with Context7 remediation (#198, #203, #205, #206, #207)
   */
  public static classify(rawError: string): EnrichedDiagnostic {
    const stripped = this.stripAnsi(rawError);
    const { packageScope, cleanText } = this.attributeTurboPackage(stripped);
    const loc = this.extractLocation(cleanText);
    const filteredStack = this.filterStackFrames(cleanText);

    // Merge conflict (#206)
    if (/<<<<<<< HEAD|=======|>>>>>>>/i.test(cleanText)) {
      return {
        category: 'MERGE_CONFLICT',
        title: 'Git Merge Conflict Markers Detected',
        ...loc, evidence: cleanText, filteredStack, packageScope,
        remediation: 'Resolve git merge conflict markers in working tree before proceeding.'
      };
    }

    // Circular dependency (#205)
    if (/circular dependency|cannot read propert(y|ies) of undefined \(reading 'prototype'\)|cannot access '.*' before initialization/i.test(cleanText)) {
      return {
        category: 'CIRCULAR_DEPENDENCY',
        title: 'Circular Dependency Runtime Fault',
        ...loc, evidence: cleanText, filteredStack, packageScope,
        remediation: 'Break circular import graph by factoring shared types/interfaces into dedicated leaf module.'
      };
    }

    // Godot errors (#203)
    const godotRes = this.classifyGodotError(cleanText, loc, filteredStack, packageScope);
    if (godotRes) return godotRes;

    // TypeScript / JavaScript syntax vs semantic (#198, #207)
    return this.classifyCodeError(cleanText, loc, filteredStack, packageScope);
  }

  private static classifyGodotError(
    text: string,
    loc: { filePath?: string; line?: number; column?: number },
    stack: string,
    packageScope?: string
  ): EnrichedDiagnostic | null {
    if (/SCRIPT ERROR:\s*Parse Error:/i.test(text) || /Parse Error:\s*res:\/\//i.test(text)) {
      return {
        category: 'GODOT_PARSE_ERROR',
        title: 'GDScript Compilation / Parse Failure',
        ...loc, evidence: text, filteredStack: stack, packageScope,
        remediation: 'Check GDScript syntax against Godot 4.3 ClassDB schema.'
      };
    }
    if (/SCRIPT ERROR:|Condition "!.*" is true|Invalid get index '.*' on base/i.test(text)) {
      return {
        category: 'GODOT_RUNTIME_ERROR',
        title: 'Godot Scene / Node Runtime Error',
        ...loc, evidence: text, filteredStack: stack, packageScope,
        remediation: 'Verify node hierarchy in scene tree (.tscn) or ensure node is ready before access.'
      };
    }
    return null;
  }

  private static classifyCodeError(
    text: string,
    loc: { filePath?: string; line?: number; column?: number },
    stack: string,
    packageScope?: string
  ): EnrichedDiagnostic {
    // Syntax errors (#198)
    const isSyntax = /TS100[0-9]|TS11[0-9]{2}|SyntaxError:|Unexpected token|expected ';'/i.test(text);
    if (isSyntax) {
      return {
        category: 'SYNTAX_ERROR',
        title: 'Syntax / Parse Error',
        ...loc, evidence: text, filteredStack: stack, packageScope,
        remediation: 'Fix structural grammar or unbalanced tokens in source code.'
      };
    }

    // Semantic Type errors with Context7 remediation (#198, #207)
    const tsCodeMatch = text.match(/\b(TS\d{4})\b/);
    const tsCode = tsCodeMatch ? tsCodeMatch[1] : undefined;
    const remediation = tsCode ? TS_CONTEXT7_REMEDIATIONS[tsCode] : undefined;

    if (tsCode || /TypeError:|is not assignable to type|Property '.*' does not exist/i.test(text)) {
      return {
        category: 'TYPE_ERROR',
        title: tsCode ? `Semantic Type Error (${tsCode})` : 'Semantic Type Error',
        ...loc, evidence: text, filteredStack: stack, packageScope,
        remediation: remediation || 'Align parameters and types with Context7 ground-truth interface specifications.'
      };
    }

    return {
      category: 'TEST_FAILURE',
      title: 'Assertion / Runtime Failure',
      ...loc, evidence: text, filteredStack: stack, packageScope
    };
  }
}
