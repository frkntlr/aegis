import { BUILTIN_GODOT_CLASSES } from './builtin-classes.js';
import { DoctoolRunner } from './doctool-runner.js';
import type { ClassInfo, MethodInfo, PropertyInfo, SignalInfo, ValidationResult } from './classdb-types.js';

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
    } catch {
      // Fallback to builtins if runner fails
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
      this.validateLine(lines[i], i + 1, baseClass, localMethods, filePath, results);
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

  private validateLine(
    line: string,
    lineNo: number,
    baseClass: string,
    localMethods: Set<string>,
    file: string | undefined,
    out: ValidationResult[]
  ): void {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed.includes('self.')) return;

    const methodMatch = trimmed.match(/self\.([a-zA-Z0-9_]+)\s*\(/);
    if (methodMatch) {
      const methodName = methodMatch[1];
      if (!localMethods.has(methodName) && !this.queryMethod(baseClass, methodName)) {
        out.push({
          file,
          line: lineNo,
          severity: 'error',
          symbol: methodName,
          message: `Unknown method '${methodName}' called on base class '${baseClass}'.`
        });
      }
    }
  }
}
