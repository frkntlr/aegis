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
| `/aegis dashboard [port]` | Launch Aegis Web Command Center | `npm run aegis -- dashboard [port]` (with IsDaemon: true) |
| `/aegis cage:check [dir]` | Audit codebase against Deterministik Demir Kafes | `npm run aegis -- cage:check [dir]` |
| `/aegis skeleton:scan [dir]` | Compute global AST skeleton map & token savings | `npm run aegis -- skeleton:scan [dir]` |
| `/aegis skeleton <file>` | Generate AST skeleton for TS, Python, or GDScript | `npm run aegis -- skeleton <file>` |
| `/aegis verify <file>` | Validate single file against Demir Kafes | `npm run aegis -- verify <file>` |
| `/aegis gh:status [token]` | Inspect live GitHub API auth & rate limits | `npm run aegis -- gh:status [token]` |
| `/aegis gh:sync [token]` | Download live GitHub issues & dispatch to agents | `npm run aegis -- gh:sync [token]` |
| `/aegis inspect` | Zero-token bounding box layout inspection | `npm run aegis -- inspect` |
| `/aegis mutate <file>` | Run mutation testing gate | `npm run aegis -- mutate <file>` |
| `/aegis estimate <files> <tests>` | Pre-execution adaptive timeout estimation | `npm run aegis -- estimate <files> <tests>` |

## Core Principles
1. **Iron Cage Enforcement**: Maximum 300 lines per file, maximum 40 lines per function.
2. **Conflict-Free Isolation**: Multi-agent tasks run in dedicated worktrees (`experimental/solver`, `experimental/qa`, `experimental/docs`).
3. **Immutable Verification**: Pre-commit quality gate strictly enforces that zero commits can land without 100% test pass.
