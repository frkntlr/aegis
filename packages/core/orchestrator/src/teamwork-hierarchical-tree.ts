/**
 * @file teamwork-hierarchical-tree.ts
 * Hierarchical subagent tree orchestration and selective role activation.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type { RoleType } from './role-classifier.js';
import type { DecomposedSubtask } from './teamwork-decomposer.js';

export interface MicroSpecialistDef {
  label: string;
  focus: string;
  assignedTools: string[];
}

export const ROLE_SPECIALISTS: Record<RoleType, MicroSpecialistDef[]> = {
  qa: [
    { label: 'Playtest', focus: 'Headless Godot playtest and runtime gameplay audit', assignedTools: ['aegis_godot_playtest', 'verify_task'] },
    { label: 'Layout', focus: 'UI container hierarchy, responsive anchors, and visual lint', assignedTools: ['aegis_godot_inspect_ui', 'cage_check'] },
    { label: 'Cage', focus: 'Demir Kafes line budget and static complexity verification', assignedTools: ['cage_check', 'rtk_compress'] },
    { label: 'Mutation', focus: 'Mutation testing score and oracle trust verification', assignedTools: ['mutate', 'audit'] }
  ],
  solver: [
    { label: 'Logic', focus: 'Core algorithms, calculations, and domain business logic', assignedTools: ['find_symbol', 'ast_search'] },
    { label: 'State', focus: 'State machine transitions, lifecycle hooks, and store events', assignedTools: ['memory_query', 'trace_relational'] },
    { label: 'Contract', focus: 'Interface definitions, API contracts, and drift radar', assignedTools: ['deps_drift', 'context7_query'] },
    { label: 'Bridge', focus: 'Subsystem adapters, integration glue, and pipeline routing', assignedTools: ['ast_replace', 'socratic_diagnose'] }
  ],
  ui: [
    { label: 'Scaffold', focus: 'Container hierarchy, responsive anchors, and layouts', assignedTools: ['aegis_godot_tree', 'aegis_godot_inspect_ui'] },
    { label: 'Theme', focus: 'StyleBoxFlat styling, theme resources (.tres), and colors', assignedTools: ['aegis_godot_inspect_ui', 'cage_check'] },
    { label: 'Controller', focus: 'Decoupled presentation GDScript and signal emission', assignedTools: ['aegis_godot_signals', 'find_symbol'] },
    { label: 'Inspect', focus: 'Multi-aspect ratio sweeps (16:9, 21:9, 9:16) and polish', assignedTools: ['aegis_godot_inspect_ui', 'verify_task'] }
  ],
  docs: [
    { label: 'Wiki', focus: 'GitHub Wiki live synchronization and living memory push', assignedTools: ['wiki_sync', 'teamwork_mesh_read'] },
    { label: 'NLM', focus: 'Google NotebookLM ground truth query and research grounding', assignedTools: ['nlm_query', 'nlm_research'] },
    { label: 'RFC', focus: 'RFC ideation lifecycle, blueprint drafting, and discussions', assignedTools: ['rfc_create', 'rfc_decompose'] },
    { label: 'Matrix', focus: 'Living architectural diagrams and contract documentation', assignedTools: ['teamwork_doc_synthesize', 'rtk_compress'] }
  ]
};

export class TeamworkHierarchicalTree {
  public static detectSelectedRoles(objective: string, explicitRole?: string): RoleType[] | null {
    if (explicitRole) {
      const norm = explicitRole.toLowerCase().trim() as RoleType;
      if (norm === 'qa' || norm === 'solver' || norm === 'ui' || norm === 'docs') return [norm];
    }

    const lower = objective.toLowerCase();
    const roleFlagMatch = lower.match(/(?:--role|--only|-r)=([a-z\-]+)/);
    if (roleFlagMatch) {
      const parsed = this.normalizeRoleName(roleFlagMatch[1]);
      if (parsed) return [parsed];
    }

    if (/\b(?:qa-hunter|qa\s+hunter|yalnızca\s+qa|sadece\s+qa|only\s+qa)\b/.test(lower)) return ['qa'];
    if (/\b(?:issue-solver|issue\s+solver|yalnızca\s+solver|sadece\s+solver|only\s+solver)\b/.test(lower)) return ['solver'];
    if (/\b(?:ui-specialist|ui\s+specialist|yalnızca\s+ui|sadece\s+ui|only\s+ui)\b/.test(lower)) return ['ui'];
    if (/\b(?:doc-architect|doc\s+architect|yalnızca\s+doc|sadece\s+doc|only\s+doc)\b/.test(lower)) return ['docs'];

    return null;
  }

  public static isHierarchicalRequested(objective: string): boolean {
    const lower = objective.toLowerCase();
    return /\b(?:\d+\s+ajan|subagents?|tree|specialists?|hiyerarşi|hiyerarsi|ağaç|agac|mikro|kendi\s+altında|kendi\s+altinda|alt\s+ajan)\b/.test(lower);
  }

  public static expandHierarchicalRoles(
    subtasks: DecomposedSubtask[],
    selectedRoles: RoleType[] | null,
    objective: string,
    targetFiles: string[]
  ): DecomposedSubtask[] {
    const isTree = this.isHierarchicalRequested(objective);
    if (!isTree && !selectedRoles) return subtasks;

    const rolesToExpand = (selectedRoles && selectedRoles.length > 0)
      ? selectedRoles
      : (subtasks.length > 0 ? Array.from(new Set(subtasks.map(s => s.roleType))) : (['solver', 'ui', 'qa', 'docs'] as RoleType[]));
    const expanded: DecomposedSubtask[] = [];
    const assigned = new Set<string>();

    for (const role of rolesToExpand) {
      const specialists = ROLE_SPECIALISTS[role] ?? [];
      for (const spec of specialists) {
        const matched = this.filterFilesForSpecialist(role, spec.label, targetFiles, assigned);
        matched.forEach(f => assigned.add(f));
        expanded.push({
          roleType: role,
          label: spec.label,
          title: `${objective} [${spec.label}]: ${spec.focus}`,
          targetFiles: matched
        });
      }
    }

    this.distributeRemainingFiles(expanded, targetFiles, assigned);
    return expanded.length > 0 ? expanded : subtasks;
  }

  private static distributeRemainingFiles(tasks: DecomposedSubtask[], files: string[], assigned: Set<string>): void {
    if (tasks.length === 0) return;
    const unassigned = files.filter(f => !assigned.has(f));
    unassigned.forEach((f, idx) => {
      tasks[idx % tasks.length].targetFiles.push(f);
      assigned.add(f);
    });
  }

  private static normalizeRoleName(raw: string): RoleType | null {
    if (raw.includes('qa')) return 'qa';
    if (raw.includes('solver') || raw.includes('issue')) return 'solver';
    if (raw.includes('ui')) return 'ui';
    if (raw.includes('doc')) return 'docs';
    return null;
  }

  private static filterFilesForSpecialist(role: RoleType, label: string, files: string[], assigned: Set<string>): string[] {
    if (files.length === 0) return [];
    const pool = files.filter(f => !assigned.has(f));
    if (role === 'qa') {
      if (label === 'Playtest') return pool.filter(f => f.includes('test') || f.endsWith('.gd'));
      if (label === 'Layout') return pool.filter(f => f.endsWith('.tscn') || f.endsWith('.tres'));
      if (label === 'Cage') return pool.filter(f => f.endsWith('.ts') || f.endsWith('.gd'));
      return pool.filter(f => f.includes('test'));
    }
    if (role === 'ui') {
      if (label === 'Scaffold') return pool.filter(f => f.endsWith('.tscn'));
      if (label === 'Theme') return pool.filter(f => f.endsWith('.tres'));
      if (label === 'Controller') return pool.filter(f => f.endsWith('.gd'));
      return pool.filter(f => f.endsWith('.tscn') || f.endsWith('.tres'));
    }
    if (role === 'docs') {
      if (label === 'Wiki') return pool.filter(f => f.includes('wiki') || f.endsWith('.md'));
      if (label === 'RFC') return pool.filter(f => f.includes('rfc'));
      return pool.filter(f => f.endsWith('.md'));
    }
    return [];
  }
}
