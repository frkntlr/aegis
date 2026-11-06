---
name: tw
description: >-
  Aegis Antigravity Teamwork autonomous orchestration command (/tw, /aegis tw).
  Use whenever the user invokes /tw, /aegis tw, /teamwork, tw:plan, tw:status, tw:compact,
  tw:waves, tw:peers, tw:radar, tw:doc, tw:clear, or requests multi-agent teamwork, subagent planning, DAG waves, or task staging.
---

# Aegis Antigravity Teamwork (/tw, /aegis tw)

This skill activates when the user triggers `/tw`, `/aegis tw`, `/aegis teamwork`, or requests multi-agent autonomous execution.

## Quick CLI Reference

| Command | Action | Execution | MCP Equivalent |
| :--- | :--- | :--- | :--- |
| `/tw` or `aegis tw` | View active Antigravity subagents and locked tracks | `aegis tw:status` | `teamwork_status` |
| `/tw "<objective>"` | Direct subagent planning & TIP staging (--compact, --json, --dry-run) | `aegis tw "<objective>"` | `teamwork_plan` |
| `/tw:plan "<objective>"` | Generate Antigravity subagent plan and stage in TIP inbox | `aegis tw:plan "<objective>"` | `teamwork_plan` |
| `/tw:waves [objective]` | Compute parallel execution waves & simultaneous dispatch | `aegis tw:waves [objective]` | `teamwork_waves` |
| `/tw:peers` | List active peer subagents, status, locks & modified files | `aegis tw:peers [--compact]` | `teamwork_peers` |
| `/tw:radar` or `/tw:conflicts`| Inspect Conflict Radar for active file collision warnings | `aegis tw:radar` | `teamwork_conflicts` |
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

## Flags
- `--compact` / `-c`: Generate 85%-95% token-saving compact wire format / mission briefing.
- `--json` / `-j`: Output machine-readable JSON for programmatic pipelines.
- `--dry-run`: Validate execution plan and AST bindings without acquiring mutex locks.
- `--max-agents=<n>` / `-n=<n>`: Hyper-scale dynamic concurrency (e.g. `--max-agents=8`, up to 12 parallel subagents with 100% disjoint locks).
- `--scale` / `-s`: Auto-scale solver & UI tracks across all discovered domain files in parallel Wave 1.

## Subagent Roles & Badges
- `issue-solver` -> `🛠️ [ISSUE SOLVER] AKTİF | İzole Çözücü ve Geliştirici`
- `qa-hunter` -> `🎯 [QA HUNTER] AKTİF | Teşhis, Oynanış ve Görsel UI Denetçisi`
- `ui-specialist` -> `🎨 [UI SPECIALIST] AKTİF | Arayüz, Tema ve Görsel Cilalama Uzmanı`
- `doc-architect` -> `📚 [DOC ARCHITECT] AKTİF | GitHub Dokümantasyon ve Proje Mimarı`

## Demir Kafes Invariants
- Max 300 lines per file.
- Max 40 lines per function.
- Strictly 0 `any`.
- 100% pre-commit test pass.
