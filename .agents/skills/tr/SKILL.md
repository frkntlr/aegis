---
name: tr
description: >-
  Aegis Antigravity Teamwork autonomous orchestration command (/tr, /tw, /aegis tr).
  Use whenever the user invokes /tr, /tw, /aegis tr, /aegis tw, /teamwork, tr:plan, tr:status,
  tr:waves, tr:peers, tr:radar, tr:doc, tr:clear, tr:push, or requests multi-agent teamwork.
---

# Aegis Antigravity Teamwork (/tr, /tw, /aegis tr)

This skill activates when the user triggers `/tr`, `/tw`, `/aegis tr`, `/aegis tw`, `/aegis teamwork`, or requests multi-agent autonomous execution.
`tr` is a universal first-class alias for `tw` and `teamwork` with 100% feature parity.

## Antigravity Team Lead Autonomous Protocol
Whenever the user triggers `/tr` or `/tw` or requests multi-agent teamwork:
1. **Immediate Lead Action**: Adopt the Team Lead role. Do not just print text or run tasks as a single agent.
2. **Plan & Stage**: Run `aegis tr "<objective>"` or `aegis tw "<objective>"`.
3. **Print Live Task Matrix**: Display the running subagent tracks, locked files, and models.
4. **Define & Concurrently Invoke Subagents**:
   - Register roles via `define_subagent` (`issue-solver`, `qa-hunter`, `ui-specialist`, `doc-architect`).
   - Concurrently call `invoke_subagent` for each active track using `Workspace: 'share'` and hybrid models.
5. **Monitor & Wave Advancement**: Subagents execute in parallel, update via Dynamic Teamwork Mesh (`aegis tr:post`, `aegis tr:peers`), and report back with `[ROLE_COMPLETE: <role>]`.
6. **Consolidation, Quality Gates & Push**: Once all tracks complete, verify via `cage:check` + monorepo tests, and autonomously publish to origin via `aegis tr:push`.

## Quick CLI Reference

| Command | Action | Execution | MCP Equivalent |
| :--- | :--- | :--- | :--- |
| `/tr` or `aegis tr` | View active Antigravity subagents and locked tracks | `aegis tr:status` | `teamwork_status` |
| `/tr "<objective>"` | Direct subagent planning & TIP staging (--compact, --json, --dry-run) | `aegis tr "<objective>"` | `teamwork_plan` |
| `/tr:plan "<objective>"` | Generate Antigravity subagent plan and stage in TIP inbox | `aegis tr:plan "<objective>"` | `teamwork_plan` |
| `/tr:waves [objective]` | Compute parallel execution waves & simultaneous dispatch | `aegis tr:waves [objective]` | `teamwork_waves` |
| `/tr:peers` | List active peer subagents, status, locks & modified files | `aegis tr:peers [--compact]` | `teamwork_peers` |
| `/tr:radar` or `/tr:conflicts`| Inspect Conflict Radar for active file collision warnings | `aegis tr:radar` | `teamwork_conflicts` |
| `/tr:doc [planId]` | Synthesize living architecture briefing, Mermaid DAG & metrics | `aegis tr:doc [planId]` | `teamwork_doc_synthesize` |
| `/tr:mesh [clear]` | Read, inspect or clear dynamic real-time teamwork mesh state | `aegis tr:mesh [clear]` | `teamwork_mesh_read` |
| `/tr:post "<activity>"` | Post subagent status, touched files or contracts to mesh | `aegis tr:post "<activity>"` | `teamwork_mesh_post` |
| `/tr:broadcast "<msg>"` | Broadcast milestone or event to peer subagents across mesh | `aegis tr:broadcast "<msg>"` | `teamwork_broadcast` |
| `/tr:advance [planId]` | Smoothly advance active wave to next execution phase | `aegis tr:advance [planId]` | - |
| `/tr:scale "<obj>"` | Micro-sharded hyper-scale concurrency plan (100% disjoint locks) | `aegis tr:scale "<obj>"` | `teamwork_scale` |
| `/tr:batch [planId]` | Group tracks into parallel execution batches ready for dispatch | `aegis tr:batch [planId]` | - |
| `/tr:compact [obj]` | Compact logs & archive completed tasks with 85% token savings | `aegis tr:compact` | `teamwork_compact` |
| `/tr:clear` | Safely clear TIP inbox and release active mutex locks | `aegis tr:clear` | - |
| `/tr:status` | Inspect staged tracks count, locked files, and agent specs | `aegis tr:status` | `teamwork_status` |
| `/tr:dag [objective]` | Display ASCII Execution Waves dependency graph | `aegis tr:dag` | `teamwork_dag` |
| `/tr:matrix [planId]` | Display live Antigravity subagent task status matrix | `aegis tr:matrix` | - |
| `/tr:analyze "<obj>"` | Sub-10ms fast semantic codebase analysis and file discovery | `aegis tr:analyze "<obj>"` | `teamwork_analyze` |
| `/tr:setup [dir]` | Export subagents manifest (.aegis/subagents.json) | `aegis tr:setup` | - |
| `/tr:push` or `/aegis tr:push` | Autonomous Demir Kafes pre-push gate, staging, commit & remote push | `aegis push` | `teamwork_push` |

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
