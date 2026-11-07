# RFC-047: Ironclad Zero-Sequential Lead Mandate and Hierarchical Recursive Subagent Swarms

- **Status**: Accepted
- **Author**: Aegis Teamwork Architecture Group
- **Created**: 2026-11-07
- **Target Release**: Aegis v0.1.0

## Executive Summary

RFC-047 establishes an ironclad architectural prohibition preventing the Team Lead agent from ever executing tasks or code changes sequentially in the main chat thread when multi-agent teamwork (`/tw`, `/aegis tw`) is invoked. It also activates hierarchical recursive subagent tools (`EnableSubagentTools: true`) so that specialized subagents (such as `qa-hunter` or `issue-solver`) can autonomously spawn up to 4 child subagents under themselves, while `TaskComplexityAnalyzer` autonomously sizes the swarm from 1 to 12 agents without requiring manual developer flags.

## Problem Statement

In previous iterations, when a developer invoked `/aegis tw <objective>`, the Lead AI assistant frequently regressed into single-threaded sequential tool execution (`read_file`, `edit_file`, `write_file`) in the primary conversation thread. This caused:
1. **Zero UI Visual Concurrency**: In the Antigravity user interface, only one single thread was visible doing tasks sequentially.
2. **Context Loss & Lack of True Multi-Agent Parallelism**: Specialized roles (`ui-specialist`, `qa-hunter`, `issue-solver`) were bypassed rather than running concurrently in parallel child sessions.
3. **Absence of Hierarchical Delegation**: Subagents lacked the capability to spawn child subagents (e.g., `qa-hunter` needing concurrent playtest, UI sweep, AST audit, and mutation tests).

## Architectural Invariants & Solution

### 1. Ironclad Zero-Sequential Lead Mandate
Under no circumstances may the Team Lead agent edit source files or perform implementation directly in the primary conversation thread when `/tw` or `/aegis tw` is called:
- **Turn 1**: Lead agent calls `teamwork plan`, prints the initial Live Task Matrix, and calls `invoke_subagent` for all Wave 1 tracks SIMULTANEOUSLY in the same turn.
- **Turn 1 End**: Lead agent calls no further tools and yields execution, allowing Antigravity to spin up parallel subagent sessions immediately.

### 2. Hierarchical Subagent Recursion
- Subagent definitions (`define_subagent`) explicitly grant `EnableSubagentTools: true`, `EnableWriteTools: true`, and `EnableMCPTools: true`.
- Subagents receiving multi-faceted objectives are authorized to invoke up to 4 child subagents under themselves to audit or scaffold subcomponents concurrently.

### 3. Bilingual Autonomous Complexity Sizing
- `TaskComplexityAnalyzer` includes bilingual (TR/EN) keyword detection for multi-agent, swarm, analysis, and architecture concepts.
- Tasks are autonomously classified into `TRIVIAL` (1 agent), `MODERATE` (2 agents), `COMPLEX` (4 agents), or `HYPER_SCALE` (8-12 agents) with 100% disjoint file locks and zero developer overhead.
