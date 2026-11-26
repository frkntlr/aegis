import { FuzzyMatcher, debugLogIgnored } from '@aegis/shared';
import { BUILTIN_GODOT_CLASSES } from './builtin-classes.js';
import { DoctoolRunner } from './doctool-runner.js';
import type { ClassInfo, MethodInfo, PropertyInfo, SignalInfo, ValidationResult } from './classdb-types.js';

interface ValidateLineContext {
  line: string;
  lineNo: number;
  baseClass: string;
  localMethods: Set<string>;
  file?: string;
  out: ValidationResult[];
}

export class ClassDbOracle {
  private readonly classes: Map<string, ClassInfo> = new Map();
  private readonly doctoolRunner: DoctoolRunner;
  private isLoaded = false;

  constructor(runner?: DoctoolRunner) {
    this.doctoolRunner = runner || new DoctoolRunner();
    this.seedBuiltins();
  }

  public ensureLoaded(): void {
    if (this.isLoaded) return;
    try {
      const dumped = this.doctoolRunner.dumpAndIndexApi();
      for (const [name, info] of dumped.entries()) {
        this.classes.set(name, info);
      }
    } catch (err: unknown) {
      debugLogIgnored('classdboracle:ensureLoaded', err);
    }
    this.isLoaded = true;
  }

  public queryClass(name: string): ClassInfo | undefined {
    this.ensureLoaded();
    return this.classes.get(name);
  }

  public queryMethod(className: string, methodName: string): MethodInfo | undefined {
    this.ensureLoaded();
    let current: ClassInfo | undefined = this.classes.get(className);
    while (current) {
      const found = current.methods.find(m => m.name === methodName);
      if (found) return found;
      current = current.inherits ? this.classes.get(current.inherits) : undefined;
    }
    return undefined;
  }

  public queryProperty(className: string, propName: string): PropertyInfo | undefined {
    this.ensureLoaded();
    let current: ClassInfo | undefined = this.classes.get(className);
    while (current) {
      const found = current.properties.find(p => p.name === propName);
      if (found) return found;
      current = current.inherits ? this.classes.get(current.inherits) : undefined;
    }
    return undefined;
  }

  public querySignal(className: string, signalName: string): SignalInfo | undefined {
    this.ensureLoaded();
    let current: ClassInfo | undefined = this.classes.get(className);
    while (current) {
      const found = current.signals.find(s => s.name === signalName);
      if (found) return found;
      current = current.inherits ? this.classes.get(current.inherits) : undefined;
    }
    return undefined;
  }

  public searchClasses(query: string, limit = 10): ClassInfo[] {
    this.ensureLoaded();
    const q = query.toLowerCase();
    const matches: ClassInfo[] = [];
    for (const info of this.classes.values()) {
      if (info.name.toLowerCase().includes(q)) {
        matches.push(info);
        if (matches.length >= limit) break;
      }
    }
    return matches;
  }

  public validateUsage(sourceCode: string, filePath?: string): ValidationResult[] {
    this.ensureLoaded();
    const results: ValidationResult[] = [];
    const baseClass = this.extractBaseClass(sourceCode);
    if (!baseClass || !this.classes.has(baseClass)) return results;

    const localMethods = this.extractLocalFunctions(sourceCode);
    const lines = sourceCode.split('\n');
    for (let i = 0; i < lines.length; i++) {
      this.validateLine({ line: lines[i], lineNo: i + 1, baseClass, localMethods, file: filePath, out: results });
    }
    return results;
  }

  private extractLocalFunctions(sourceCode: string): Set<string> {
    const fns = new Set<string>();
    const matches = sourceCode.matchAll(/^\s*(?:static\s+)?func\s+([a-zA-Z_]\w*)/gm);
    for (const m of matches) {
      fns.add(m[1]);
    }
    return fns;
  }

  private seedBuiltins(): void {
    for (const [name, info] of Object.entries(BUILTIN_GODOT_CLASSES)) {
      this.classes.set(name, info);
    }
  }

  private extractBaseClass(sourceCode: string): string | undefined {
    const match = sourceCode.match(/^extends\s+([A-Za-z0-9_]+)/m);
    return match ? match[1] : undefined;
  }

  private validateLine(ctx: ValidateLineContext): void {
    const trimmed = ctx.line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const matches = trimmed.matchAll(/(?:self\.)?([a-zA-Z_]\w*)\s*\(/g);
    for (const match of matches) {
      const methodName = match[1];
      const isExplicitSelf = match[0].startsWith('self.');
      if (ctx.localMethods.has(methodName) || this.queryMethod(ctx.baseClass, methodName)) continue;

      const suggestion = this.suggestSimilarMethod(ctx.baseClass, methodName);
      if (isExplicitSelf) {
        const message = suggestion
          ? `Unknown method '${methodName}' called on base class '${ctx.baseClass}'. Did you mean '${suggestion}'?`
          : `Unknown method '${methodName}' called on base class '${ctx.baseClass}'.`;
        ctx.out.push({ file: ctx.file, line: ctx.lineNo, severity: 'error', symbol: methodName, message });
      } else if (suggestion) {
        const message = `Unknown Godot method '${methodName}' called on '${ctx.baseClass}'. Did you mean '${suggestion}'?`;
        ctx.out.push({ file: ctx.file, line: ctx.lineNo, severity: 'error', symbol: methodName, message });
      }
    }
  }

  private suggestSimilarMethod(baseClass: string, methodName: string): string | null {
    const candidates: string[] = [];
    let current: ClassInfo | undefined = this.classes.get(baseClass);
    while (current) {
      for (const m of current.methods) candidates.push(m.name);
      current = current.inherits ? this.classes.get(current.inherits) : undefined;
    }
    return FuzzyMatcher.suggest(methodName, candidates, 2);
  }
}
