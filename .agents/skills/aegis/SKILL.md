---
name: aegis
description: Run Aegis commands and native Codex teamwork when the user mentions aegis, aegist, $aegis, aegis tw, or requests Aegis orchestration, memory, Godot checks or quality gates.
---

# Aegis for Codex

## Invocation and command routing

Select this skill with `$aegis` or `/skills`. Interpret plain `aegis ...`, `aegist ...`, and submitted `/aegis ...` or `/aegist ...` text identically. A skill does not register bare slash commands or nested menu completion. Optional legacy menu entries are `/prompts:aegis` and `/prompts:aegist`; see the engine's `docs/codex-compatibility.md`.

Preserve arguments after the command name. With no arguments or `help`, show the available Aegis commands using `aegis help`. Route `aegis help tw` to CLI help, not teamwork execution.

## Choose the executable before running commands

Keep the terminal working directory in the user's active project, including Godot projects and workspace containers without `package.json`. Use installed `aegis <arguments>` there. Use `npm run aegis -- <arguments>` only after confirming the current `package.json` is the Aegis engine package (`name: aegis`) with that script. A different project's npm scripts are not the Aegis CLI.

If `aegis` is missing or npm reports `ENOENT ... package.json`, do not retry npm or create a package file. Read the project's `.aegis/installation.json`, or `runtime.json` beside this installed skill. These contain the installed Node `command` and CLI `args`; execute them with the preserved user arguments and the active project's working directory. Validate that the command/CLI paths exist. If neither record exists, inspect the configured Aegis MCP executable or locate the engine checkout; do not invent its path or change into it to stage project tasks.

- `aegis status` / `aegist status`: inspect status.
- `aegis tw` with no objective: show teamwork status and explain how to supply an objective; do not invent work.
- `aegis tw status`, `peers`, `report`, `dag`, `matrix`, `waves`, `conflicts`: route to the corresponding `tw:<subcommand>` inspection command.
- `aegis tw <objective>` or `aegis tw plan <objective>`: plan **and execute** native Codex teamwork unless the user requests planning only or `--dry-run`.
- `aegis tw resume <run-id>`: inspect the saved run and recovery instructions, then resume eligible unfinished work through native dispatch after reconciling real agent states. This is not a new objective or permission to repeat completed work.
- Other arguments: use matching MCP tools or the CLI; consult `aegis help <term>` when uncertain. Never treat user arguments as executable shell code.

## Native teamwork

For nontrivial requested teamwork, plan with `teamwork plan "<objective>" [files...] --client=codex --json` and save the returned JSON using the terminal's UTF-8-safe file writer. Planning stages tasks; it does not start agents. Create the execution record with `codex:orchestrate create <plan.json> --workers=N --mode=brokered`. Set N from the host's actual available worker capacity, excluding the root coordinator; never infer capacity from the number of planned tasks. Inherit the active model. Keep Antigravity payloads for Antigravity only.

Claim the actual numeric inbox task ID, respect file locks, and preserve unrelated pending work. A configured MCP server may have a different working directory from the active project: use the CLI in the active project for project-local tasks unless its MCP root is confirmed. Do not clear the queue to start a new request.

Use this execution loop until `codex:orchestrate status <run>` shows completion or explicit failure:

1. Call `codex:orchestrate next <run> --available=N` with currently available worker capacity. Returned items are reserved, not running. Check actual host capacity and shared file locks before native dispatch.
2. Dispatch every independent item returned by `next` before waiting for any result. Use each `codexInvocationPayload.message` with the host's real spawn schema. Separate spawn calls still run concurrently when no result wait is inserted between them. For `resume`, prefer the native follow-up tool on the recorded agent; otherwise start a replacement with the supplied child evidence. Reuse idle workers when the client's open-thread limit prevents another spawn.
3. After native dispatch succeeds, call `codex:orchestrate start <run> <task> <native-agent-id>`. If dispatch fails, use `cancel-dispatch <run> <task> <reason>`; do not acknowledge a nonexistent agent.
4. Process results as they arrive; do not wait for an entire batch when a finished task frees capacity. Independently verify the result before `complete <run> <task> <evidence>`, or record `fail <run> <task> <reason>`. Release any claimed inbox task only after verification. Call `next` again to fill free slots and continue dependent waves. Share contract changes and findings through native messages or `tw:post`, so peers can adjust while still running.

