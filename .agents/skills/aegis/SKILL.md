---
name: aegis
description: >-
  Autonomous Vibe Coding Engine command center and slash command (/aegis).
  Use this skill whenever the user invokes /aegis, /aegis auto, /aegis dashboard,
  /aegis status, /aegis skeleton, /aegis cage:check, or asks to manage autonomous
  worktrees (solver/qa/docs), dispatch tasks, run quality gates, or inspect UI telemetry.
---

# Aegis Autonomous Vibe Coding Engine (/aegis)

This skill activates whenever the user triggers the `/aegis` slash command or requests autonomous orchestration, worktree execution, or quality gate audits.

## Universal CLI & Workspace Execution

`aegis` is installed as a universal binary accessible from **ANY** project directory (e.g. `Hake Game`, `aegis`, worktrees).
Directly run `aegis <command>` via `run_command` (no `npm run` wrapper needed):

| Command | Action | Execution |
| :--- | :--- | :--- |
| `/aegis` or `/aegis status` | Inspect active worktrees & persistent locks | `aegis status` |
| `/aegis auto` | Run autonomous task queue & dispatcher | `aegis auto` |
| `/aegis task:list [status]` | List ready, in_progress, or blocked tasks in TIP queue | `aegis task:list [status]` |
| `/aegis task:claim <id> [agent]` | Claim task for role, acquire file locks, set in_progress | `aegis task:claim <id> [agent]` |
| `/aegis task:release <id> [status]` | Release or complete task, release locks, update status | `aegis task:release <id> [status]` |
| `/aegis task:inject <id> [agent]` | Compile prompt & stage task into TIP inbox (.aegis/task-inbox.json) | `aegis task:inject <id> [agent]` |
| `/aegis task:pull [agent]` | Pull next staged task matching role from TIP inbox | `aegis task:pull [agent]` |
| `/aegis lock:status` | Inspect active file mutex locks across worktrees | `aegis lock:status` |
| `/aegis verify:task [file]` | Run Multimodal Quality Gate (Demir Kafes + Godot Playtest) | `aegis verify:task [file]` |
| `/aegis debug [err\|file]` | Socratic evidence-based interactive debugging session | `aegis debug [err]` |
| `/aegis merge <agent> [base]` | Multi-tier atomic merge (FF -> Rebase -> Merge Commit) | `aegis merge <agent> [base]` |
| `/aegis branch:sync [agent\|all]` | Safely synchronize worktree branches with master | `aegis branch:sync [agent]` |
| `/aegis dashboard [port]` | Launch Aegis Web Command Center | `aegis dashboard [port]` (with IsDaemon: true) |
| `/aegis cage:check [dir]` | Audit codebase against Deterministik Demir Kafes | `aegis cage:check [dir]` |
| `/aegis skeleton:scan [dir]` | Compute global AST skeleton map & token savings | `aegis skeleton:scan [dir]` |
| `/aegis skeleton <file>` | Generate AST skeleton for TS, Python, or GDScript | `aegis skeleton <file>` |
| `/aegis verify <file>` | Validate single file against Demir Kafes | `aegis verify <file>` |
| `/aegis gh:status [token]` | Inspect live GitHub API auth & rate limits | `aegis gh:status [token]` |
| `/aegis gh:sync [token]` | Download live GitHub issues & dispatch to agents | `aegis gh:sync [token]` |
| `/aegis rfc:create "<t>" [d]` | Create RFC blueprint, sync Wiki & publish Discussion | `aegis rfc:create "<t>" [d]` |
| `/aegis rfc:decompose <id>` | Decompose RFC acceptance criteria into GitHub Issues | `aegis rfc:decompose <id>` |
| `/aegis wiki:sync` | Auto-sync & push living memory directly to Wiki repo | `aegis wiki:sync` |
| `/aegis nlm:query "<q>"` | Query ground-truth knowledge via NotebookLM | `aegis nlm:query "<q>"` |
| `/aegis nlm:research "<t>"` | Deep architectural research & stage Wiki via NotebookLM | `aegis nlm:research "<t>"` |
| `/aegis nlm:auth [args]` | Authenticate Google NotebookLM session (--browser, --paste) | `aegis nlm:auth [args]` |
| `/aegis nlm:switch [args]` | Switch Google account, backup session & zero-click harvest | `aegis nlm:switch [args]` |
| `/aegis nlm:prune [id]` | Autonomous MFCS pruning with local tombstone vault archiving | `aegis nlm:prune [id]` |
| `/aegis nlm:restore <id>` | Restore archived source from tombstone vault | `aegis nlm:restore <id>` |
| `/aegis deps:drift` | Symbiotic Substrate 2.0 Contract Drift Radar & lockfile verify | `aegis deps:drift` |
| `/aegis inspect` | Zero-token bounding box layout inspection | `aegis inspect` |
| `/aegis mutate <file>` | Run mutation testing gate | `aegis mutate <file>` |
| `/aegis estimate <files> <tests>` | Pre-execution adaptive timeout estimation | `aegis estimate <files> <tests>` |
| `/aegis find <symbol>` | Fast AST symbol lookup & surgical slice | `aegis find <symbol>` |
| `/aegis triage [dir]` | Evidence-Based Bug Triage (zero false alarms) | `aegis triage [dir]` |
| `/aegis trace <target>` | Trace relational callers, signal listeners & scenes | `aegis trace <target>` |
| `/aegis graph:scan [dir]` | Build cross-reference relational knowledge graph | `aegis graph:scan [dir]` |
| `/aegis godot <subcmd>` | Godot Bridge: status, inspect, validate, query, run | `aegis godot <subcmd>` |
| `/aegis godot:test [dir]` | Run Godot compiler pre-flight and 3-tier playtest runner | `aegis godot:test [dir]` |
| `/aegis diff <diff>` | Validate surgical unified diff compliance | `aegis diff <diff>` |
| `/aegis audit <files>` | Run Immutable Oracle trust verification | `aegis audit <files>` |
| `/aegis ast:search <pat> [dir]` | Structural AST search via Aegis internal ast-grep | `aegis ast:search <pat> [dir]` |
| `/aegis ast:replace <p> <r> <f>` | Structural AST replacement via ast-grep | `aegis ast:replace <p> <r> <f>` |
| `/aegis rtk:compress [file]` | Compress terminal/test output via RTK | `aegis rtk:compress [file]` |
| `/aegis context7:query <l> <t>` | Query official library documentation | `aegis context7:query <l> <t>` |
| `/aegis memory:query <sym>` | Query 5-Layer Codebase Memory (AST, Graph, Context7) | `aegis memory:query <sym>` |
| `/aegis memory:stats [wt]` | Codebase Memory diagnostics and token savings | `aegis memory:stats [wt]` |
| `/aegis memory:refresh [d]` | Incrementally refresh Codebase Memory cache | `aegis memory:refresh [d]` |
| `/aegis memory:cold-start [d]` | Run full project cold-start AST indexing | `aegis memory:cold-start [d]` |
| `/aegis memory:watch [d] [wt]` | Real-time incremental file watcher daemon | `aegis memory:watch [d]` |
| `/aegis loop:status` | Inspect Circuit Breaker failure counters & blocked tasks | `aegis loop:status` |
| `/aegis loop:reset [num]` | Reset failure counters and unblock tasks | `aegis loop:reset [num]` |

