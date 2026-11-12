# Codex compatibility

Aegis shares the CLI, stdio MCP tools, task inbox, locks, worktrees, memory engine,
Godot bridge and quality gates between Antigravity and Codex. Client-specific
instructions and dispatch payloads are separate so both clients keep working.

## Setup

From the engine checkout:

```powershell
npm run build
npm run aegis -- codex:setup
```

For another project, pass its path to `codex:setup "C:\path with spaces\project"`.
The engine checkout must remain available at its installed path. Re-run setup if
it moves. Open the target project in Codex and reload the MCP connection.

Setup writes `.codex/config.toml` with `mcp_servers.aegis`, an absolute Node/CLI
path, the required `mcp` argument and the target project's working directory.
It installs `.agents/skills/aegis/SKILL.md` and maintains an Aegis block in
`AGENTS.md`, retaining instructions outside that block. TOML merges preserve
unrelated settings and MCP servers semantically; serialization reformats comments.
Malformed existing TOML causes an error and is left untouched. Project-local MCP
configuration follows the client's project trust and managed policy settings.
Scalar, array and date values in a server entry being updated are also rejected.
Setup checks required instruction and skill templates before changing project
configuration. Switching between stdio and HTTP removes obsolete transport
fields, including the previous transport's credentials, and retains tool policy.

`ide:list` includes Codex. `ide:sync` uses native TOML for Codex rather than the
JSON formats used by the other adapters. `codex:setup` configures only Codex.

## Skill selection and command arguments

Use `$aegis` or `/skills` to select the skill. Plain `aegis tw <objective>` and
`aegist tw <objective>` also route through the skill. With an objective, `tw`
plans and executes native agents; `tw status` inspects work. Planning-only
requests and `--dry-run` do not authorize execution.

Skills do not register bare `/aegis` or `/aegist` menu commands, nor nested
completion after `aegis `. To install optional legacy slash-menu shortcuts:

```powershell
node scripts/install-codex-commands.cjs
```

This explicitly installs the user skill and `/prompts:aegis` /
`/prompts:aegist` prompts, preserving changed previous files as backups.
It also maintains a narrow Aegis routing block in the user `AGENTS.md`, keeping
unrelated instructions intact. This makes plain submitted `aegis tw ...`
requests discoverable outside projects that have run `codex:setup`.
The installer reads every template and validates managed-block markers before
writing destinations. Repeated identical installs are no-ops; replacements have
unique backups. Invalid or duplicate managed blocks fail with a repair message.
Managed environments may protect `~/.agents` and `~/.codex`; run the installer
from a terminal with write access to those locations if installation is denied.
Reload Codex after installing. Example: `/prompts:aegis tw <objective>`.
Custom prompts are deprecated and client-dependent; `$aegis` remains the
supported skill invocation. Project `codex:setup` installs the skill without
changing global prompts. Neither installer changes the Codex application UI.

## Tool mapping

| Antigravity | Codex |
| --- | --- |
| GEMINI.md | AGENTS.md |
| Plugin skill directory | .agents/skills/aegis |
| mcp_config.json / mcpServers | .codex/config.toml / mcp_servers |
| run_command | Available terminal execution tool |
| define_subagent + invoke_subagent | Available native spawn tool and its actual schema |
| Model: flash / inherit | Inherit the current Codex model |
| ask_question modal | Available question tool or ordinary conversation |
| Visual inspection tool | Available image viewer and Godot CLI evidence |

## Teamwork

For persistent, capacity-aware execution and child requests relayed through the
root coordinator, see [Codex orchestra](codex-orchestra.md). A logical task tree
works even when a child session has no native spawn tool; the root dispatches
its children and resumes their parent after verified results.

Planning returns the original `invocationPayload` for Antigravity and an additive
`codexInvocationPayload` for Codex. Use the latter's `message` with the host's
spawn schema; `task_name` and `fork_turns` describe the current desktop host and
may need adaptation in other Codex clients. The plan only stages work: it does
not launch agents. Honor dependencies, file locks and host concurrency limits.
The inbox retains the Codex payload for staged consumers.
Use project-local CLI task state when the connected MCP server targets another
project. Claim and release the actual numeric inbox ID. Role names can be shared
by several tracks, so releasing one task must preserve sibling task locks.

The Antigravity prompt intentionally keeps its existing model and recursive
dispatch instructions. The Codex message uses native tools, inherits the model
and makes recursion conditional on available capacity. Do not send the
Antigravity payload or its Prompt to the Codex spawn tool.

## Remaining compatibility checks

Codex track messages preserve the complete user objective in a `Mission:` line,
even when decomposition gives a track a narrower objective. Orchestra identifiers
accept Unicode letters, numbers and combining marks, including Turkish track
names, while rejecting path separators and traversal. Native messages require
the exact numeric inbox ID from the coordinator, explicit writable file scope,
and project-local state. Empty file scope is read-only; expanding it requires
the coordinator's assignment.

CLI and MCP planning save full plans under
`.aegis/teamwork-plans/<planId>.json` in the active project. CLI `--dry-run`
does not save or stage a plan. MCP `teamwork_batch` with `planId` loads that
exact saved plan; missing or invalid IDs return an error instead of generating
unrelated work. Without `planId`, its `objective` argument previews new batches.
For `teamwork_waves` and `teamwork_batch`, set `client: "codex"` to receive
tracks with `codexInvocationPayload` and without Antigravity prompts/payloads.
The default retains Antigravity output. `tw_*` and `tr_*` aliases behave alike.

NotebookLM authentication failure in a noninteractive host requires an explicit
choice: reauthenticate, continue local-only, or cancel. Failed reauthentication
and invalid choices report errors; local-only fallback is an explicit choice.
The NotebookLM command reports a failing exit status when authentication fails.
Godot UI inspection also fails when runtime telemetry has no usable nodes,
so an empty capture cannot count as successful UI verification.

Regression checks cover these contracts with disposable state and mocked
authentication/runtime inputs. Final monorepo validation evidence is recorded
separately after the release checks finish. Live NotebookLM authentication and
Godot runtime/playtest behavior require their external services and have not
been established by those isolated tests.

## Limits and validation

Antigravity's window layout, agent registration UI, modal widgets, named model
tiers and unrestricted recursive swarm size have no identical Codex interface.
Their task semantics are mapped; visual and client behavior are not identical.
`experimental/**` isolation is an instruction in Codex, not a filesystem access
restriction. No approval/sandbox policy is disabled by setup.

Verify with the integration tests, monorepo build/typecheck/tests, and a real
stdio `initialize` / `tools/list` / `lock_status` exchange against the configured
command (`node scripts/verify-codex-mcp.cjs [projectDir]`).
The verifier checks sequential JSON-RPC replies, required tools and the shape of
the returned lock snapshot. Missing tools, malformed responses, premature exits,
spawn errors and a 15-second deadline fail the check. It reports elapsed time
for this handshake, not a full workload benchmark.

`npm test` runs the installer and MCP-verifier script tests before workspace
tests. Turbo test inputs include Codex templates and those scripts so changing
them invalidates affected cached test results. For a fresh release check use
`npm test -- --force`. See [release validation](codex-release-validation.md) for
the measured scope and remaining external prerequisites.
NotebookLM authentication and Godot runtime availability remain prerequisites
for those integrations; installing an MCP entry does not authenticate them.

Official references:
- https://learn.chatgpt.com/docs/config-file/config-reference
- https://learn.chatgpt.com/docs/build-skills
