/**
 * @file teamwork-decomposer-types.ts
 * Leaf type definitions for objective decomposition and sharding.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type { RoleType } from './role-classifier.js';

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
