---
name: aegis
description: Autonomous Vibe Coding Engine command center, multi-agent orchestration, Demir Kafes code quality verification, and codebase memory.
---

# Aegis Autonomous Vibe Coding Engine

This skill equips GitHub Copilot with Aegis orchestration and quality verification commands.

## Key Capabilities & CLI Commands
- `aegis status`: View active worktrees and persistent file mutex locks.
- `aegis cage:check [dir]`: Verify deterministic Iron Cage compliance (<300 lines/file, <40 lines/function, 0 any).
- `aegis verify <file>`: Validate a single source file against quality gates.
- `aegis find <symbol>`: Fast AST symbol lookup and precision surgical slice.
- `aegis memory:query <symbol>`: Query 5-layer codebase memory (AST, Graph, Context7).
- `aegis triage [dir]`: Evidence-based bug triage with zero false alarms.
- `aegis teamwork [status]`: Inspect active agent tracks and topological waves.
- `aegis lock:status`: Inspect active file mutex locks.

## Demir Kafes Standards
1. Max 300 lines per file.
2. Max 40 lines per function.
3. Surgical unified diffs only.
4. 100% test pass required before task release.