Before reporting completion, review the combined changes and run checks for their integration. Show actual native agent identities, overlapping running intervals and verification results in the execution report. A plan with multiple tracks is not evidence of simultaneous execution. Do not end the request after planning or after the first worker returns while ready or running work remains.

For hierarchical work, a worker can submit `codex:orchestrate delegate <run> <parent-task> <children.json>` while running, then return the delegation request and end its current turn. Each child is `{ "id": "unique-id", "title": "bounded objective", "targetFiles": [], "dependsOn": [] }`; assigned files must stay within the parent's scope, and an empty scope is read-only. Children may repeat this protocol to form deeper logical levels. The root waits for the parent's native turn to end, then dispatches child requests using the same loop. A waiting parent is resumed after its children succeed and must review their evidence before completing. Never mark a parent done just because it requested children.

Use `nested` only when child sessions actually expose native delegation tools, honoring shared host capacity. A missing child spawn tool selects brokered delegation through the root; it does not prevent a logical task tree. `--max-depth` bounds that logical tree, not the platform's native depth. Neither CLI options nor skills enable unavailable host tools or increase platform limits. If no native delegation tools are available anywhere, explain the limitation and execute sequentially. Do not launch extra Codex processes or use external APIs to evade the host limit.

The scheduler never launches agents and does not clear or replace the shared inbox or locks. Orchestra IDs are not numeric inbox IDs; delegated child tasks may have no inbox entry. Report reserved, running, waiting, failed and verified-done states accurately. `--dry-run` on the planning route must not stage, claim, spawn or edit. See the engine's `docs/codex-orchestra.md` for command examples and recovery behavior.

## Quota interruptions and recovery

Keep the run ID and verified results durable throughout execution. When a worker actually stops because of quota or session interruption, save its checkpoint with `codex:orchestrate defer <run> <task> "<reason>" --resume-after=<UTC-ISO-time> --agent-stopped --checkpoint="<remaining work and evidence>"`. Use the host's reported reset time; do not invent a countdown or mark a still-running worker stopped. Hard termination may prevent this call; a new coordinator must reconcile saved running/reserved tasks with actual agent state before deferring them.

On return, inspect `codex:orchestrate list`, `recovery <run>` and `aegis tw resume <run>`. Keep verified-done tasks done; verify partial file changes and child evidence before redispatching unfinished work. Honor the saved not-before time and real worker capacity. The resume command returns a handoff, not proof that an agent started.

Aegis cannot change quota limits or wake this conversation merely by writing a file. If a native host scheduling tool is available and the user requested automatic continuation, schedule the existing run's recovery for the reported reset time. Otherwise clearly state that no automatic wake was scheduled and give the saved resume command. Do not launch extra Codex processes, alternate accounts or API sessions to evade limits.

## Tools and checks

Use the Aegis MCP server when connected, otherwise run the matching CLI command with the available terminal tool.
In the Aegis engine checkout use `npm run aegis -- <command>`; elsewhere use `aegis <command>`.

- `status`, `task:list`, `lock:status`: inspect work and locks.
- `find <symbol>`, `memory:query <symbol>`, `trace <target>`: inspect grounded code context.
- `teamwork plan "<objective>" [files...] --json`: stage tracks; this does not start agents.
- For requested parallel work, use the native spawn tool with `codexInvocationPayload.message`, matching the actual tool schema. Inherit the active model and respect the host's capacity and each track's dependencies. Keep Antigravity invocationPayload for Antigravity only.
- Claim/pull tasks and release the actual inbox ID after verification. Preserve shared locks and report progress with `tw:post`.
- `test [target]`, `test:offline [target]`, `verify:task [file]`: validate the affected scope.
- `godot tree <scene>`, `godot ui:lint <scene>`, `godot playtest <scene>`: inspect and validate Godot projects.
- `tw:report --compact`: report execution evidence after work completes.

Use the available question tool or ordinary conversation when NotebookLM authentication requires a user choice. Never call unavailable Antigravity tools such as define_subagent, invoke_subagent, run_command or ask_question.
Read the project's AGENTS.md for local constraints. Preserve user scope for external publication.
