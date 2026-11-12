# Codex orchestra validation

Validated on Windows with Node.js 25.5.0, 2026-11-11.

## Automated checks

- 19 focused orchestra tests pass: core lifecycle, independent adversarial
  review and CLI integration. Coverage includes concurrent-process reservations,
  restart recovery, corrupt state, scope escape, directory targets, cycles,
  forward-phase dependencies, cancellation, child failure and parent resumption.
- The full forced suite passes 1,059 tests with 28 successful Turbo tasks and
  zero cached tasks. The measured full run took 37.639 seconds.
- Build, typecheck, lint and the full Iron Cage audit pass. Real stdio MCP
  initialize, tools/list and lock_status pass; measured handshake: 296 ms.
- The full suite leaves the actual shared inbox and lock files byte-for-byte
  unchanged. Orchestra control records are separate from the staged inbox.

## Native-agent exercise

The root coordinator used actual Codex follow-up tools to reuse three native
workers. It dispatched the engine's returned payloads, acknowledged actual
agent identities and checked native results before recording completion.

The exercised logical tree contains eight tasks:

```text
root
├── lead
│   ├── logic
│   │   ├── leaf_a
│   │   └── leaf_b
│   └── child_review (depends on logic)
├── peer_one
├── peer_two
└── final_review (phase 2, depends on lead and both peers)
```

The lead submitted a real CLI child request and returned its turn. The logic
child submitted another real request, producing depth-two grandchildren. The
root ran the leaves, resumed logic for evidence review, ran the independent
child review and resumed the original lead before the final dependent review.
Arithmetic checks supplied independently verifiable results: 899, 1517, 221
and 437. This is an orchestration proof, not an application correctness test.

The persisted run ID is `4d8c6153-d2ea-4a87-8bc1-87358cc2d900` on the validation
machine, under `.aegis/codex-orchestra/`. It records the real native worker IDs
and evidence. Physical workers are root-managed siblings that can be reused;
the parent/child relationships are logical task relationships. This exercise
does not claim that this host exposes native spawn tools to child sessions.

## Queue scale

An isolated 1,000-task read-only plan with a worker limit of three reserved
exactly three tasks; a repeated dispatch reserved zero duplicates. Creating the
run took 7 ms and the first dispatch 36 ms on this machine. These measurements
cover queue creation and first-batch scheduling, not model latency or sustained
throughput. Host capacity remains authoritative regardless of queue size.

## Reproduction

```powershell
npm run build
npm run typecheck
npm run lint
npm test -- --force
node scripts/verify-codex-mcp.cjs
```

For native execution, follow the [orchestra loop](codex-orchestra.md). Its
native calls require the current host's tools; the CLI alone schedules work.
