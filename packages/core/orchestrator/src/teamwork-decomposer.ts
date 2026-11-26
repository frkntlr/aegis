/**
 * @file teamwork-decomposer.ts
 * Decomposes objectives into granular subtasks and statically partitions files.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { RoleClassifier, type RoleType } from './role-classifier.js';
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

export interface DecomposedSubtask {
  roleType: RoleType;
  label: string;
  title: string;
  targetFiles: string[];
  dependsOn?: string[];
  phase?: number;
}

export interface DecomposeOptions {
  maxConcurrency?: number;
  autoScale?: boolean;
  selectedRoles?: RoleType[];
  explicitRole?: string;
  treeSpecialists?: boolean;
}

export class TeamworkDecomposer {
  public static decompose(
    objective: string,
    targetFiles: string[] = [],
    options?: DecomposeOptions
  ): DecomposedSubtask[] {
    const selectedRoles = options?.selectedRoles ?? TeamworkHierarchicalTree.detectSelectedRoles(objective, options?.explicitRole);
    const isTree = options?.treeSpecialists || TeamworkHierarchicalTree.isHierarchicalRequested(objective);

    const rawItems = this.splitObjective(objective);
    const parsed = rawItems.map(item => classifyRawItemHelper(item));
    let subtasks = enrichSubtasksHelper(parsed);
    if (selectedRoles && selectedRoles.length > 0) {
      subtasks = subtasks.filter(t => selectedRoles.includes(t.roleType));
    }
    this.ensureRequiredTracks(subtasks, objective, targetFiles, selectedRoles);

    if (isTree) {
      subtasks = TeamworkHierarchicalTree.expandHierarchicalRoles(subtasks, selectedRoles, objective, targetFiles);
    }

    if (rawItems.length <= 1) {
      this.shardSolversAndQa(subtasks, targetFiles, objective, options);
    }
    TeamworkDocSharder.shardDocsBySpecialists(subtasks, targetFiles, objective, options?.maxConcurrency ?? 12);
    TeamworkSharder.partitionFiles(subtasks, targetFiles);
    this.assignPhasesAndDependencies(subtasks);

    const shouldScale = !isTree && Boolean(
      options?.autoScale || (options?.maxConcurrency && options.maxConcurrency > 4) ||
      (targetFiles.length === 0 && options?.maxConcurrency && options.maxConcurrency > 1) ||
      (targetFiles.length === 1 && options?.autoScale) ||
      (targetFiles.length >= 2 && options?.maxConcurrency && options.maxConcurrency > 1)
    );
    if (shouldScale) {
      return this.shardMaxConcurrency(subtasks, targetFiles, options?.maxConcurrency ?? 12);
    }
    return subtasks;
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
    const foundationLabels: string[] = [];
    for (const t of subtasks) {
      if (t.roleType === 'solver' || t.roleType === 'ui') {
        t.phase = 1;
        t.dependsOn = [];
        foundationLabels.push(t.label);
      }
    }

    const qaLabels: string[] = [];
    for (const t of subtasks) {
      if (t.roleType === 'qa') {
        t.phase = foundationLabels.length > 0 ? 2 : 1;
        t.dependsOn = [...foundationLabels];
        qaLabels.push(t.label);
      }
    }

    const docDeps = qaLabels.length > 0 ? qaLabels : foundationLabels;
    for (const t of subtasks) {
      if (t.roleType === 'docs') {
        t.phase = qaLabels.length > 0 ? 3 : foundationLabels.length > 0 ? 2 : 1;
        t.dependsOn = [...docDeps];
      }
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
