/**
 * @file teamwork-prompts.ts
 * Pre-compiled system prompts and role identities for Antigravity subagents.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type { RoleType } from './role-classifier.js';
import { getAssignedAegisToolNames } from './teamwork-tools-catalog.js';

export interface SubagentProfile {
  name: string;
  roleType: RoleType;
  title: string;
  badge: string;
  description: string;
  systemPrompt: string;
  workspaceMode?: 'share' | 'branch' | 'inherit';
  enableWriteTools: boolean;
  enableSubagentTools?: boolean;
  enableMcpTools: boolean;
  defaultModel?: 'inherit' | 'flash_lite' | 'flash' | 'pro';
  aegisTools?: string[];
}

export const SOLVER_SYSTEM_PROMPT = `You are the Aegis Issue Solver subagent.
Badge: 🛠️ [ISSUE SOLVER] AKTİF | İzole Çözücü ve Geliştirici
Constitutional Guidelines:
1. Demir Kafes: Max 300 lines per source file, max 40 lines per function.
2. Surgical unified diffs only. Never perform full-file rewrites.
3. Claim only the exact numeric assigned inbox ID confirmed by the coordinator; shared role names are not unique IDs.
4. Respect active file mutex locks (.aegis/locks.json). Never edit files locked by sibling agents.
5. Mandatory Pre-commit Gate: Run unit tests and "aegis verify:task" before releasing your task.
6. Recursive Multi-Tier Subagents: Delegate independent scoped work with invoke_subagent only when available and host capacity permits; otherwise return child requests to the coordinator or execute sequentially. Verify child evidence.
7. Resilient Error Protocol: If tests fail, run "aegis triage" or "aegis debug". Max 2 surgical fix attempts. Never hang in infinite loops; if unresolvable, report [ROLE_FAILED: solver] with diagnostic reason.`;

export const QA_SYSTEM_PROMPT = `You are the Aegis QA Hunter subagent.
Badge: 🎯 [QA HUNTER] AKTİF | Teşhis, Oynanış ve Görsel UI Denetçisi
Constitutional Guidelines:
1. Demir Kafes: Max 300 lines per source file, max 40 lines per function.
2. Zero False Alarms: Use Evidence-Based Bug Triage ("aegis triage") before reporting defects.
3. Socratic Debugging: Triangulate stack traces with "aegis debug" before proposing any patch.
4. Multimodal Quality Gate: Execute "aegis verify:task" verifying test suite, headless Godot playtest, and runtime stability.
5. Mutation Testing: Verify that tests catch injected faults with >= 70% mutation score.
6. Trust Verifier: Audit test suites against tampering ("aegis audit").
7. Hierarchical Recursive Execution: Delegate independent audits to child QA subagents using invoke_subagent only when available and capacity permits; otherwise return scoped child requests to the coordinator or execute sequentially. Verify results with aegis verify:task.
8. Resilient Error Protocol: When tests or playtests fail, stratify findings with "aegis triage". Never stall; send clear [ROLE_COMPLETE: qa-hunter] with triage report or [ROLE_FAILED: qa-hunter] with root cause.`;

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
7. Demir Kafes: Keep UI controller scripts and theme files strictly under 300 lines, max 40 lines per function.
8. Recursive Multi-Tier Subagents: Delegate independent scenes with invoke_subagent only when available and host capacity permits; otherwise return scoped child requests to the coordinator or execute sequentially.`;

export const DOC_ARCHITECT_SYSTEM_PROMPT = `You are the Aegis Doc Architect subagent.
Badge: 📚 [DOC ARCHITECT] AKTİF | GitHub Dokümantasyon ve Proje Mimarı
Constitutional Guidelines:
1. Living Wiki: Synchronize documentation directly with "<repo>.wiki.git" using "aegis wiki:sync".
2. RFC Lifecycle: Draft architectural RFCs with acceptance criteria via "aegis rfc:create".
3. Zero Premature Coding: Ground architecture via NotebookLM and research synthesis before coding.
4. Issue Breakdown: Decompose accepted RFCs into atomic GitHub issues ("aegis rfc:decompose").
5. Recursive Multi-Tier Subagents: Delegate independent modules via invoke_subagent only when available and host capacity permits; otherwise return scoped child requests to the coordinator or execute sequentially.`;

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
    enableSubagentTools: true,
    enableMcpTools: true,
    defaultModel: 'inherit',
    aegisTools: getAssignedAegisToolNames('solver')
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
    enableSubagentTools: true,
    enableMcpTools: true,
    defaultModel: 'inherit',
    aegisTools: getAssignedAegisToolNames('qa')
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
    enableSubagentTools: true,
    enableMcpTools: true,
    defaultModel: 'inherit',
    aegisTools: getAssignedAegisToolNames('ui')
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
    enableSubagentTools: true,
    enableMcpTools: true,
    defaultModel: 'flash',
    aegisTools: getAssignedAegisToolNames('docs')
  }
];

export function getSubagentProfiles(): SubagentProfile[] {
  return [...SUBAGENT_PROFILES];
}

function buildPromptHeader(profile: SubagentProfile, roleIdentity: string, trackDesc: string, phase?: number, dependsOn?: string[]): string {
  const phaseInfo = phase ? `**Wave Phase**: Phase ${phase}\n` : '';
  const depInfo = dependsOn && dependsOn.length > 0 ? `**Upstream Dependencies**: [${dependsOn.join(', ')}]\n` : '';
  return `${profile.badge}\n\n` +
    `## Assigned Subagent Task\n` +
    `**Track**: ${profile.title} (${roleIdentity})\n` +
    `**Objective**: ${trackDesc}\n` +
    phaseInfo +
    depInfo;
}

function buildPromptFooter(roleType: RoleType, roleIdentity: string): string {
  return [
    '### Anti-Hallucination & Codebase Invariants',
    'Use grounded AST signatures; confirm missing context before changing code. Preserve unrelated edits, comments and imports.',
    'Keep <=300 lines/file, <=40 lines/function, zero any. Respect assigned file scope and .aegis/locks.json.',
    `Suggested Aegis tools (discover availability): ${getAssignedAegisToolNames(roleType).join(', ')}. Use aegis help <term> for syntax.`,
    '### Hierarchical Subagents & Dynamic Mesh',
    'Delegate independent scoped work with invoke_subagent only when the host exposes it and capacity permits; otherwise return child requests to the coordinator or execute sequentially.',
    'Dispatch ready independent tasks before waiting. Never assume child tools, unlimited depth or spare slots.',
    'Use aegis tw:peers to inspect peers; publish progress, changed files, findings and contracts using aegis tw:post.',
    '### Verification & Completion',
    'Claim only the assigned exact numeric inbox ID confirmed by the coordinator; shared role names are not unique task IDs.',
    'Run relevant tests and aegis verify:task; report checked evidence. Diagnose failures with aegis triage/debug and report unresolved failures without looping.',
    `Return [ROLE_COMPLETE: ${roleIdentity}] with files and evidence, or [ROLE_FAILED: ${roleIdentity}] with diagnostics.`,
    'Release only the assigned inbox ID after verification; respect coordinator-owned lifecycle. External publication requires explicit authorization.'
  ].join('\n');
}

export function compileTrackPrompt(
  profile: SubagentProfile,
  trackDesc: string,
  files: string[],
  subagentName?: string,
  dependsOn?: string[],
  phase?: number,
  groundingContext?: string,
  upstreamContracts?: string
): string {
  const targetStr = files.length > 0 ? files.map(f => `- \`${f}\``).join('\n') : '- Read-only; do not edit project files';
  const roleIdentity = subagentName ?? profile.name;
  const groundBlock = groundingContext ? `\n${groundingContext.trim()}\n` : '';
  const contractBlock = upstreamContracts ? `\n${upstreamContracts.trim()}\n` : '';

  return `${buildPromptHeader(profile, roleIdentity, trackDesc, phase, dependsOn)}\n` +
    `### Target Files & Locks\n${targetStr}\n` +
    groundBlock +
    contractBlock +
    `\n${buildPromptFooter(profile.roleType, roleIdentity)}`;
}

export function compileCompactTrackPrompt(
  profile: SubagentProfile,
  trackDesc: string,
  files: string[],
  subagentName?: string,
  dependsOn?: string[],
  phase?: number,
  upstreamContracts?: string,
  targetSymbols?: string[]
): string {
  const roleId = subagentName ?? profile.name;
  const deps = dependsOn?.length ? `|deps:[${dependsOn.join(',')}]` : '';
  const ph = phase ? `|W${phase}` : '';
  const fileStr = files.length ? files.join(', ') : 'general';
  const symStr = targetSymbols?.length ? `\nANCHORS:[${targetSymbols.join(', ')}]` : '';
  const contractSlice = upstreamContracts ? `\nCONTRACT:${upstreamContracts.trim()}` : '';

  return `[${profile.badge}]\n` +
    `TASK:${roleId}${ph}${deps} | GOAL:${trackDesc}\n` +
    `FILES:[${fileStr}]${symStr}${contractSlice}\n` +
    `GATE:DemirKafes(<300L/file,<40L/fn,0any),SurgicalDiffs,VerifyTask\n` +
    `COMM:tw:post progress | Conclude:[ROLE_COMPLETE: ${roleId}]`;
}

export function compileUltraLeanPrompt(
  profile: SubagentProfile,
  desc: string,
  files: string[],
  subagentName?: string,
  targetSymbols?: string[],
  contract?: string,
  phase?: number,
  dependsOn?: string[]
): string {
  const roleId = subagentName ?? profile.name;
  const targetStr = files.length > 0 ? files.join(', ') : 'general';
  const symStr = targetSymbols?.length ? `\nANCHORS:[${targetSymbols.join(', ')}]` : '';
  const cStr = contract ? `\nCONTRACT:${contract.trim()}` : '';
  const ph = phase ? `|W${phase}` : '';
  const deps = dependsOn?.length ? `|deps:[${dependsOn.join(',')}]` : '';

  return `[${profile.badge}]\n` +
    `ACT:${roleId}${ph}${deps} | GOAL:${desc}\n` +
    `FILES:[${targetStr}]${symStr}${cStr}\n` +
    `GATE:DemirKafes(<300L/file,<40L/fn,0any),SurgicalDiff,VerifyTask\n` +
    `COMM:tw:post progress | Conclude:[ROLE_COMPLETE: ${roleId}]`;
}


