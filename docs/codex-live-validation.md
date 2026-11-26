# Codex live integration and quality gate validation

## Recheck: 2026-11-12

Run `e770caf0-1713-42ab-9d86-08717f028a45` retried the live checks.
NotebookLM again failed with network `EACCES` before an HTTP response; no query
or fallback was substituted. Its track failed, and dependent combined acceptance
tracks remain blocked. This does not invalidate the separately measured local
Godot and quality results below.

Real Godot 4.7.2 connected in 1,168 ms. Ping took 5.83 ms, UI capture 7.16 ms,
and the valid three-action scenario 19.96 ms. The deliberately invalid text
assertion correctly returned both inner and outer failure in 6.8 ms. The
script-error scene exited zero but was rejected by the runner; actual task
verification returned zero for a valid runtime and one for the invalid runtime.
The real bridge regression passed without skipping. These are isolated
headless fixture results, not production-game or rendered-screen validation.

Build, typecheck, lint, the uncached 549/549-file Iron Cage audit and real MCP
handshake passed (307 ms). Ten targeted gate/runner tests and individual checks
of both changed GDScript files passed. Timestamped evidence is stored under
`.aegis/codex-orchestra/*2026-11-12.json`.

The generated plan also exposed an alias collision between solver and QA
tracks sharing a section name. Execution used explicit upstream task IDs;
the resolver now prefers earlier phases and excludes the current task when
expanding aliases, preserving exact IDs and same-phase peer aliases.
The original generated plan was then validated in a disposable project:
two solver tasks dispatch and both QA tasks depend only on those upstream
solvers. Eighteen orchestra tests and both affected file quality gates passed.
Final forced monorepo validation passed 1,078 tests, 28 Turbo tasks, no cached
tasks, in 38.28 seconds; final build, typecheck, lint and diff checks passed.

Date: 2026-11-11. Run: `c1426ef4-d2eb-4f9a-a118-a7cee619aa31`.
Native workers performed the initial checks. They reached a usage limit during
implementation; the root completed their changes and subsequent checks
sequentially. Prior working-tree changes were preserved. No publication occurred.

## NotebookLM: remote validation blocked

Existing project credentials contain the expected session fields. A real,
read-only `NotebookLmNativeClient.listSources` request was attempted against the
configured notebook, without Oracle or local fallback. Fetch failed with
`EACCES` before any HTTP response. Authentication validity and live query
responses therefore remain unverified. This transport error does not establish
that credentials expired; no reauthentication was attempted. No credentials
were printed and no remote data was changed.

Evidence: `.aegis/codex-orchestra/live-notebooklm-evidence.json`.
Completion requires execution in an environment that permits NotebookLM network
access. If that later returns an authentication rejection, explicitly choose
reauthentication, local-only continuation, or cancellation.

## Godot: real headless integration verified

Godot `4.7.2.stable.official.ed1daf0bf` ran an isolated project with the actual
Aegis GDScript addon and authenticated local WebSocket bridge. Ping, UI-tree
capture and a successful synthetic assertion scenario passed. A deliberately
wrong text assertion now returns outer `success:false`, matching its inner
scenario result. Telemetry reports the actual runtime viewport rather than
hardcoded aspect dimensions. Headless Godot used a 64x64 viewport on this host;
configured design dimensions are not evidence of the actual viewport size.

A separate real scene generated `SCRIPT ERROR` and then exited zero. The
playtest runner now returns `passed:false` for that case. Through the actual
`verify:task` CLI, a successful runtime exits zero and that failing runtime
exits one. WebSocket resets on process shutdown are handled without crashing
the coordinator.

Evidence under `.aegis/codex-orchestra/`:

- `live-godot-fixture/evidence.json`: real bridge requests and responses.
- `live-godot-fixture/failure-evidence.json`: script error despite runtime exit zero.
- `live-task-gate-evidence.json`: actual CLI positive and negative runtime checks.

This verifies an isolated fixture, not a user's production game or rendered
screenshots. Godot reported a root certificate-store warning; local bridge and
runtime checks still passed. TLS-dependent Godot features were not validated.
The older `godot playtest` CLI queue message alone is not execution evidence;
these checks used the real bridge and `GodotTestRunner`.

## Demir Kafes and regression checks

The uncached TypeScript audit accepted 549/549 source files. Deliberately
oversized files/functions and explicit `any` were rejected. Missing and empty
audit targets now fail instead of reporting a clean audit with zero files.
The changed GDScript files passed individual quality gates; the UI traversal's
complexity violation was removed by extracting its metadata collection.

`verify:task` now awaits an actual Godot playtest when `project.godot` exists in
the working directory, propagates runtime failures, and explicitly reports
runtime checks as not applicable in other projects. It no longer claims that
UI aspect ratios were checked merely because a Godot binary was found.

Build, typecheck and lint passed. The forced monorepo run passed 1,076 tests
with 28 successful Turbo tasks, zero cached tasks, in 33.108 seconds. The real
Godot bridge test also passed again after the final GDScript extraction.
The stdio MCP initialize/tools/list/lock_status check passed in 283 ms.

Reproduce local checks with `npm run build`, `npm run typecheck`,
`npm run lint`, `npm test -- --force`, and
`node scripts/verify-codex-mcp.cjs`. The real bridge regression runs when an
installed Godot runtime is available; otherwise its skip reason is explicit.
