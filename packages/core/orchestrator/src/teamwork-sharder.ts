/**
 * @file teamwork-sharder.ts
 * Fine-grained file partitioning and massive concurrency sharding for subagent teams.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { RoleClassifier } from './role-classifier.js';
import type { DecomposedSubtask } from './teamwork-decomposer.js';

export class TeamworkSharder {
  public static shardSolversByFiles(
    subtasks: DecomposedSubtask[],
    allFiles: string[],
    objective: string
  ): void {
    const solvers = subtasks.filter(t => t.roleType === 'solver');
    if (solvers.length !== 1) return;

    const sourceFiles = allFiles.filter(
      f => !RoleClassifier.isUiFile(f) && !f.endsWith('.md') && !f.includes('docs/') && !f.includes('.test.') && !f.includes('.spec.')
    );
    if (sourceFiles.length < 2) return;

    const solverIndex = subtasks.findIndex(t => t.roleType === 'solver');
    subtasks.splice(solverIndex, 1);

    for (const file of sourceFiles) {
      const base = file.split('/').pop()?.split('\\').pop()?.replace(/\.[^/.]+$/, '') || 'Module';
      const label = base.charAt(0).toUpperCase() + base.slice(1).slice(0, 15);
      subtasks.splice(solverIndex, 0, {
        roleType: 'solver',
        label,
        title: `${objective}: ${base}`,
        targetFiles: [file]
      });
    }
  }

  public static partitionFiles(subtasks: DecomposedSubtask[], allFiles: string[]): void {
    const assignedFiles = new Set<string>();
    for (const task of subtasks) {
      if (task.targetFiles.length > 0) {
        for (const f of task.targetFiles) { assignedFiles.add(f); }
        continue;
      }
      if (task.roleType === 'ui') {
        task.targetFiles = allFiles.filter(f => RoleClassifier.isUiFile(f) && !assignedFiles.has(f));
        for (const f of task.targetFiles) { assignedFiles.add(f); }
      } else if (task.roleType === 'docs') {
        task.targetFiles = allFiles.filter(f => (f.endsWith('.md') || f.includes('docs/') || f.includes('wiki/')) && !assignedFiles.has(f));
        for (const f of task.targetFiles) { assignedFiles.add(f); }
      } else if (task.roleType === 'qa') {
        task.targetFiles = allFiles.filter(f => (f.includes('.test.') || f.includes('.spec.')) && !assignedFiles.has(f));
        for (const f of task.targetFiles) { assignedFiles.add(f); }
      }
    }
    this.partitionSolverFiles(subtasks.filter(t => t.roleType === 'solver' && t.targetFiles.length === 0), allFiles, assignedFiles);
  }

  public static partitionSolverFiles(
    solvers: DecomposedSubtask[],
    allFiles: string[],
    assigned: Set<string>
  ): void {
    if (solvers.length === 0) return;
    const remaining = allFiles.filter(
      f => !assigned.has(f) && !RoleClassifier.isUiFile(f) && !f.endsWith('.md') && !f.includes('.test.') && !f.includes('.spec.')
    );

    for (const solver of solvers) {
      const labelLower = solver.label.toLowerCase();
      const matched = remaining.filter(f => !assigned.has(f) && f.toLowerCase().includes(labelLower));
      matched.forEach(f => { solver.targetFiles.push(f); assigned.add(f); });
    }

    const unassigned = remaining.filter(f => !assigned.has(f));
    unassigned.forEach((f, idx) => {
      const targetSolver = solvers[idx % solvers.length];
      targetSolver.targetFiles.push(f);
      assigned.add(f);
    });
  }

  public static shardMaxConcurrency(
    subtasks: DecomposedSubtask[],
    targetFiles: string[],
    maxConcurrency = 12
  ): DecomposedSubtask[] {
    const sourceFiles = targetFiles.filter(f => !f.endsWith('.md') && !f.includes('.test.') && !f.includes('.spec.'));
    if (sourceFiles.length <= 1) return subtasks;

    const limit = Math.min(maxConcurrency, sourceFiles.length);
    const others = subtasks.filter(t => t.roleType !== 'solver' && t.roleType !== 'ui');
    const sharded: DecomposedSubtask[] = [];

    for (let i = 0; i < limit; i++) {
      const assigned: string[] = [];
      for (let j = i; j < sourceFiles.length; j += limit) assigned.push(sourceFiles[j]);
      const base = assigned[0].split('/').pop()?.split('\\').pop()?.replace(/\.[^/.]+$/, '') || `Part${i + 1}`;
      const label = base.charAt(0).toUpperCase() + base.slice(1).slice(0, 15);
      const uniqueLabel = sharded.some(s => s.label === label) ? `${label}-${i + 1}` : label;
      const isUi = assigned.some(f => RoleClassifier.isUiFile(f));
      sharded.push({
        roleType: isUi ? 'ui' : 'solver',
        label: uniqueLabel,
        title: `Concurrent Unit [${uniqueLabel}]: ${assigned.join(', ')}`,
        targetFiles: assigned,
        phase: 1,
        dependsOn: []
      });
    }

    return [...sharded, ...others];
  }
}
