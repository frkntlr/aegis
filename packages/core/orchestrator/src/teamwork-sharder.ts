/**
 * @file teamwork-sharder.ts
 * Adaptive, dependency-aware file clustering and optimal concurrency sharding.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { RoleClassifier } from './role-classifier.js';
import type { DecomposedSubtask } from './teamwork-decomposer.js';

export class TeamworkSharder {
  public static isSourceFile(file: string): boolean {
    const norm = file.replace(/\\/g, '/').toLowerCase();
    return !RoleClassifier.isUiFile(file) && !norm.endsWith('.md') && !norm.includes('docs/');
  }

  public static getSubsystemKey(file: string): string {
    const clean = file.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\.(test|spec)\.[jt]sx?$/, '');
    const segments = clean.split('/').filter(p => Boolean(p) && p !== '.');
    const pkgIdx = segments.indexOf('packages');
    const rootIdx = segments.findIndex(s => ['src', 'lib', 'test', 'tests', 'scenes', 'scripts'].includes(s));
    const parts = pkgIdx >= 0 ? segments.slice(pkgIdx) : (rootIdx >= 0 ? segments.slice(rootIdx) : segments);

    if (parts.length >= 4 && parts[0] === 'packages') {
      const seg2 = (parts[2] === 'src' ? parts[3] : parts[2])?.replace(/\.[^/.]+$/, '');
      const raw = seg2 ? `${parts[1]}-${seg2}` : parts[1];
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }
    if (parts.length >= 3 && parts[0] === 'packages') {
      const pkg = parts[1].replace(/\.[^/.]+$/, '');
      return pkg.charAt(0).toUpperCase() + pkg.slice(1);
    }
    if (parts.length >= 2 && ['src', 'lib', 'test', 'tests', 'scenes', 'scripts'].includes(parts[0])) {
      const seg = parts[1].replace(/\.[^/.]+$/, '');
      return seg.charAt(0).toUpperCase() + seg.slice(1);
    }
    const base = parts.pop()?.replace(/\.[^/.]+$/, '') || 'Module';
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  public static clusterFilesBySubsystem(files: string[]): Map<string, string[]> {
    const clusters = new Map<string, string[]>();
    const seen = new Set<string>();
    for (const f of files) {
      const norm = f.replace(/\\/g, '/');
      if (seen.has(norm)) continue;
      seen.add(norm);
      const key = this.getSubsystemKey(f);
      const list = clusters.get(key) || [];
      list.push(f);
      clusters.set(key, list);
    }
    return clusters;
  }

  public static calculateOptimalConcurrency(clusterCount: number, totalFiles: number, maxConcurrency = 12): number {
    if (totalFiles <= 1 || clusterCount <= 1 || maxConcurrency <= 1) return 1;
    return Math.max(1, Math.min(maxConcurrency, clusterCount));
  }

  public static shardSolversByFiles(subtasks: DecomposedSubtask[], allFiles: string[], objective: string): void {
    const solvers = subtasks.filter(t => t.roleType === 'solver');
    if (solvers.length !== 1) return;
    const sourceFiles = allFiles.filter(f => this.isSourceFile(f));
    if (sourceFiles.length < 2) return;
    const clusterMap = this.clusterFilesBySubsystem(sourceFiles);
    if (clusterMap.size < 2) return;

    const solverIndex = subtasks.findIndex(t => t.roleType === 'solver');
    const newSolvers = Array.from(clusterMap.entries()).map(([key, files]) => ({
      roleType: 'solver' as const,
      label: key.slice(0, 15),
      title: `${objective}: ${key}`,
      targetFiles: files
    }));
    subtasks.splice(solverIndex, 1, ...newSolvers);
  }

  public static hasDimensionedQa(tasks: DecomposedSubtask[]): boolean {
    return tasks.some(t => t.roleType === 'qa' && ['StaticAudit', 'TypeSafety', 'SafetyGate'].includes(t.label));
  }

  public static shardQaByDimensions(subtasks: DecomposedSubtask[], objective: string, companionTest?: string): void {
    if (this.hasDimensionedQa(subtasks)) return;
    const qaIndex = subtasks.findIndex(t => t.roleType === 'qa');
    if (qaIndex === -1) return;
    const baseTitle = subtasks[qaIndex].title || objective;
    const testFile = companionTest ? [companionTest] : [];
    const dims = [
      { label: 'StaticAudit', title: `${baseTitle} [StaticAudit]: Linting, AST patterns & conventions`, files: testFile },
      { label: 'TypeSafety', title: `${baseTitle} [TypeSafety]: TypeScript checks & contract integrity`, files: [] as string[] },
      { label: 'SafetyGate', title: `${baseTitle} [SafetyGate]: Cage compliance & boundary safety`, files: [] as string[] }
    ];
    subtasks.splice(qaIndex, 1, ...dims.map(d => ({ roleType: 'qa' as const, label: d.label, title: d.title, targetFiles: d.files, phase: 2, dependsOn: [] })));
  }

  private static resolveQaFiles(existing: DecomposedSubtask, allFiles: string[]): string[] {
    if (existing.targetFiles.length > 0) return existing.targetFiles;
    const testFiles = allFiles.filter(f => {
      const norm = f.replace(/\\/g, '/').toLowerCase();
      return norm.includes('.test.') || norm.includes('.spec.');
    });
    return testFiles.length >= 2 ? testFiles : allFiles.filter(f => this.isSourceFile(f));
  }

  public static shardQaByFiles(subtasks: DecomposedSubtask[], allFiles: string[], objective: string, allowDimensions = true): void {
    if (this.hasDimensionedQa(subtasks)) return;
    const qas = subtasks.filter(t => t.roleType === 'qa');
    if (qas.length !== 1) return;
    const qaIndex = subtasks.findIndex(t => t.roleType === 'qa');
    const qaFiles = this.resolveQaFiles(qas[0], allFiles);
    if (qaFiles.length >= 2) {
      const clusterMap = this.clusterFilesBySubsystem(qaFiles);
      if (clusterMap.size >= 2) {
        const newQas = Array.from(clusterMap.entries()).map(([key, files]) => ({
          roleType: 'qa' as const, label: key.slice(0, 15), title: `${objective} [QA-${key.slice(0, 15)}]: ${files.slice(0, 2).join(', ')}`,
          targetFiles: files, phase: 2, dependsOn: []
        }));
        subtasks.splice(qaIndex, 1, ...newQas);
        return;
      }
    }
    if (allowDimensions) {
      const f = allFiles[0];
      const comp = f ? (f.includes('.test.') || f.includes('.spec.') ? f : `${f.replace(/\.[^/.]+$/, '')}.test.ts`) : undefined;
      this.shardQaByDimensions(subtasks, objective, comp);
    }
  }

  public static partitionFiles(subtasks: DecomposedSubtask[], allFiles: string[]): void {
    const assigned = new Set<string>();
    for (const t of subtasks) {
      for (const f of t.targetFiles) assigned.add(f.replace(/\\/g, '/'));
    }
    for (const task of subtasks) {
      if (task.targetFiles.length > 0) continue;
      if (task.roleType === 'ui') {
        task.targetFiles = allFiles.filter(f => RoleClassifier.isUiFile(f) && !assigned.has(f.replace(/\\/g, '/')));
      } else if (task.roleType === 'docs') {
        const l = task.label.toLowerCase();
        task.targetFiles = allFiles.filter(f => {
          const norm = f.replace(/\\/g, '/').toLowerCase();
          if (assigned.has(f.replace(/\\/g, '/'))) return false;
          if (l === 'wiki') return norm.includes('wiki/') || norm.includes('.wiki.');
          if (l === 'readme') return norm.endsWith('readme.md');
          if (l === 'rfc') return norm.includes('rfc') || norm.includes('adr');
          return norm.endsWith('.md') || norm.includes('docs/');
        });
      } else if (task.roleType === 'qa') {
        task.targetFiles = allFiles.filter(f => (f.toLowerCase().includes('.test.') || f.toLowerCase().includes('.spec.')) && !assigned.has(f.replace(/\\/g, '/')));
      }
      for (const f of task.targetFiles) assigned.add(f.replace(/\\/g, '/'));
    }
    this.partitionSolverFiles(subtasks.filter(t => t.roleType === 'solver' && t.targetFiles.length === 0), allFiles, assigned);
  }

  public static partitionSolverFiles(solvers: DecomposedSubtask[], allFiles: string[], assigned: Set<string>): void {
    if (solvers.length === 0) return;
    const remaining = allFiles.filter(f => !assigned.has(f.replace(/\\/g, '/')) && this.isSourceFile(f));
    for (const solver of solvers) {
      const labelLower = solver.label.toLowerCase();
      const matched = remaining.filter(f => !assigned.has(f.replace(/\\/g, '/')) && f.toLowerCase().replace(/\\/g, '/').includes(labelLower));
      for (const f of matched) { solver.targetFiles.push(f); assigned.add(f.replace(/\\/g, '/')); }
    }
    const unassigned = remaining.filter(f => !assigned.has(f.replace(/\\/g, '/')));
    unassigned.forEach((f, idx) => {
      solvers[idx % solvers.length].targetFiles.push(f);
      assigned.add(f.replace(/\\/g, '/'));
    });
  }

  private static distributeClustersToBuckets(clusterMap: Map<string, string[]>, optimalK: number): Array<{ name: string; files: string[] }> {
    const buckets = Array.from({ length: optimalK }, () => ({ name: '', files: [] as string[] }));
    const sorted = Array.from(clusterMap.entries()).sort((a, b) => b[1].length - a[1].length);
    for (const [key, files] of sorted) {
      const bucket = buckets.reduce((min, b) => (b.files.length < min.files.length ? b : min), buckets[0]);
      bucket.name = bucket.name ? `${bucket.name}-${key}` : key;
      bucket.files.push(...files);
    }
    return buckets;
  }

  private static resolveCompanionSubtasks(subtasks: DecomposedSubtask[], companionTest: string, companionDoc: string, objective: string): DecomposedSubtask[] {
    const others: DecomposedSubtask[] = [];
    let hasDocs = false;
    for (const t of subtasks) {
      if (t.roleType === 'solver') continue;
      if (t.roleType === 'qa') {
        others.push({ ...t, targetFiles: t.targetFiles.length > 0 ? t.targetFiles : [companionTest] });
      } else if (t.roleType === 'docs') {
        hasDocs = true;
        others.push({ ...t, targetFiles: t.targetFiles.length > 0 ? t.targetFiles : [companionDoc] });
      } else {
        others.push(t);
      }
    }
    if (!hasDocs) {
      others.push({ roleType: 'docs', label: 'Docs', title: `${objective} [Spec]: ${companionDoc}`, targetFiles: [companionDoc], phase: 3, dependsOn: ['Audit'] });
    }
    return others;
  }

  private static shardSingleFileSections(subtasks: DecomposedSubtask[], singleFile: string, objective: string): DecomposedSubtask[] {
    const solvers: DecomposedSubtask[] = [
      { roleType: 'solver', label: 'Logic', title: `${objective} [Logic]: ${singleFile}`, targetFiles: [`${singleFile}#logic`], phase: 1, dependsOn: [] },
      { roleType: 'solver', label: 'Contract', title: `${objective} [Contract]: ${singleFile}`, targetFiles: [`${singleFile}#contract`], phase: 1, dependsOn: [] },
      { roleType: 'solver', label: 'Safety', title: `${objective} [Safety]: ${singleFile}`, targetFiles: [`${singleFile}#safety`], phase: 1, dependsOn: [] }
    ];
    const baseName = singleFile.replace(/\\/g, '/').replace(/\.[^/.]+$/, '');
    const base = baseName.split('/').pop() || baseName;
    const others = this.resolveCompanionSubtasks(subtasks, `${baseName}.test.ts`, `docs/${base}.md`, objective);
    if (!this.hasDimensionedQa(others) && !this.hasDimensionedQa(subtasks)) {
      this.shardQaByDimensions(others, objective, `${baseName}.test.ts`);
    }
    return [...solvers, ...others];
  }

  private static shardGeneralScopeSections(subtasks: DecomposedSubtask[], objective: string, maxConcurrency: number): DecomposedSubtask[] {
    const solvers = subtasks.filter(t => t.roleType === 'solver');
    if (solvers.length !== 1) return subtasks;
    const baseTitle = solvers[0]?.title || objective;
    const shardedSolvers: DecomposedSubtask[] = [
      { roleType: 'solver', label: 'Logic', title: `${baseTitle} [Logic]: Core algorithms & calculations`, targetFiles: [], phase: 1, dependsOn: [] },
      { roleType: 'solver', label: 'Adapter', title: `${baseTitle} [Adapter]: Pipeline, CLI & interface routing`, targetFiles: [], phase: 1, dependsOn: [] }
    ];
    if (maxConcurrency >= 3) {
      shardedSolvers.push({ roleType: 'solver', label: 'State', title: `${baseTitle} [State]: Transitions, cache & event loop`, targetFiles: [], phase: 1, dependsOn: [] });
    }
    const others = subtasks.filter(t => t.roleType !== 'solver');
    if (!this.hasDimensionedQa(others) && !this.hasDimensionedQa(subtasks)) {
      this.shardQaByDimensions(others, objective);
    }
    return [...shardedSolvers, ...others];
  }

  private static shardMultiSolvers(subtasks: DecomposedSubtask[], allFiles: string[], objective: string, maxConcurrency: number): DecomposedSubtask[] {
    const solvers = subtasks.filter(t => t.roleType === 'solver');
    if (!subtasks.some(s => s.label === 'State') && subtasks.length < maxConcurrency) {
      subtasks.splice(solvers.length, 0, { roleType: 'solver', label: 'State', title: `${objective} [State]: Transitions, cache & event loop`, targetFiles: [], phase: 1, dependsOn: [] });
    }
    if (!this.hasDimensionedQa(subtasks)) {
      this.shardQaByDimensions(subtasks, objective);
    }
    this.partitionFiles(subtasks, allFiles);
    return subtasks;
  }

  public static shardSmartClusters(
    subtasks: DecomposedSubtask[],
    allFiles: string[],
    objective: string,
    maxConcurrency = 12
  ): DecomposedSubtask[] {
    const sourceFiles = allFiles.filter(f => this.isSourceFile(f));
    if (allFiles.length === 1 && sourceFiles.length === 1 && maxConcurrency > 1) {
      return this.shardSingleFileSections(subtasks, sourceFiles[0], objective);
    }
    if (sourceFiles.length === 0 && maxConcurrency > 1) {
      return this.shardGeneralScopeSections(subtasks, objective, maxConcurrency);
    }
    const solvers = subtasks.filter(t => t.roleType === 'solver');
    if (solvers.length > 1 && maxConcurrency >= 6) {
      return this.shardMultiSolvers(subtasks, allFiles, objective, maxConcurrency);
    }
    if (sourceFiles.length <= 1) return subtasks;

    const clusterMap = this.clusterFilesBySubsystem(sourceFiles);
    const optimalK = this.calculateOptimalConcurrency(clusterMap.size, sourceFiles.length, maxConcurrency);
    const buckets = this.distributeClustersToBuckets(clusterMap, optimalK);

    const shardedSolvers: DecomposedSubtask[] = buckets.filter(b => b.files.length > 0).map((b, idx) => {
      const label = b.name.slice(0, 15) || `Solver-${idx + 1}`;
      return {
        roleType: 'solver', label, title: `${objective} [${label}]: ${b.files.slice(0, 2).join(', ')}`,
        targetFiles: b.files, phase: 1, dependsOn: []
      };
    });

    const others = subtasks.filter(t => t.roleType !== 'solver');
    const result = [...shardedSolvers, ...others];
    if (!this.hasDimensionedQa(others) && !this.hasDimensionedQa(subtasks)) {
      this.shardQaByFiles(result, allFiles, objective, true);
    }
    this.partitionFiles(result, allFiles);
    return result;
  }

  public static shardMaxConcurrency(subtasks: DecomposedSubtask[], targetFiles: string[], maxConcurrency = 12): DecomposedSubtask[] {
    return this.shardSmartClusters(subtasks, targetFiles, 'Concurrent Unit', maxConcurrency);
  }
}
