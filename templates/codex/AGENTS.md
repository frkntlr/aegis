# Aegis project instructions for Codex

Use Aegis CLI and MCP for the same task inbox, locks, memory, Godot bridge and quality gates used by Antigravity.
In the engine checkout, read docs/codex-compatibility.md for setup, tool mappings and platform limits.

- Route submitted `aegis ...`, `aegist ...`, `$aegis ...`, `/aegis ...` and `/aegist ...` through the Aegis skill, preserving arguments. `aegis tw <objective>` requests planning and native execution; `aegis tw` alone requests status and usage. Quoted examples in a request to fix Aegis are not execution commands. In the engine repository use `npm run aegis -- <command>`; in other projects use the installed `aegis <command>`.
- Use the available terminal tool for CLI commands. Prefer registered Aegis MCP tools when their root matches the active project; otherwise use CLI in the active project. Tool names may have a server prefix.
- Keep source files at most 300 lines and functions at most 40 lines; avoid `any`. Validate changes with relevant tests and `aegis verify:task` where applicable.
- Treat experimental/** as separate agent worktrees. Respect .aegis/locks.json and the assigned file scope.
- For requested teamwork, plan using `aegis teamwork plan "<objective>" [files...] --json`. Planning stages tasks; it does not launch agents.
- Dispatch independent tracks with the host's available spawn tool, using each track's codexInvocationPayload.message and the actual tool schema. Inherit the current model. Do not pass Antigravity Model, TypeName or Workspace fields to Codex.
- Bound each wave and any child delegation to the host's available capacity. If delegation is unavailable, report that limitation and execute tracks sequentially while keeping locks and dependencies.
- Claim/pull the staged task, report progress using `aegis tw:post`, verify the work, then release the actual inbox task ID with `aegis task:release <id> done` (or `blocked` with a reason). A track ID or role name is not necessarily the numeric inbox ID.
- If NotebookLM authentication fails, report the failure and use an available question tool or plain text to offer reauthentication, explicit local-only continuation, or cancellation. Do not silently pretend NotebookLM succeeded.
- Use the host's available image viewer for screenshots. Antigravity-only modal and visual tools are not prerequisites for CLI checks.
- Follow the user's requested scope for commits, pushes, RFCs and discussions; task execution itself does not authorize unrelated publication.

Engine checkout: build with `npm run build`, type check with `npm run typecheck`, test with `npm test`.
In other projects, use that project's build and test commands.