## Core Principles & Constitutional Routing

1. **Iron Cage Enforcement**: Maximum 300 lines per file, maximum 40 lines per function.
2. **Conflict-Free Isolation**: Multi-agent tasks run in dedicated worktrees (`experimental/solver`, `experimental/qa`, `experimental/docs`, `experimental/ui`).
3. **Mandatory Identity Badges**:
   - `qa-hunter` -> `🎯 [QA HUNTER] AKTİF | Teşhis, Oynanış ve Görsel UI Denetçisi`
   - `issue-solver` -> `🛠️ [ISSUE SOLVER] AKTİF | İzole Çözücü ve Geliştirici`
   - `ui-specialist` -> `🎨 [UI SPECIALIST] AKTİF | Arayüz, Tema ve Görsel Cilalama Uzmanı`
   - `doc-architect` -> `📚 [DOC ARCHITECT] AKTİF | GitHub Dokümantasyon ve Proje Mimarı`
4. **Pull-Based Task Ingestion Protocol (TIP)**:
   - Tasks are staged via `aegis task:inject <id> [agent]`.
   - Agents pull their next assigned task via `aegis task:pull [role]` or MCP `task_inbox_pull`.
   - Locks are acquired automatically and tracked via `.aegis/locks.json` and `docs/ACTIVE_LOCKS.md`.
5. **Multimodal Quality Gate (Playtest-Before-PR)**:
   - Never open a PR without running `aegis verify:task` or verifying headless runtime playtest on Godot projects.
   - Code must pass 100% unit tests, Demir Kafes rules, and zero runtime crashes.
6. **Authoritative 27-Tool MCP Server**:
   - Aegis exposes 27 authoritative tools directly to Antigravity, replacing legacy external bloated MCP servers with zero-token UI inspection, native `--check-only` compiler pre-flight, and deterministic port allocation.
7. **Headless Git Safety**: `$env:GIT_TERMINAL_PROMPT=0` mandatory; git push requires prior auth verification and explicit permission.
8. **Strict Phase Boundaries**: Research (NotebookLM) -> Blueprint/Wiki -> Issue Breakdown -> Isolated Worktree Code. No premature implementation!
9. **Meta-Reflex Feedback**: Any engine improvement or toolchain feedback across projects is autonomously published upstream to `frkntlr/aegis` as an RFC & GitHub Discussion.
10. **Anti-Hang Guard (Never use npx ast-grep)**: Unscoped `ast-grep` on npm is an obsolete 2018 package that hangs waiting on STDIN. Always use `/aegis ast:search` or `aegis ast:search` (or `aegis ast-grep` / `aegis sg`).
11. **Socratic Diagnostic Gate**: Before modifying code for crash or error reports, run `/aegis debug` or call MCP `socratic_diagnose` to triangulate ground-truth symbols and inspect line budgets.
