/**
 * @file teamwork-prompts.ts
 * Pre-compiled system prompts and role identities for Antigravity subagents.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type { RoleType } from './role-classifier.js';
import { buildIntelligentToolGuidance, getAssignedAegisToolNames } from './teamwork-tools-catalog.js';

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
3. Pull assigned tasks from TIP inbox (.aegis/task-inbox.json) or CLI "aegis task:pull solver".
4. Respect active file mutex locks (.aegis/locks.json). Never edit files locked by sibling agents.
5. Mandatory Pre-commit Gate: Run unit tests and "aegis verify:task" before releasing your task.
6. Hierarchical Subagents: You have full subagent tools enabled. When a task spans multiple modules, spawn child solvers with disjoint locks.
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
7. Hierarchical Recursive Execution: Birden fazla dosya veya çok aşamalı denetim (statik analiz, tip güvenliği, test koşuları) yaparken tüm dosyaları tek bir sohbette sıralı olarak analiz edip düzenleme! Doğrudan \`invoke_subagent\` çağırarak izole dosya denetçisi veya boyut denetçisi çocuk ajanlar (child QA subagents) başlat. Sonuçları toplayıp \`verify:task\` ile doğrula.
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
8. Hierarchical Subagents: You have full subagent tools enabled. Spawn child UI agents to scaffold or audit multiple scenes concurrently.`;

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

function buildHierarchicalGuidance(): string {
  return `### 🌲 Hiyerarşik Alt Ajan (Child Subagents) ve Bağlam Yönetimi\n` +
    `- Bağlam Şişmesini Önleme: Çok sayıda dosyayı tek bir sohbette ardışık okumak veya uzun test çıktıları biriktirmek bağlamı şişirir (\`Model unavailable\`, yüksek gecikme).\n` +
    `- Ne Zaman Alt Ajan?: Birden fazla dosya incelenirken ya da ayrık boyutlarda (statik analiz, tip güvenliği, test koşuları) denetim yürütülürken derhal izole alt ajan başlatın.\n` +
    `- Nasıl Başlatılır?: \`invoke_subagent\` kullanarak hedefe odaklı çocuk ajanlar (child subagents) oluşturun; dönen özetleri toplayıp \`verify:task\` ile sentezleyin.\n\n`;
}

function buildDynamicMeshGuidance(): string {
  return `### 🌐 Dynamic Mesh & Peer Subagent Awareness (Simultaneous Execution)\n` +
    `You are executing in parallel with other subagents within an active execution wave.\n` +
    `- Inspect peer subagents and active file locks: \`aegis tw:peers\` or MCP \`teamwork_mesh_read\` / \`teamwork_peers\`.\n` +
    `- Publish your activity, changed files, and contracts: \`aegis tw:post "<activity>" --files="<files>" --contract="<types>"\` or MCP \`teamwork_mesh_post\`.\n` +
    `- Anlık Durum & Bulgu Paylaşımı: Tespit edilen kusurları, kırılan sözleşmeleri veya kritik ara bulguları anında bildirin: \`aegis tw:post "Finding: <detay>"\`.\n` +
    `- Broadcast milestones to peer agents: \`aegis tw:broadcast "<message>"\` or MCP \`teamwork_broadcast\`.\n\n`;
}

function buildPromptFooter(roleType: RoleType, roleIdentity: string): string {
  const toolGuidance = buildIntelligentToolGuidance(roleType);
  const toolSection = toolGuidance ? `${toolGuidance}\n\n` : '';

  return `### ⚖️ Anti-Hallucination & Codebase Invariants\n` +
    `1. Strict Type Fidelity: Never import or call non-existent methods. Refer strictly to the AST interface contracts above.\n` +
    `2. Surgical Diffs: Replace only the relevant blocks; preserve all existing comments, docstrings, and imports.\n` +
    `3. Line Budget Headroom: Ensure your changes do not push any file past 300 lines (Demir Kafes).\n` +
    `4. Zero any: All types must be explicitly typed.\n\n` +
    toolSection +
    buildHierarchicalGuidance() +
    buildDynamicMeshGuidance() +
    `### Instructions\n` +
    `1. Pull staged details using \`aegis task:pull "${roleIdentity}"\` or MCP \`task_inbox_pull\`.\n` +
    `2. Execute changes within your designated workspace.\n` +
    `3. Validate with \`aegis verify:task\` or \`aegis test\` before concluding.\n` +
    `4. Resilient Error Protocol: If tests fail, run \`aegis triage\` or \`aegis debug\` for Socratic analysis. Max 2 surgical fix attempts. NEVER HANG or loop indefinitely!\n` +
    `5. Reporting Signal: On success, notify Team Lead: \`[ROLE_COMPLETE: ${roleIdentity}]\` with surgical diff summary. On fatal defect or unresolvable test, notify: \`[ROLE_FAILED: ${roleIdentity}] <reason>\` and release locks via \`aegis task:release "${roleIdentity}" blocked "<reason>"\`.`;
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
  const targetStr = files.length > 0 ? files.map(f => `- \`${f}\``).join('\n') : '- General codebase scope';
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


