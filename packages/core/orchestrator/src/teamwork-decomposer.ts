/**
 * @file teamwork-decomposer.ts
 * Decomposes objectives into granular subtasks and statically partitions files.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { RoleClassifier, type RoleType } from './role-classifier.js';
import type { DecomposedSubtask, DecomposeOptions } from './teamwork-decomposer-types.js';
import { TeamworkSharder } from './teamwork-sharder.js';
import { TeamworkHierarchicalTree } from './teamwork-hierarchical-tree.js';
import { TeamworkDocSharder } from './teamwork-doc-sharder.js';
import {
  classifyRawItemHelper,
  enrichSubtasksHelper,
  extractLabelHelper,
  splitObjectiveHelper
} from './teamwork-objective-parser.js';

export { TeamworkSharder, TeamworkHierarchicalTree, TeamworkDocSharder };
export type { DecomposedSubtask, DecomposeOptions } from './teamwork-decomposer-types.js';

function collectFoundationLabels(subtasks: DecomposedSubtask[]): string[] {
  const foundations = subtasks.filter(t => t.roleType === 'solver' || t.roleType === 'ui');
  for (const t of foundations) {
    t.phase = 1;
    t.dependsOn = [];
  }
  return foundations.map(t => t.label);
}

function assignQaAndCollectLabels(subtasks: DecomposedSubtask[], foundationLabels: string[]): string[] {
  const qaTasks = subtasks.filter(t => t.roleType === 'qa');
  const qaPhase = foundationLabels.length > 0 ? 2 : 1;
  for (const t of qaTasks) {
    t.phase = qaPhase;
    t.dependsOn = [...foundationLabels];
  }
  return qaTasks.map(t => t.label);
}

function resolveDocPhase(qaCount: number, foundationCount: number): number {
  if (qaCount > 0) return 3;
  return foundationCount > 0 ? 2 : 1;
}

export class TeamworkDecomposer {
  public static decompose(
    objective: string,
    targetFiles: string[] = [],
    options?: DecomposeOptions
  ): DecomposedSubtask[] {
    const opts = options ?? {};
    const selectedRoles = opts.selectedRoles ?? TeamworkHierarchicalTree.detectSelectedRoles(objective, opts.explicitRole);
    const isTree = Boolean(opts.treeSpecialists || TeamworkHierarchicalTree.isHierarchicalRequested(objective));
    const maxConcurrency = opts.maxConcurrency ?? 12;

    const initial = this.buildInitialSubtasks(objective, targetFiles, selectedRoles);
    const subtasks = isTree
      ? TeamworkHierarchicalTree.expandHierarchicalRoles(initial.subtasks, selectedRoles, objective, targetFiles)
      : initial.subtasks;

    if (initial.isSingleItem) this.shardSolversAndQa(subtasks, targetFiles, objective, opts);
    TeamworkDocSharder.shardDocsBySpecialists(subtasks, targetFiles, objective, maxConcurrency);
    TeamworkSharder.partitionFiles(subtasks, targetFiles);
    this.assignPhasesAndDependencies(subtasks);

    return this.shouldScaleConcurrency(isTree, targetFiles.length, opts)
      ? this.shardMaxConcurrency(subtasks, targetFiles, maxConcurrency)
      : subtasks;
  }

  private static buildInitialSubtasks(
    objective: string,
    targetFiles: string[],
    selectedRoles: RoleType[] | null
  ): { subtasks: DecomposedSubtask[]; isSingleItem: boolean } {
    const rawItems = this.splitObjective(objective);
    let subtasks = enrichSubtasksHelper(rawItems.map(item => classifyRawItemHelper(item)));
    if (selectedRoles?.length) {
      subtasks = subtasks.filter(t => selectedRoles.includes(t.roleType));
    }
    this.ensureRequiredTracks(subtasks, objective, targetFiles, selectedRoles);
    return { subtasks, isSingleItem: rawItems.length <= 1 };
  }

  private static shouldScaleConcurrency(isTree: boolean, fileCount: number, options?: DecomposeOptions): boolean {
    if (isTree || !options) return false;
    if (options.autoScale) return true;
    const max = options.maxConcurrency ?? 0;
    if (max > 4) return true;
    return max > 1 && fileCount !== 1;
  }

  private static shardSolversAndQa(
    subtasks: DecomposedSubtask[],
    targetFiles: string[],
    objective: string,
    options?: DecomposeOptions
  ): void {
    TeamworkSharder.shardSolversByFiles(subtasks, targetFiles, objective);
    const allowDimensions = Boolean(
      options?.autoScale ||
      (options?.maxConcurrency && options.maxConcurrency > 1) ||
      (!options?.explicitRole && targetFiles.length === 0)
    );
    TeamworkSharder.shardQaByFiles(subtasks, targetFiles, objective, allowDimensions);
  }

  public static splitObjective(objective: string): string[] {
    return splitObjectiveHelper(objective);
  }

  public static extractLabel(title: string, role: RoleType): string {
    return extractLabelHelper(title, role);
  }

  private static ensureRequiredTracks(
    subtasks: DecomposedSubtask[],
    objective: string,
    allFiles: string[],
    selectedRoles?: RoleType[] | null
  ): void {
    const isAllowed = (role: RoleType): boolean => !selectedRoles || selectedRoles.includes(role);
    if (isAllowed('solver') && !subtasks.some(t => t.roleType === 'solver')) {
      subtasks.unshift({ roleType: 'solver', label: 'Core', title: `Implement core logic: ${objective}`, targetFiles: [] });
    }
    const hasUiSignal = allFiles.some(f => RoleClassifier.isUiFile(f)) || /ui|arayüz|arayuz|theme|hud|tasarım|tasarim|ekran|görsel/i.test(objective);
    if (isAllowed('ui') && hasUiSignal && !subtasks.some(t => t.roleType === 'ui')) {
      subtasks.push({ roleType: 'ui', label: 'UI', title: `Refine UI layouts: ${objective}`, targetFiles: [] });
    }
    if (isAllowed('qa') && !subtasks.some(t => t.roleType === 'qa')) {
      subtasks.push({ roleType: 'qa', label: 'Audit', title: `Audit, triage, and test: ${objective}`, targetFiles: [] });
    }
    if (isAllowed('docs') && !subtasks.some(t => t.roleType === 'docs')) {
      subtasks.push({
        roleType: 'docs',
        label: 'Docs',
        title: `Document specs & living architecture: ${objective}`,
        targetFiles: [],
        phase: 3,
        dependsOn: ['Audit']
      });
    }
    if (subtasks.length === 0) {
      subtasks.push({ roleType: 'solver', label: 'Core', title: `Implement core logic: ${objective}`, targetFiles: [] });
    }
  }

  private static assignPhasesAndDependencies(subtasks: DecomposedSubtask[]): void {
    const foundationLabels = collectFoundationLabels(subtasks);
    const qaLabels = assignQaAndCollectLabels(subtasks, foundationLabels);
    const docDeps = qaLabels.length > 0 ? qaLabels : foundationLabels;
    const docPhase = resolveDocPhase(qaLabels.length, foundationLabels.length);
    for (const t of subtasks.filter(s => s.roleType === 'docs')) {
      t.phase = docPhase;
      t.dependsOn = [...docDeps];
    }
  }

  public static shardMaxConcurrency(
    subtasks: DecomposedSubtask[],
    targetFiles: string[],
    maxConcurrency = 12
  ): DecomposedSubtask[] {
    const sharded = TeamworkSharder.shardMaxConcurrency(subtasks, targetFiles, maxConcurrency);
    this.assignPhasesAndDependencies(sharded);
    return sharded;
  }
}
