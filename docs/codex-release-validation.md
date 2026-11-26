# Codex compatibility release validation

Validation environment: Windows, Node.js 25.5.0, 2026-11-11.

## Confirmed checks

- Fresh orchestrator build and 12 focused tests passed across Codex integration,
  IDE adapters and MCP synchronization. Eight are Codex integration tests.
- Integration coverage includes preserving user rules and tool policy,
  idempotent setup, malformed TOML/server entries, incomplete-template rejection,
  stdio/HTTP migration, external-project engine resolution, invocation metadata
  installation and distinct native Codex/Antigravity dispatch payloads.
- `aegis verify:task` passed for Codex configuration, project installer and
  integration tests. The user installer has separate regression tests for
  backups, repeat installs, custom rules, explicit home selection, malformed
  managed markers and missing templates.
- The actual configured stdio command completed `initialize`, `tools/list` and
  `lock_status`; the verifier validates required tools and lock-result structure.
  Its regression suite exercises malformed/out-of-order replies, missing tools,
  invalid lock results and disabled-server rejection.
- Five measured MCP handshakes took 296–328 ms, median 314 ms. This is startup
  plus a short local protocol exchange on this machine, not a general latency
  guarantee or an agent-task throughput measurement.
- Five stateful CLI suites now use temporary workspaces for GitHub teamwork,
  mesh, analysis swarm, deliberation and reports. Their 25 tests passed, with
  the live inbox, lock file and analysis-mesh hashes unchanged before/after.
- Final forced monorepo run: 1,040 tests passed, 28 Turbo tasks successful,
  zero cached tasks, 33.273 seconds. Build, typecheck, lint and the full Iron Cage
  audit passed. CLI and orchestrator test workers now receive disposable state;
  the final run left the live inbox and lock files byte-for-byte unchanged.
- Dashboard analysis honors the explicitly selected project, including memory
  hot-patching. A two-project regression proves isolation, and repeated memory
  requests reuse their index. All 36 dashboard tests passed. Memory is cached
  for the server session; a restart requires a fresh index.
- Fetch failures now fail GitHub push checks; dry-run cannot commit changes.
  Hermetic routing tests validate push aliases without contacting GitHub.

## Reproduction

For the subsequent real Godot bridge, runtime failure propagation and quality
gate checks, see [live validation](codex-live-validation.md). NotebookLM remote
validation was attempted but blocked by network `EACCES` before an HTTP response.

### Remaining compatibility audit, 2026-11-11

Native Codex run `178dabd3-25d1-4a60-84d6-9be43da3f381` used three
workers with implementation, independent QA and local documentation phases.
This pass added Unicode task-ID persistence, complete mission context in native
payloads, exact saved-plan batch lookup, Codex-specific MCP wave/batch output,
explicit authentication choices and nonzero NotebookLM query failure status,
and rejection of empty Godot telemetry as verification evidence.

Final build and typecheck passed. Lint checked 546 files. The forced monorepo
test run passed 1,070 tests with 28 successful Turbo tasks and no cached tasks
in 35.053 seconds. The actual MCP initialize/tools/list/lock_status exchange
passed in 281 ms. Focused quality gates passed for the affected implementations
and tests. These checks use local fixtures and mocked integration failures;
live NotebookLM authentication and Godot runtime/playtests remain unverified.

```powershell
npm run build
npm run typecheck
npm test -- --force
node scripts/verify-codex-mcp.cjs
```

The root test command runs script tests before workspace tests. Turbo inputs
include Codex templates and installer/verifier scripts. Forced tests bypass
cached workspace results; a timeout or signal termination must fail the test
runner rather than become a successful exit through a fallback zero.

## Scope and delivery status

This evidence covers local setup, configuration, command routing, task-state
contracts and MCP smoke checks. Native teamwork was used for implementation,
independent QA and documentation under the host's capacity and file locks.
Composer autocomplete and nested slash menus are not installed by a skill.

Godot runtime/playtest behavior requires a project and working runtime bridge;
NotebookLM requires authentication. These checks do not establish that every
external integration or arbitrary production workload is fault-free.

GitHub fetch was blocked by this session's network access during validation.
Publication must be confirmed separately; passing local checks do not establish
that a commit reached GitHub.
