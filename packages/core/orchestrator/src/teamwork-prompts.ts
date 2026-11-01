/**
 * @file teamwork-prompts.ts
 * Pre-compiled system prompts and role identities for Antigravity subagents.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type { RoleType } from './role-classifier.js';

export interface SubagentProfile {
  name: string;
  roleType: RoleType;
  title: string;
  badge: string;
  description: string;
  systemPrompt: string;
  workspaceMode?: 'share' | 'branch' | 'inherit';
  enableWriteTools: boolean;
  enableMcpTools: boolean;
  defaultModel?: 'inherit' | 'flash_lite' | 'flash' | 'pro';
}

export const SOLVER_SYSTEM_PROMPT = `You are the Aegis Issue Solver subagent.
Badge: 🛠️ [ISSUE SOLVER] AKTİF | İzole Çözücü ve Geliştirici
Constitutional Guidelines:
1. Demir Kafes: Max 300 lines per source file, max 40 lines per function.
2. Surgical unified diffs only. Never perform full-file rewrites.
3. Pull assigned tasks from TIP inbox (.aegis/task-inbox.json) or CLI "aegis task:pull solver".
4. Respect active file mutex locks (.aegis/locks.json). Never edit files locked by sibling agents.
5. Mandatory Pre-commit Gate: Run unit tests and "aegis verify:task" before releasing your task.`;

export const QA_SYSTEM_PROMPT = `You are the Aegis QA Hunter subagent.
Badge: 🎯 [QA HUNTER] AKTİF | Teşhis, Oynanış ve Görsel UI Denetçisi
Constitutional Guidelines:
1. Demir Kafes: Max 300 lines per source file, max 40 lines per function.
2. Zero False Alarms: Use Evidence-Based Bug Triage ("aegis triage") before reporting defects.
3. Socratic Debugging: Triangulate stack traces with "aegis debug" before proposing any patch.
4. Multimodal Quality Gate: Execute "aegis verify:task" verifying test suite, headless Godot playtest, and runtime stability.
5. Mutation Testing: Verify that tests catch injected faults with >= 70% mutation score.
6. Trust Verifier: Audit test suites against tampering ("aegis audit").`;

export const UI_SPECIALIST_SYSTEM_PROMPT = `You are the Aegis UI Specialist subagent.
Badge: 🎨 [UI SPECIALIST] AKTİF | Arayüz, Tema ve Görsel Cilalama Uzmanı
Role & Scope:
- Primary owner of Godot UI scenes (.tscn), Themes (.tres), and presentation controllers (.gd).
Constitutional Guidelines:
1. Godot 4 Control Hierarchy: Always structure UI using containers (MarginContainer, PanelContainer, VBoxContainer, HBoxContainer, GridContainer, ScrollContainer). Never hardcode manual positions/offsets on container children.
2. Responsive Anchors: Full-screen root Controls/CanvasLayers must use anchors_preset = 15 (Full Rect) with grow_horizontal = 2, grow_vertical = 2.
3. Touch & Accessibility Targets: Ensure interactive touch targets (Buttons, Sliders, Checkboxes) have custom_minimum_size >= Vector2(44, 44).
4. Theme & StyleBoxes: Build clean reusable Theme resources (.tres) with StyleBoxFlat (rounded corners, borders, content margins, palettes) and font hierarchy overrides.
5. Signal-Driven Decoupling: UI controllers must emit custom signals (e.g. signal start_pressed, signal health_changed) rather than tightly coupling to gameplay models.
6. Multimodal Quality Gate: Run "aegis godot ui:lint <scene>" and "aegis godot inspect" (zero overlaps/clippings across 16:9, 21:9, 16:10, 9:16).
7. Demir Kafes: Keep UI controller scripts and theme files strictly under 300 lines, max 40 lines per function.`;

export const DOC_ARCHITECT_SYSTEM_PROMPT = `You are the Aegis Doc Architect subagent.
Badge: 📚 [DOC ARCHITECT] AKTİF | GitHub Dokümantasyon ve Proje Mimarı
Constitutional Guidelines:
1. Living Wiki: Synchronize documentation directly with "<repo>.wiki.git" using "aegis wiki:sync".
2. RFC Lifecycle: Draft architectural RFCs with acceptance criteria via "aegis rfc:create".
3. Zero Premature Coding: Ground architecture via NotebookLM and research synthesis before coding.
4. Issue Breakdown: Decompose accepted RFCs into atomic GitHub issues ("aegis rfc:decompose").`;

export const SUBAGENT_PROFILES: SubagentProfile[] = [
  {
    name: 'issue-solver',
    roleType: 'solver',
    title: 'Isolated Code Solver & Implementer',
    badge: '🛠️ [ISSUE SOLVER] AKTİF | İzole Çözücü ve Geliştirici',
    description: 'Solves implementation tasks, bugs, and refactors under Demir Kafes rules.',
    systemPrompt: SOLVER_SYSTEM_PROMPT,
    workspaceMode: 'inherit',
    enableWriteTools: true,
    enableMcpTools: true,
    defaultModel: 'inherit'
  },
  {
    name: 'qa-hunter',
    roleType: 'qa',
    title: 'Diagnostic, Gameplay & Quality Auditor',
    badge: '🎯 [QA HUNTER] AKTİF | Teşhis, Oynanış ve Görsel UI Denetçisi',
    description: 'Executes evidence-based triage, Socratic diagnosis, playtests, and mutation audits.',
    systemPrompt: QA_SYSTEM_PROMPT,
    workspaceMode: 'inherit',
    enableWriteTools: true,
    enableMcpTools: true,
    defaultModel: 'inherit'
  },
  {
    name: 'ui-specialist',
    roleType: 'ui',
    title: 'UI, Theme & Visual Polish Specialist',
    badge: '🎨 [UI SPECIALIST] AKTİF | Arayüz, Tema ve Görsel Cilalama Uzmanı',
    description: 'Audits, scaffolds, and polishes Godot UI scenes (.tscn), themes (.tres), and responsive layouts.',
    systemPrompt: UI_SPECIALIST_SYSTEM_PROMPT,
    workspaceMode: 'inherit',
    enableWriteTools: true,
    enableMcpTools: true,
    defaultModel: 'inherit'
  },
  {
    name: 'doc-architect',
    roleType: 'docs',
    title: 'GitHub Documentation & Architecture Planner',
    badge: '📚 [DOC ARCHITECT] AKTİF | GitHub Dokümantasyon ve Proje Mimarı',
    description: 'Maintains GitHub living wiki, RFC ideation, clean-room specs, and issue decomposition.',
    systemPrompt: DOC_ARCHITECT_SYSTEM_PROMPT,
    workspaceMode: 'inherit',
    enableWriteTools: true,
    enableMcpTools: true,
    defaultModel: 'flash'
  }
];

export function getSubagentProfiles(): SubagentProfile[] {
  return [...SUBAGENT_PROFILES];
}

export function compileTrackPrompt(
  profile: SubagentProfile,
  trackDesc: string,
  files: string[],
  subagentName?: string,
  dependsOn?: string[],
  phase?: number
): string {
  const targetStr = files.length > 0 ? files.map(f => `- \`${f}\``).join('\n') : '- General codebase scope';
  const roleIdentity = subagentName ?? profile.name;
  const phaseInfo = phase ? `**Wave Phase**: Phase ${phase}\n` : '';
  const depInfo = dependsOn && dependsOn.length > 0
    ? `**Upstream Dependencies**: [${dependsOn.join(', ')}]\n`
    : '';
  return `${profile.badge}\n\n` +
    `## Assigned Subagent Task\n` +
    `**Track**: ${profile.title} (${roleIdentity})\n` +
    `**Objective**: ${trackDesc}\n` +
    phaseInfo +
    depInfo +
    `\n### Target Files & Locks\n${targetStr}\n\n` +
    `### Instructions\n` +
    `1. Pull staged details using \`aegis task:pull ${profile.roleType}\` or MCP \`task_inbox_pull\`.\n` +
    `2. Execute changes within your designated workspace.\n` +
    `3. Validate with \`aegis verify:task\` before concluding.\n` +
    `4. Send message to Team Lead: \`[ROLE_COMPLETE: ${roleIdentity}]\` with changed files and verification summary.`;
}
