
<!-- aegis:codex:start -->
# Aegis project instructions for Codex

Use Aegis CLI and MCP for the same task inbox, locks, memory, Godot bridge and quality gates used by Antigravity.
In the engine checkout, read docs/codex-compatibility.md for setup, tool mappings and platform limits.

- Route submitted `aegis ...`, `aegist ...`, `$aegis ...`, `/aegis ...` and `/aegist ...` through the Aegis skill, preserving arguments. `aegis tw <objective>` requests planning and native execution; `aegis tw` alone requests status and usage. Quoted examples in a request to fix Aegis are not execution commands. In the engine repository use `npm run aegis -- <command>`; in other projects use the installed `aegis <command>`.
- Use the available terminal tool for CLI commands. Prefer registered Aegis MCP tools when their root matches the active project; otherwise use CLI in the active project. Tool names may have a server prefix.
- Keep source files at most 300 lines and functions at most 40 lines; avoid `any`. Validate changes with relevant tests and `aegis verify:task` where applicable.
- Treat experimental/** as separate agent worktrees. Respect .aegis/locks.json and the assigned file scope.
- For requested teamwork, plan using `aegis teamwork plan "<objective>" [files...] --client=codex --json`. Planning stages tasks; it does not launch agents.
- For nontrivial requested teamwork, save the plan JSON and create a persistent execution record with `aegis codex:orchestrate create <plan.json> --workers=N --mode=brokered`, where N is actual host worker capacity excluding the root. Run the installed skill's next/native-dispatch/start/verify/complete loop. Reserving a task does not start an agent. Inherit the current model and use the host's actual spawn schema with codexInvocationPayload.message; keep Antigravity-only fields out of Codex calls.
- Dispatch all ready independent workers before waiting for results. Refill available slots as results arrive, share contract changes with peers, and verify the combined changes before completing the request.
- A worker without a spawn tool submits child tasks using `codex:orchestrate delegate`, returns the request and ends its turn. The root then runs the logical children within the same host capacity and resumes the parent to review their evidence. Use native nested delegation only when tools are actually available in child sessions. Reuse idle workers when thread limits require it; settings cannot manufacture host capacity. If no native delegation tool exists, execute sequentially while keeping locks and dependencies.
- Claim/pull the staged task, report progress using `aegis tw:post`, verify the work, then release the actual inbox task ID with `aegis task:release <id> done` (or `blocked` with a reason). A track ID or role name is not necessarily the numeric inbox ID.
- If NotebookLM authentication fails, report the failure and use an available question tool or plain text to offer reauthentication, explicit local-only continuation, or cancellation. Do not silently pretend NotebookLM succeeded.
- Use the host's available image viewer for screenshots. Antigravity-only modal and visual tools are not prerequisites for CLI checks.
- Follow the user's requested scope for commits, pushes, RFCs and discussions; task execution itself does not authorize unrelated publication.

Engine checkout: build with `npm run build`, type check with `npm run typecheck`, test with `npm test`.
In other projects, use that project's build and test commands.

<!-- aegis:codex:end -->

<!-- aegis:codex:isolation -->
Treat experimental/** as isolated agent worktrees. Inspect or edit them only when assigned.
Respect .aegis/locks.json; do not edit files locked by another agent.
