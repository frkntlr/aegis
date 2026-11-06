---
name: tw
description: >-
  Aegis Antigravity Teamwork autonomous orchestration command (/tw, /aegis tw).
  Use whenever the user invokes /tw, /aegis tw, /teamwork, tw:plan, tw:status, tw:compact,
  tw:waves, tw:peers, tw:radar, tw:tools, tw:doc, tw:clear, or requests multi-agent teamwork, subagent planning, DAG waves, or task staging.
---

# Aegis Antigravity Teamwork (/tw, /aegis tw)

This skill activates when the user triggers `/tw`, `/aegis tw`, `/aegis teamwork`, or requests multi-agent autonomous execution.
`tw` is the canonical primary skill for orchestrating Antigravity subagents (`issue-solver`, `qa-hunter`, `ui-specialist`, `doc-architect`) with intelligent Aegis tool dispatch.

## Antigravity Team Lead Autonomous Protocol
Whenever the user triggers `/tw` or requests multi-agent teamwork:
1. **Immediate Lead Action**: Adopt the Team Lead role. Never execute sequentially as a single agent.
2. **Plan & Stage**: Run `aegis tw "<objective>"` or call MCP `teamwork_plan`.
3. **Print Live Task Matrix**: Display running subagent tracks, locked files, and assigned Aegis tools.
4. **Define & Concurrently Invoke Subagents**:
   - Register roles via `define_subagent` (`issue-solver`, `qa-hunter`, `ui-specialist`, `doc-architect`).
   - Concurrently call `invoke_subagent` for each active track using `Workspace: 'share'` and hybrid models.
5. **Intelligent Aegis Tool Orchestration**:
   - Subagents execute with role-tailored Aegis tools (AST search, Socratic diagnostics, Iron Cage, Godot bridge, living wiki).
   - Subagents communicate in real-time via Dynamic Mesh (`aegis tw:post`, `aegis tw:peers`) and report completion back to Team Lead with `[ROLE_COMPLETE: <role>]`.
6. **Consolidation, Quality Gates & Push**: Once all tracks complete, verify via `cage:check` + monorepo tests, and autonomously publish to origin via `aegis tw:push`.

## Quick CLI Reference

| Command | Action | Execution | MCP Equivalent |
| :--- | :--- | :--- | :--- |
| `/tw` or `aegis tw` | View active Antigravity subagents and locked tracks | `aegis tw:status` | `teamwork_status` |
| `/tw "<objective>"` | Direct subagent planning & TIP staging (--compact, --json, --dry-run) | `aegis tw "<objective>"` | `teamwork_plan` |
| `/tw:plan "<objective>"` | Generate Antigravity subagent plan and stage in TIP inbox | `aegis tw:plan "<objective>"` | `teamwork_plan` |
| `/tw:waves [objective]` | Compute parallel execution waves & simultaneous dispatch | `aegis tw:waves [objective]` | `teamwork_waves` |
| `/tw:peers` | List active peer subagents, status, locks & modified files | `aegis tw:peers [--compact]` | `teamwork_peers` |
| `/tw:radar` or `/tw:conflicts`| Inspect Conflict Radar for active file collision warnings | `aegis tw:radar` | `teamwork_conflicts` |
| `/tw:tools [role]` | Inspect assigned intelligent Aegis tools per subagent role | `aegis tw:tools [role]` | `teamwork_tools` |
| `/tw:doc [planId]` | Synthesize living architecture briefing, Mermaid DAG & metrics | `aegis tw:doc [planId]` | `teamwork_doc_synthesize` |
| `/tw:mesh [clear]` | Read, inspect or clear dynamic real-time teamwork mesh state | `aegis tw:mesh [clear]` | `teamwork_mesh_read` |
| `/tw:post "<activity>"` | Post subagent status, touched files or contracts to mesh | `aegis tw:post "<activity>"` | `teamwork_mesh_post` |
| `/tw:broadcast "<msg>"` | Broadcast milestone or event to peer subagents across mesh | `aegis tw:broadcast "<msg>"` | `teamwork_broadcast` |
| `/tw:advance [planId]` | Smoothly advance active wave to next execution phase | `aegis tw:advance [planId]` | - |
| `/tw:scale "<obj>"` | Micro-sharded hyper-scale concurrency plan (100% disjoint locks) | `aegis tw:scale "<obj>"` | `teamwork_scale` |
| `/tw:batch [planId]` | Group tracks into parallel execution batches ready for dispatch | `aegis tw:batch [planId]` | - |
| `/tw:compact [obj]` | Compact logs & archive completed tasks with 85% token savings | `aegis tw:compact` | `teamwork_compact` |
| `/tw:clear` | Safely clear TIP inbox and release active mutex locks | `aegis tw:clear` | - |
| `/tw:status` | Inspect staged tracks count, locked files, and agent specs | `aegis tw:status` | `teamwork_status` |
| `/tw:dag [objective]` | Display ASCII Execution Waves dependency graph | `aegis tw:dag` | `teamwork_dag` |
| `/tw:matrix [planId]` | Display live Antigravity subagent task status matrix | `aegis tw:matrix` | - |
| `/tw:analyze "<obj>"` | Sub-10ms fast semantic codebase analysis and file discovery | `aegis tw:analyze "<obj>"` | `teamwork_analyze` |
| `/tw:setup [dir]` | Export subagents manifest (.aegis/subagents.json) | `aegis tw:setup` | - |
| `/tw:push` or `/aegis push` | Autonomous Demir Kafes pre-push gate, staging, commit & remote push | `aegis push` | `teamwork_push` |

