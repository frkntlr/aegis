/**
 * @file teamwork-tools-catalog.ts
 * Intelligent Aegis Tool Arsenal mapping and prompt generators for Antigravity subagents.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type { RoleType } from './role-classifier.js';

export interface AegisToolDefinition {
  name: string;
  cliCommand: string;
  mcpTool: string;
  description: string;
  purpose: string;
}

export const ROLE_AEGIS_TOOLS: Record<RoleType, AegisToolDefinition[]> = {
  solver: [
    {
      name: 'find_symbol',
      cliCommand: 'aegis find <symbol>',
      mcpTool: 'find_symbol / memory_query',
      description: '5-Layer Codebase Memory AST lookup',
      purpose: 'Retrieve exact symbol signatures, interfaces, and types without hallucinating'
    },
    {
      name: 'ast_search',
      cliCommand: 'aegis ast:search "<pattern>" [dir]',
      mcpTool: 'ast_search',
      description: 'Structural AST search via ast-grep',
      purpose: 'Pinpoint structural code patterns, decorators, and call sites'
    },
    {
      name: 'ast_replace',
      cliCommand: 'aegis ast:replace "<pat>" "<rep>" <file>',
      mcpTool: 'ast_replace',
      description: 'Structural AST surgical replacement',
      purpose: 'Execute verified structural code transforms without touching unrelated comments'
    },
    {
      name: 'trace_relational',
      cliCommand: 'aegis trace <target>',
      mcpTool: 'trace_relational',
      description: 'Relational caller, callee, and signal listener trace',
      purpose: 'Safely refactor functions with 100% awareness of downstream dependents'
    },
    {
      name: 'context7_query',
      cliCommand: 'aegis context7:query <library> <topic>',
      mcpTool: 'context7_query',
      description: 'Official ground-truth documentation retrieval',
      purpose: 'Fetch authoritative API specs and docs before implementing external library features'
    },
    {
      name: 'socratic_diagnose',
      cliCommand: 'aegis debug "<error>"',
      mcpTool: 'socratic_diagnose',
      description: 'Socratic evidence-based interactive debugging',
      purpose: 'Triangulate stack traces and verify root causes before writing patches'
    }
  ],
  qa: [
    {
      name: 'triage',
      cliCommand: 'aegis triage [dir]',
      mcpTool: 'triage',
      description: 'Evidence-based zero-false-alarm bug triage',
      purpose: 'Scan target directory for verified runtime, AST, and structural flaws'
    },
    {
      name: 'cage_check',
      cliCommand: 'aegis cage:check',
      mcpTool: 'cage_check',
      description: 'Demir Kafes quality gate compliance audit',
      purpose: 'Enforce <300 lines/file, <40 lines/function, and strictly 0 any invariants'
    },
    {
      name: 'rtk_compress',
      cliCommand: 'aegis rtk:compress [file]',
      mcpTool: 'rtk_compress',
      description: 'RTK Token Killer test output compressor',
      purpose: 'Compress verbose test and build logs by 85-95% to preserve context headroom'
    },
    {
      name: 'aegis_godot_playtest',
      cliCommand: 'aegis godot playtest',
      mcpTool: 'aegis_godot_playtest',
      description: 'Multimodal headless Godot playtest gate',
      purpose: 'Verify engine runtime stability, physics loop, and gameplay integrity'
    },
    {
      name: 'aegis_godot_inspect_ui',
      cliCommand: 'aegis godot inspect',
      mcpTool: 'aegis_godot_inspect_ui',
      description: 'Multi-resolution UI bounding-box auditor',
      purpose: 'Detect UI clipping, container overflow, and layout distortions'
    },
    {
      name: 'audit',
      cliCommand: 'aegis audit <testFiles...>',
      mcpTool: 'audit',
      description: 'Immutable Oracle trust verification',
      purpose: 'Verify test suites against tampering, artificial passes, or disabled assertions'
    }
  ],
  ui: [
    {
      name: 'godot_ui_lint',
      cliCommand: 'aegis godot ui:lint <scene.tscn>',
      mcpTool: 'godot_ui_lint',
      description: 'Godot 4 UI compliance linter',
      purpose: 'Verify container hierarchies, full rect anchors 15, and 44x44px touch targets'
    },
    {
      name: 'aegis_godot_inspect_ui',
      cliCommand: 'aegis godot inspect',
      mcpTool: 'aegis_godot_inspect_ui',
      description: 'Dynamic UI layout inspector',
      purpose: 'Sweep aspect ratios (16:9, 21:9, 16:10, 9:16) for responsive layout stability'
    },
    {
      name: 'godot_ui_scaffold',
      cliCommand: 'aegis godot ui:scaffold <type> <name>',
      mcpTool: 'godot_ui_scaffold',
      description: 'Container-first responsive UI scaffolder',
      purpose: 'Scaffold production-ready menus, HUDs, dialogs, and StyleBoxFlat themes'
    },
    {
      name: 'aegis_godot_tree',
      cliCommand: 'aegis godot tree',
      mcpTool: 'aegis_godot_tree',
      description: 'Live scene tree inspector',
      purpose: 'Inspect active scene node hierarchy and unique name bindings (%Node)'
    },
    {
      name: 'aegis_godot_signals',
      cliCommand: 'aegis godot signals <node>',
      mcpTool: 'aegis_godot_signals',
      description: 'Signal wiring and listener audit',
      purpose: 'Verify decoupled signal connections between UI and business logic'
    }
  ],
  docs: [
    {
      name: 'teamwork_doc_synthesize',
      cliCommand: 'aegis tw:doc [planId]',
      mcpTool: 'teamwork_doc_synthesize',
      description: 'Living architecture DAG and markdown briefing',
      purpose: 'Synthesize architecture docs, Mermaid DAGs, and milestone summaries'
    },
    {
      name: 'notebook_query',
      cliCommand: 'aegis nlm:query "<question>"',
      mcpTool: 'notebook_query',
      description: 'NotebookLM deep project grounding',
      purpose: 'Query authoritative project repository notebook for architectural context'
    },
    {
      name: 'nlm_research',
      cliCommand: 'aegis nlm:research "<topic>"',
      mcpTool: 'nlm_research',
      description: 'Autonomous architectural deep research',
      purpose: 'Perform deep topic research via NotebookLM and stage findings into wiki'
    },
    {
      name: 'wiki_sync',
      cliCommand: 'aegis wiki:sync',
      mcpTool: 'wiki_sync',
      description: 'Living Wiki Git synchronization',
      purpose: 'Synchronize living architectural blueprints directly to <repo>.wiki.git'
    },
    {
      name: 'rfc_lifecycle',
      cliCommand: 'aegis rfc:create "<title>" / aegis rfc:decompose <id>',
      mcpTool: 'rfc_create / rfc_decompose',
      description: 'RFC blueprint ideation and issue breakdown',
      purpose: 'Publish architectural blueprints to Discussions and decompose into atomic issues'
    }
  ]
};

export function getAssignedAegisToolNames(roleType: RoleType): string[] {
  const tools = ROLE_AEGIS_TOOLS[roleType] ?? [];
  return tools.map(t => t.name);
}

export function buildIntelligentToolGuidance(roleType: RoleType): string {
  const tools = ROLE_AEGIS_TOOLS[roleType] ?? [];
  if (tools.length === 0) return '';

  const lines: string[] = [
    '### 🛠️ Akıllı Aegis Araç Cephanesi (Intelligent Aegis Tool Arsenal)',
    'Bu görev için sana özel yetkilendirilmiş Aegis araçlarını akıllıca ve otonom olarak kullan:',
    ''
  ];

  for (const t of tools) {
    lines.push(`- **${t.description}**: \`${t.cliCommand}\` (MCP: \`${t.mcpTool}\`)`);
    lines.push(`  *Amaç*: ${t.purpose}`);
  }

  return lines.join('\n');
}

export function formatAegisToolMatrix(roleFilter?: string): string {
  const roles: RoleType[] = roleFilter && roleFilter in ROLE_AEGIS_TOOLS
    ? [roleFilter as RoleType]
    : (['solver', 'qa', 'ui', 'docs'] as RoleType[]);

  const lines: string[] = [
    '### 🛠️ Aegis Antigravity Teamwork Akıllı Araç Matrisi',
    '| Rol | Araç | CLI Komutu | MCP Aracı | Açıklama |',
    '| :--- | :--- | :--- | :--- | :--- |'
  ];

  for (const r of roles) {
    const list = ROLE_AEGIS_TOOLS[r] ?? [];
    for (const t of list) {
      lines.push(`| \`${r}\` | \`${t.name}\` | \`${t.cliCommand}\` | \`${t.mcpTool}\` | ${t.description} |`);
    }
  }

  return lines.join('\n');
}
