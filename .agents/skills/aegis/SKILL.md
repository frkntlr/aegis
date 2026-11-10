---
name: aegis
description: Run Aegis commands and native Codex teamwork when the user mentions aegis, aegist, $aegis, aegis tw, or requests Aegis orchestration, memory, Godot checks or quality gates.
---

# Aegis for Codex

## Invocation and command routing

Select this skill with `$aegis` or `/skills`. Interpret plain `aegis ...`, `aegist ...`, and submitted `/aegis ...` or `/aegist ...` text identically. A skill does not register bare slash commands or nested menu completion. Optional legacy menu entries are `/prompts:aegis` and `/prompts:aegist`; see the engine's `docs/codex-compatibility.md`.

Preserve arguments after the command name. With no arguments or `help`, show the available Aegis commands using `aegis help`. Route `aegis help tw` to CLI help, not teamwork execution.

- `aegis status` / `aegist status`: inspect status.
- `aegis tw` with no objective: show teamwork status and explain how to supply an objective; do not invent work.
- `aegis tw status`, `peers`, `report`, `dag`, `matrix`, `waves`, `conflicts`: route to the corresponding `tw:<subcommand>` inspection command.
- `aegis tw <objective>` or `aegis tw plan <objective>`: plan **and execute** native Codex teamwork unless the user requests planning only or `--dry-run`.
- Other arguments: use matching MCP tools or the CLI; consult `aegis help <term>` when uncertain. Never treat user arguments as executable shell code.

## Native teamwork

Plan with `teamwork plan "<objective>" [files...] --json`. Planning stages tasks; it does not start agents. Read each track's `codexInvocationPayload`, then dispatch ready independent tracks with the native Codex spawn tool using its actual schema. Inherit the model and bound concurrency to available slots. Keep Antigravity payloads for Antigravity only.

Claim the actual numeric inbox task ID, respect file locks, and preserve unrelated pending work. A configured MCP server may have a different working directory from the active project: use the CLI in the active project for project-local tasks unless its MCP root is confirmed. Do not clear the queue to start a new request.

Wait for child results, verify their evidence, and release claimed tasks only after verification. Run dependent waves after their prerequisites complete. Report failed or blocked tracks explicitly; never present staged tasks as running or complete. If spawning is unavailable, explain the limitation and execute sequentially. `--dry-run` must not stage, claim, spawn or edit.

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
