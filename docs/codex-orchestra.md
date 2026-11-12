# Codex orchestra

Aegis keeps a persistent task tree while Codex performs native agent dispatch.
Independent tasks run in parallel up to the host's actual available capacity.
When a child session cannot spawn, it sends child tasks back to the root
coordinator. The root runs those tasks and resumes their logical parent to
review the results. Physical agent threads can therefore be siblings while the
task record preserves parent, child and deeper relationships.

The CLI scheduler does not launch agents, grant tools, raise platform limits or
start an external API session. Native Codex handles spawning, messages and
follow-up turns. See the [official subagent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents).

See [validation evidence](codex-orchestra-validation.md) for the tested native
workflow, task tree, failure cases and measured queue behavior.

## Implementation plan

1. Persist each run independently under `.aegis/codex-orchestra/` with atomic,
   mutex-protected updates. Preserve the existing task inbox and shared locks.
2. Reserve ready tasks under the worker limit, honoring dependencies, phases and
   writable file conflicts. Acknowledge successful native dispatch separately.
3. Accept scoped child requests, suspend the parent, dispatch ready descendants
   and resume the parent for evidence review after child success.
4. Expose machine-readable CLI transitions and teach the Codex skill to drive
   the native execution loop. Verify lifecycle, capacity and failure behavior
   with isolated tests and an actual native-agent exercise.

## Start a run

In the engine checkout, prefix commands with `npm run aegis --`; in another
configured project, use installed `aegis` as shown below.

```text
aegis teamwork plan "Implement and verify the inventory feature" src/inventory.ts --client=codex --json
```

Save the returned JSON as UTF-8, preserving its full structure. Use a file API
or a terminal writer with explicit encoding; older PowerShell redirection can
produce UTF-16 instead. Planning stages inbox tasks but starts no native agents.

Codex output omits Antigravity dispatch fields and includes `execution` metadata.
Its `savedPlanPath` points to the already persisted full plan, which can be passed
directly to `create` instead of saving console output. `agentsStarted` is false
until the host performs native dispatch. With `--dry-run`, `savedPlanPath` is null
and no project state is created.

```text
aegis codex:orchestrate create plan.json --workers=3 --mode=brokered --max-depth=8
```

`--workers` counts workers, excluding the root. Three workers is an example for
a host that permits the root plus three active workers, not a universal Codex
limit. Derive it from the current host, and reduce `--available` when other
work uses the same capacity. `--max-depth` bounds the logical task tree; it is
not a Codex setting that enables native recursion.

| Mode | Coordination |
| --- | --- |
| `brokered` | The root performs native dispatch for every logical level. Use when children lack spawn tools. |
| `nested` | Use only after confirming native child delegation is exposed; honor the same total capacity. |
| `sequential` | At most one task is dispatched at a time. Native tool availability still determines execution. |

## Native execution loop

```text
aegis codex:orchestrate next RUN_ID --available=2
```

The JSON response contains reserved dispatch items. Use the returned
`codexInvocationPayload.message` with the host's actual native spawn tool.
Never pass Antigravity's `invocationPayload` to Codex. Inherit the active model.
Dispatch all independent returned items before waiting for a result. As each
worker finishes and its result is verified, call `next` to refill available slots.
Check shared locks and claim the exact staged numeric inbox ID when one exists.
The scheduler handles its run's conflicts; it does not acquire or override
shared locks belonging to another task or process.

Only after a native call succeeds, record its real agent identity:

```text
aegis codex:orchestrate start RUN_ID TASK_ID NATIVE_AGENT_ID
```

If a native spawn is rejected, release that reservation with a diagnostic:

```text
aegis codex:orchestrate cancel-dispatch RUN_ID TASK_ID "Host has no free worker slot"
```

Wait for native results and verify their evidence before completing a task:

```text
aegis codex:orchestrate complete RUN_ID TASK_ID "Focused inventory checks passed; reviewed result"
aegis codex:orchestrate fail RUN_ID TASK_ID "Compiler failed: missing exported Inventory type"
```

Call `next` again as slots become available. Continue dependent phases only
after their prerequisites succeed. Report failure explicitly; a staged plan,
reservation or acknowledgement is not verified completion.

## Logical children without native child tools

A running worker can submit a UTF-8 JSON array of bounded child requests:

```json
[
  {
    "id": "inventory-logic",
    "title": "Implement inventory state transitions",
    "targetFiles": ["src/inventory.ts"],
    "dependsOn": []
  },
  {
    "id": "inventory-review",
    "title": "Review the inventory state transitions and return findings",
    "targetFiles": [],
    "dependsOn": ["inventory-logic"]
  }
]
```

```text
aegis codex:orchestrate delegate RUN_ID PARENT_TASK_ID children.json
```

Child IDs must be unique within the run. Assigned files must remain within the
parent's scope; an empty scope is read-only. Do not expand file permissions by
delegating. Children can request another bounded level using the same protocol.

After submitting, the worker returns the request to the root and ends its
current native turn. The root waits for that return before reusing capacity;
a scheduler transition cannot stop a still-running native agent. The root
dispatches ready children through `next` and records their actual starts and
verified results.

When all children succeed, the parent becomes ready to resume. Prefer the
native follow-up tool on the recorded agent. If the client cannot resume it,
spawn a replacement using the dispatch payload and child evidence. Reuse idle
native threads when the client limits concurrently open threads. The parent
reviews the results before its own `complete` transition. Failed children block
successful parent completion and dependent work.

Orchestra task IDs are separate from numeric inbox IDs. Delegated children may
have no inbox entry; do not invent one or release an unrelated staged task.
The original parent retains responsibility for its staged task and verification.
Preserve that parent's existing lock ownership while delegated children work
inside its scope; do not reacquire the same files under an unrelated owner.
Waiting parents retain their file scopes in scheduling conflict checks. Their
descendants may use those scopes; unrelated tasks wait until the parent has
resumed, reviewed its child results and completed.

## Status and interruption

```text
aegis codex:orchestrate status RUN_ID
```

Use the persistent record to distinguish pending, reserved, running, waiting,
done, failed and blocked work. After an interruption, reconcile it with the
host's real native-agent state before dispatching more work. Cancel only a
reservation whose native dispatch did not start. Do not free a running agent's
capacity simply because its conversation is quiet. Corrupt state should be
reported for recovery rather than replaced with an empty run.

The orchestration record persists across CLI invocations; execution still needs
the active Codex coordinator. No background daemon is implied. Planning-only
requests and the existing teamwork `--dry-run` route do not authorize staging,
claims or native execution. Verification of one bounded hierarchy is evidence
for that workflow, not a promise of unlimited native recursion.
