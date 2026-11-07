# RFC-048: Multi-Agent Concurrency Safety, Deterministic Wave Progression, and Atomic Mesh Blackboard

- **Status**: Accepted
- **Author**: Aegis Teamwork Architecture Group
- **Created**: 2026-11-07
- **Target Release**: Aegis v0.1.0

## Executive Summary

RFC-048 resolves critical concurrency bottlenecks, race conditions, and state synchronization gaps discovered in multi-agent swarm environments. It guarantees:
1. **Zero Task Mis-Claiming**: Subagent prompts bind directly to exact subagent instance identities (`aegis task:pull "<roleIdentity>"`), preventing sibling solvers from claiming each other's tasks.
2. **Deterministic Wave Progression**: `TeamworkPeerState` explicitly tracks `phase?: number`, decoupling wave progression from fragile natural language activity strings and ensuring reliable Wave 1 -> Wave 2 transitions.
3. **Atomic Mesh & Inbox State Preservation**: `TeamworkAnalysisMesh` and `task-inbox.ts` utilize atomic read-modify-write cycles and temporary-file renames with Windows fallback to prevent state loss across concurrent processes.
4. **Automatic Task Release Notification**: `handleTaskRelease` directly updates `TeamworkMesh`, closing the feedback loop between task status and peer coordination.

## Problem Analysis

Under hyper-scale multi-agent execution (4-12 concurrent subagents), four failure modes were identified:
1. **Generic Role Pull Ambiguity**: When multiple `issue-solver` agents ran in Wave 1, prompts instructed `task:pull solver`. If both called it simultaneously, race conditions occurred where an agent pulled a task for an un-locked module.
2. **Fragile Wave Progression**: `TeamworkMesh.checkWaveProgression()` filtered agents by `p.currentActivity.includes('Wave ' + wave)`. When subagents posted realistic updates (e.g., `"Refactoring AST"`), the string `"Wave 1"` was replaced, causing wave progression to stall.
3. **State Loss in Analysis Mesh**: `TeamworkAnalysisMesh` maintained an in-memory state and overwrote `.aegis/analysis-mesh.json` on save, causing concurrent subagent insights to overwrite each other.
4. **Inbox Partial-Write Hazards**: Raw `fs.writeFileSync` in `task-inbox.ts` risked truncation or collision under concurrent access.

## Implementation Details

### 1. Specific Track Pulling
Subagent prompts compiled via `compileTrackPrompt` now specify `aegis task:pull "${roleIdentity}"` (e.g. `aegis task:pull "issue-solver [Core-ast-skelet]"`). `matchesTaskRole` matches exact track IDs first, guaranteeing disjoint task claims.

### 2. Peer Phase Contract
`TeamworkPeerState` includes `phase?: number`. When all peers matching `p.phase === activeWave` report status `done`, `checkWaveProgression` increments `activeWave` and emits `WAVE_COMPLETED` milestone.

### 3. Atomic File Writes
`writeTaskInbox` and `TeamworkAnalysisMesh.saveState` write to `${file}.tmp.${pid}.${timestamp}`, rename to destination, and fall back to `copyFileSync` with safe cleanup.

### 4. Automatic Mesh Bridge
`handleTaskRelease` invokes `TeamworkMesh.postActivity` with status and issue number upon task completion, ensuring real-time mesh synchronization.
