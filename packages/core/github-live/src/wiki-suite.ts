export interface WikiSuitePage {
  slug: string;
  title: string;
  threeBullets: [string, string, string];
  content: string;
}

export const DEFAULT_WIKI_SUITE: WikiSuitePage[] = [
  {
    slug: 'Home',
    title: 'Aegis Autonomous Vibe Coding Engine Master Index',
    threeBullets: [
      'Multi-Worktree Autonomous Execution Harness for Alice, Bob & Contributors.',
      'Universal Multi-IDE compatibility (Antigravity, Cursor, Windsurf, Zed, VS Code).',
      'Deterministic Iron Cage Quality Gates with Zero-Token UI Telemetry & NotebookLM Grounding.'
    ],
    content: [
      '## 🛡️ Welcome to the Aegis Living Architecture Wiki',
      '',
      'Aegis is an enterprise-grade autonomous harness that transforms vibe coding from chaotic LLM hallucinations into a deterministic, surgical software engineering engine.',
      '',
      '### 📚 Living Architecture Modules',
      '- **[[Architecture]]:** Multi-worktree execution, isolated branches, AST skeleton prompt caching.',
      '- **[[Toolchain-and-IDEs]]:** MultiGravity, Cursor, Windsurf, Zed & Godot 4.x application runtime compatibility.',
      '- **[[MCP-and-Skills-Ecosystem]]:** Universal MCP server synchronization, Skill definitions, and security allowlists.',
      '- **[[Plugin-and-Extensibility]]:** Language extractors, custom IDE adapters, and community RFC triage pipeline.',
      '- **[[NotebookLM-Integration]]:** Deep research engine, DBSC origin-bound cookies, and ground-truth citations.',
      '- **[[Quality-Shields-and-Gates]]:** Deterministik Demir Kafes (<40 lines/fn, <300 lines/file), Mutation Testing & Oracle.',
      '- **[[Autonomous-Kanban-Protocol]]:** GitHub Projects v2 live synchronization and conflict-free file locking protocol.'
    ].join('\n')
  },
  {
    slug: 'Architecture',
    title: 'Aegis Core Architecture & Multi-Worktree Harness',
    threeBullets: [
      'Physical directory boundary isolation via Git worktrees (`experimental/alice`, `experimental/bob`).',
      'AST Skeleton Prompt Caching reducing context token overhead by ~82%.',
      '4-Step Atomic Merge Pipeline: Local Verify -> Upstream Rebase -> Merge -> Sibling Sync.'
    ],
    content: [
      '## 🏛️ System Architecture Specification',
      '',
      '### 1. Multi-Worktree Isolation',
      'Autonomous agents never write to the root repository or shared branches. Each agent operates in an isolated physical worktree (`experimental/<agent>`) backed by an independent git branch (`aegis/<agent>`).',
      '',
      '### 2. AST Skeleton Prompt Caching',
      'Aegis extracts structural AST skeletons (omitting function bodies while preserving types, signatures, and docstrings). This achieves ~82% token reduction, keeping prompt caches warm and eliminating context bloat.',
      '',
      '### 3. Conflict-Free Locking Protocol',
      'Before writing code, agents must acquire file lock tags (`lock:<filepath>`). Parallel sibling agents query active locks and skip any conflicting tasks, preventing merge collisions before code is written.'
    ].join('\n')
  },
  {
    slug: 'Toolchain-and-IDEs',
    title: 'Multi-IDE & Application Runtime Compatibility Matrix',
    threeBullets: [
      'Simultaneous multi-agent support across Antigravity (MultiGravity), Cursor, Windsurf, Zed, and VS Code.',
      'Native application runtime compatibility with Godot 4.x Game Engine via godot-mcp & godot-mcp-runtime.',
      'Automated settings isolation preventing IDE indexers from scanning active agent worktrees.'
    ],
    content: [
      '## 💻 Multi-IDE & Runtime Compatibility Matrix',
      '',
      '### 1. Supported Environments',
      '| Environment | Capabilities | Config Path | Multi-Agent Mode |',
      '|---|---|---|---|',
      '| **Google Antigravity** | ✅ MCP, ✅ Skills, ✅ Subagents | `.gemini/config/mcp_config.json` | MultiGravity Native |',
      '| **Cursor AI** | ✅ MCP, ✅ Skills, ❌ Subagents | `.cursor/mcp.json` | Isolated Worktree |',
      '| **Codeium Windsurf** | ✅ MCP, ✅ Skills, ❌ Subagents | `.codeium/windsurf/mcp_config.json` | Isolated Worktree |',
      '| **Zed Editor** | ✅ MCP, ❌ Skills, ❌ Subagents | `.zed/settings.json` | Single-Agent Focus |',
      '| **Visual Studio Code** | ✅ MCP, ❌ Skills, ❌ Subagents | `.vscode/mcp.json` | Single-Agent Focus |',
      '',
      '### 2. Application Runtime Compatibility: Godot 4.x',
      'Aegis provides native game runtime integration with Godot 4.x using both `godot-mcp-runtime` (live process simulation, screenshots, profiling) and `godot-mcp` (deep scene node management and GDScript validation).'
    ].join('\n')
  },
  {
    slug: 'MCP-and-Skills-Ecosystem',
    title: 'Universal MCP & Skills Synchronization Engine',
    threeBullets: [
      'Single-command cross-IDE toolchain synchronization via `aegis ide:sync`.',
      'Deterministic MCP Security Manager enforcing allowlists, rate limiting, and blocking destructive calls.',
      'Agent role orchestration binding specialized skills (QA Hunter, Issue Solver, UI Specialist, Doc Architect).'
    ],
    content: [
      '## 🔌 MCP Servers & Skills Ecosystem',
      '',
      '### 1. Cross-IDE MCP Synchronization',
      'Executing `aegis ide:sync` discovers active MCP servers in the environment (including `notebooklm-mcp-server` and `godot-mcp`) and synchronizes their definitions across all supported IDE configuration files.',
      '',
      '### 2. MCP Security Manager',
      '- **Allowlist Enforcement:** Agents can only invoke explicitly approved MCP tools.',
      '- **Destructive Tool Denial:** System commands that modify unreserved files or branch states are blocked.',
      '- **Adaptive Rate Limiting:** Prevents API throttling against GitHub and external model providers.',
      '',
      '### 3. Agent Specialization Matrix',
      '- **`alice` (Issue Solver):** Worktree development, test execution, Demir Kafes compliance.',
      '- **`bob` (QA Hunter / Telemetry):** Zero-token bounding box layout inspection and regression hunting.',
      '- **`contributor` (Doc Architect):** Living wiki documentation, RFC triage, and GitHub Discussions synchronization.'
    ].join('\n')
  },
  {
    slug: 'Plugin-and-Extensibility',
    title: 'Aegis Plugin Architecture & Community Extensibility',
    threeBullets: [
      'Modular `LanguageExtractor` interface supporting TypeScript, Python, GDScript, Rust, Go, and C#.',
      'Extensible `IdeAdapter` interface for adding custom developer editors with automated isolation.',
      'Zero-token RFC triage workflow (`aegis rfc:triage`) converting community proposals into actionable issues.'
    ],
    content: [
      '## 🧩 Plugin & Extensibility Specification',
      '',
      '### 1. Language Extractor Plugins',
      'Adding support for a new programming language requires implementing the standard `LanguageExtractor` interface:',
      '```typescript',
      'export interface LanguageExtractor {',
      '  canHandle(filePath: string): boolean;',
      '  extractSkeleton(source: string, filePath: string): ExtractedSkeleton;',
      '}',
      '```',
      'Community extractors register via `ExtractorRegistry.register(new MyLanguageExtractor())` with zero modifications to core dispatcher code.',
      '',
      '### 2. Community RFC Workflow',
      'Community members submit proposals via GitHub Discussions. Running `aegis rfc:triage "<Title>" "<Body>"` parses target files, derives acceptance criteria, creates a NotebookLM research note, and prepares GitHub Issues automatically.'
    ].join('\n')
  },
  {
    slug: 'NotebookLM-Integration',
    title: 'Google NotebookLM Deep Research & Living Ground Truth',
    threeBullets: [
      'Live AI synthesis backed by verified ground truth citations (`[cite: x, y]`).',
      'DBSC and origin-bound OSID cookie partitioning for seamless Chromium BrowserBridge fallback.',
      'Autonomous research pipeline (`aegis nlm:research`) generating architectural criteria directly into Wiki.'
    ],
    content: [
      '## 🔬 Google NotebookLM Integration',
      '',
      '### 1. Deep Research Engine',
      '`aegis nlm:research "<topic>" [fast|deep]` initiates automated research inside Google NotebookLM, queries web and document sources, synthesizes architectural patterns, and stages the research note directly into GitHub Wiki.',
      '',
      '### 2. Device Bound Session Credentials (DBSC) Resolution',
      'Google enforces partitioned cookies between `notebook.google.com` (Origin Session ID `OSID`) and `.google.com`. Aegis injects origin-scoped cookies with `secure: true`, guaranteeing authenticated `pli=1` session access.'
    ].join('\n')
  },
  {
    slug: 'Quality-Shields-and-Gates',
    title: 'Deterministic Demir Kafes & Quality Shield Protocol',
    threeBullets: [
      'Demir Kafes constraints: Max 40 lines per function, max 300 lines per source file.',
      'Mutation Testing Gate requiring minimum 70% mutant kill score before commit approval.',
      'Immutable Oracle detecting test tampering and rejecting vacuous assertion gaming.'
    ],
    content: [
      '## 🛡️ Quality Shields & Pre-Commit Gates',
      '',
      '### 1. Deterministik Demir Kafes (Iron Cage)',
      '1. **File Length:** Maximum 300 lines per source file.',
      '2. **Function Length:** Maximum 40 lines per function.',
      '3. **Surgical Diff:** Full-file rewrites are rejected; unified surgical diffs only.',
      '',
      '### 2. Mutation Testing Gate',
      'Generates mutants (operator swaps, condition inversions). A commit is approved only if unit tests kill >= 70% of mutants.',
      '',
      '### 3. Zero-Token Telemetry UI Inspection',
      '`aegis inspect` performs deterministic geometric BoundingBox intersection checks across viewports (Mobile, Tablet, Desktop) without consuming LLM vision tokens.'
    ].join('\n')
  },
  {
    slug: 'Autonomous-Kanban-Protocol',
    title: 'GitHub Projects v2 & Autonomous Task Protocol',
    threeBullets: [
      'Real-time GraphQL integration with GitHub Projects v2 (Project 4: Aegis Autonomous Roadmap).',
      'Bi-directional status mapping: Todo (`ready`), In Progress (`in_progress`), Done (`done`).',
      'Anti-Stall Loop Breaker redirecting agents after 3 repeated failures and releasing locks.'
    ],
    content: [
      '## 📋 Autonomous Kanban & GitHub Projects v2 Protocol',
      '',
      '### 1. Live GitHub Projects v2 Sync',
      'Tasks created in the CLI or Web Dashboard immediately synchronize with GitHub Projects v2 via GraphQL mutations (`addProjectV2ItemById`, `updateProjectV2ItemFieldValue`).',
      '',
      '### 2. Task Lifecycle States',
      '1. **`ready`:** Unclaimed tasks in `Todo` column with defined acceptance criteria.',
      '2. **`in_progress`:** Claimed by an agent; target files locked via `lock:<filepath>`.',
      '3. **`review`:** TDD tests pass locally; ready for atomic merge.',
      '4. **`done`:** 4-step merge completed; closed on GitHub and moved to `Done` column.',
      '5. **`blocked`:** Loop breaker triggered; locks released, telemetry logged to GitHub Issue.'
    ].join('\n')
  }
];
