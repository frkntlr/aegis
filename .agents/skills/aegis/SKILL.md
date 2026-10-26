---
name: aegis
description: >-
  Autonomous Vibe Coding Engine command center and slash command (/aegis).
  Use this skill whenever the user invokes /aegis, /aegis auto, /aegis dashboard,
  /aegis status, /aegis skeleton, /aegis cage:check, or asks to manage autonomous
  worktrees (solver/qa/docs), dispatch tasks, run quality gates, or inspect UI telemetry.
---

# Aegis Autonomous Vibe Coding Engine (/aegis)

This skill activates whenever the user triggers the `/aegis` slash command or requests autonomous orchestration, worktree execution, or quality gate audits.

## Slash Command Mapping

When the user enters `/aegis` commands, immediately execute the corresponding CLI operation via `run_command` in the project root:

| Command | Action | Execution |
| :--- | :--- | :--- |
| `/aegis` or `/aegis status` | Inspect active worktrees & persistent locks | `npm run aegis -- status` |
| `/aegis auto` | Run autonomous task queue & dispatcher | `npm run aegis -- auto` |
| `/aegis merge <agent> [base]` | Multi-tier atomic merge (FF -> Rebase -> Merge Commit) | `npm run aegis -- merge <agent> [base]` |
| `/aegis branch:sync [agent|all]` | Safely synchronize worktree branches with master | `npm run aegis -- branch:sync [agent]` |
| `/aegis dashboard [port]` | Launch Aegis Web Command Center | `npm run aegis -- dashboard [port]` (with IsDaemon: true) |
| `/aegis cage:check [dir]` | Audit codebase against Deterministik Demir Kafes | `npm run aegis -- cage:check [dir]` |
| `/aegis skeleton:scan [dir]` | Compute global AST skeleton map & token savings | `npm run aegis -- skeleton:scan [dir]` |
| `/aegis skeleton <file>` | Generate AST skeleton for TS, Python, or GDScript | `npm run aegis -- skeleton <file>` |
| `/aegis verify <file>` | Validate single file against Demir Kafes | `npm run aegis -- verify <file>` |
| `/aegis gh:status [token]` | Inspect live GitHub API auth & rate limits | `npm run aegis -- gh:status [token]` |
| `/aegis gh:sync [token]` | Download live GitHub issues & dispatch to agents | `npm run aegis -- gh:sync [token]` |
| `/aegis rfc:create "<t>" [d]` | Create RFC blueprint, sync Wiki & publish Discussion | `npm run aegis -- rfc:create "<t>" [d]` |
| `/aegis rfc:decompose <id>` | Decompose RFC acceptance criteria into GitHub Issues | `npm run aegis -- rfc:decompose <id>` |
| `/aegis wiki:sync` | Auto-sync & push living memory directly to Wiki repo | `npm run aegis -- wiki:sync` |
| `/aegis nlm:query "<q>"` | Query ground-truth knowledge via NotebookLM | `npm run aegis -- nlm:query "<q>"` |
| `/aegis nlm:research "<t>"` | Deep architectural research & stage Wiki via NotebookLM | `npm run aegis -- nlm:research "<t>"` |
| `/aegis inspect` | Zero-token bounding box layout inspection | `npm run aegis -- inspect` |
| `/aegis mutate <file>` | Run mutation testing gate | `npm run aegis -- mutate <file>` |
| `/aegis estimate <files> <tests>` | Pre-execution adaptive timeout estimation | `npm run aegis -- estimate <files> <tests>` |
| `/aegis find <symbol>` | Fast AST symbol lookup & surgical slice | `npm run aegis -- find <symbol>` |
| `/aegis triage [dir]` | Evidence-Based Bug Triage (zero false alarms) | `npm run aegis -- triage [dir]` |
| `/aegis trace <target>` | Trace relational callers, signal listeners & scenes | `npm run aegis -- trace <target>` |
| `/aegis graph:scan [dir]` | Build cross-reference relational knowledge graph | `npm run aegis -- graph:scan [dir]` |
| `/aegis godot <subcmd>` | Godot Bridge: status, inspect, validate, query, run | `npm run aegis -- godot <subcmd>` |
| `/aegis diff <diff>` | Validate surgical unified diff compliance | `npm run aegis -- diff <diff>` |
| `/aegis audit <files>` | Run Immutable Oracle trust verification | `npm run aegis -- audit <files>` |
| `/aegis ast:search <pat> [dir]` | Structural AST search via ast-grep | `npm run aegis -- ast:search <pat> [dir]` |
| `/aegis ast:replace <p> <r> <f>` | Structural AST replacement via ast-grep | `npm run aegis -- ast:replace <p> <r> <f>` |
| `/aegis rtk:compress [file]` | Compress terminal/test output via RTK | `npm run aegis -- rtk:compress [file]` |
| `/aegis context7:query <l> <t>` | Query official library documentation | `npm run aegis -- context7:query <l> <t>` |
| `/aegis memory:query <sym>` | Query 5-Layer Codebase Memory (AST, Graph, Context7) | `npm run aegis -- memory:query <sym>` |
| `/aegis memory:stats [wt]` | Codebase Memory diagnostics and token savings | `npm run aegis -- memory:stats [wt]` |
| `/aegis memory:refresh [d]` | Incrementally refresh Codebase Memory cache | `npm run aegis -- memory:refresh [d]` |

## Core Principles
1. **Iron Cage Enforcement**: Maximum 300 lines per file, maximum 40 lines per function.
2. **Conflict-Free Isolation**: Multi-agent tasks run in dedicated worktrees (`experimental/solver`, `experimental/qa`, `experimental/docs`).
3. **Headless Git Safety**: `$env:GIT_TERMINAL_PROMPT=0` mandatory; git push requires prior auth verification and explicit permission.
4. **Strict Phase Boundaries**: Research (NotebookLM) -> Blueprint/Wiki -> Issue Breakdown -> Isolated Worktree Code. No premature implementation!
5. **Immutable Verification**: Pre-commit quality gate strictly enforces that zero commits can land without 100% test pass.
6. **Meta-Reflex Feedback**: Any engine improvement or toolchain feedback across projects is autonomously published upstream to `frkntlr/aegis` as an RFC & GitHub Discussion.