## 🛠️ Subagent Intelligent Aegis Tool Arsenal
Subagents dispatched by `/tw` are equipped with role-specialized Aegis tools:

- `issue-solver` (`🛠️ [ISSUE SOLVER]`):
  - **Memory & Symbol Lookup**: `aegis find <symbol>` / MCP `memory_query` / `skeleton_extract`
  - **AST Structural Search**: `aegis ast:search "<pat>" [dir]` / MCP `ast_search`
  - **Structural Surgical Replace**: `aegis ast:replace "<pat>" "<rep>" <file>` / MCP `ast_replace`
  - **Relational Signal & Caller Trace**: `aegis trace <target>` / MCP `trace_relational`
  - **Official Docs Grounding**: `aegis context7:query <library> <topic>` / MCP `context7_query`
  - **Socratic Evidence Diagnostics**: `aegis debug "<error>"` / MCP `socratic_diagnose`

- `qa-hunter` (`🎯 [QA HUNTER]`):
  - **Evidence-Based Bug Triage**: `aegis triage [dir]` / MCP `triage`
  - **Demir Kafes Compliance Audit**: `aegis cage:check` / MCP `cage_check` (<300L, <40L/fn, 0 any)
  - **RTK Output Compression**: `aegis rtk:compress [file]` / MCP `rtk_compress`
  - **Multimodal Godot Playtest**: `aegis godot playtest` / MCP `aegis_godot_playtest` / `aegis_godot_validate`
  - **Layout & Visual Inspection**: `aegis godot inspect` / MCP `aegis_godot_inspect_ui`
  - **Test Suite Trust Verification**: `aegis mutate <file>` & `aegis audit <testFiles>`

- `ui-specialist` (`🎨 [UI SPECIALIST]`):
  - **Godot 4 UI Static Linter**: `aegis godot ui:lint <scene.tscn>`
  - **Multi-Aspect Ratio Inspector**: `aegis godot inspect` / MCP `aegis_godot_inspect_ui`
  - **Responsive UI Scaffolder**: `aegis godot ui:scaffold <type> <name>`
  - **Live Node & Signal Explorer**: MCP `aegis_godot_tree` and `aegis_godot_signals`

- `doc-architect` (`📚 [DOC ARCHITECT]`):
  - **Living Architecture Synthesis**: `aegis tw:doc [planId]` / MCP `teamwork_doc_synthesize`
  - **NotebookLM Grounding & Research**: `aegis nlm:query "<q>"` / `nlm:research` / MCP `notebook_query`
  - **Git Wiki Synchronization**: `aegis wiki:sync`
  - **RFC Lifecycle & Decomposition**: `aegis rfc:create` and `aegis rfc:decompose`

## Flags
- `--compact` / `-c`: Generate 85%-95% token-saving compact wire format / mission briefing.
- `--json` / `-j`: Output machine-readable JSON for programmatic pipelines.
- `--dry-run`: Validate execution plan and AST bindings without acquiring mutex locks.
- `--max-agents=<n>` / `-n=<n>`: Hyper-scale dynamic concurrency (e.g. `--max-agents=8`, up to 12 parallel subagents with 100% disjoint locks).
- `--scale` / `-s`: Auto-scale solver & UI tracks across all discovered domain files in parallel Wave 1.

## Demir Kafes Invariants
- Max 300 lines per file.
- Max 40 lines per function.
- Strictly 0 `any`.
- 100% pre-commit test pass.

## Autonomous Post-Verification Push Shield
When subagent tracks finish and pre-push quality gates (`cage:check` + monorepo tests) pass 100%, Team Lead autonomously publishes changes directly to origin:
1. Validates non-interactive git environment (`$env:GIT_TERMINAL_PROMPT = "0"`).
2. Verifies GitHub CLI authentication status (`gh auth status`).
3. Automatically stages remaining untracked/modified files and creates semantic commit.
4. Executes `npm run aegis -- push` or `git push origin master` with finite timeout (10s).
5. Never leaves completed and verified work unpushed as orphaned local commits.
