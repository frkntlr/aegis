---
name: aegis
description: >-
  Autonomous Vibe Coding Engine command center and slash command (/aegist, /aegis).
  Use this skill whenever the user invokes /aegis, /aegis auto, /aegis dashboard,
  /aegis status, /aegis skeleton, /aegis cage:check, or asks to manage autonomous
  worktrees (solver/qa/docs), dispatch tasks, run quality gates, or inspect UI telemetry.
---

# Aegis Autonomous Vibe Coding Engine (/aegist, /aegis)

This skill activates whenever the user triggers the `/aegist` or `/aegis` slash command or requests autonomous orchestration, worktree execution, or quality gate audits.

## Universal CLI & Workspace Execution

`aegis` and `aegist` are installed as universal binaries accessible from **ANY** project directory (e.g. `Hake Game`, `aegis`, worktrees).
Directly run `aegis <command>` or `aegist <command>` via `run_command` (no `npm run` wrapper needed):

| Command | Action | Execution |
| :--- | :--- | :--- |
| `/aegis` or `/aegis status` | Inspect active worktrees & persistent locks | `aegis status` |
| `/aegis auto` | Run autonomous task queue & dispatcher | `aegis auto` |
| `/aegis tw "<obj>"` or `teamwork` | Direct plan & stage tracks (Short: `tw`, `tw:plan`, `tw:status`, `tw:dag`, `tw:matrix`, `tw:compact`, `tw:analyze`, `tw:setup`, `tw:clear`) | `aegis tw "<obj>" [-c] [-j] [--dry-run]` |
| `/aegis tw:waves [obj]` | Compute parallel execution waves & simultaneous dispatch | `aegis tw:waves [obj] [-c]` |
| `/aegis tw:peers` | List active peer subagents, current status, locks & modified files | `aegis tw:peers [-c]` |
| `/aegis tw:radar` or `tw:conflicts` | Inspect Conflict Radar for active file collision warnings | `aegis tw:radar` |
| `/aegis tw:doc [planId]` | Synthesize living architecture briefing, Mermaid DAG & metrics | `aegis tw:doc [planId] [-c]` |
| `/aegis tw:post "<activity>"` | Post subagent status, touched files or contracts to mesh | `aegis tw:post "<act>" [flags]` |
| `/aegis tw:broadcast "<msg>"` | Broadcast milestone or event to peer subagents across mesh | `aegis tw:broadcast "<msg>"` |
| `/aegis tw:mesh [clear]` | Read, inspect or clear dynamic real-time teamwork mesh state | `aegis tw:mesh [clear] [-c]` |
| `/aegis tw:advance [planId]` | Smoothly advance active wave to next execution phase | `aegis tw:advance [planId]` |
| `/aegis tw:scale "<obj>"` | Micro-sharded hyper-scale concurrency plan (100% disjoint locks) | `aegis tw:scale "<obj>"` |
| `/aegis tw:batch [planId]` | Group tracks into parallel execution batches ready for dispatch | `aegis tw:batch [planId]` |
| `/aegis teamwork [status]` | View active Antigravity subagents & locked tracks (alias: `tw:status`) | `aegis tw:status` |
| `/aegis teamwork plan "<obj>"` | Generate Antigravity subagent plan & stage TIP tracks (alias: `tw:plan`) | `aegis tw:plan "<obj>"` |
| `/aegis teamwork compact [obj]` | Compact logs & archive completed tasks with 85% token savings (alias: `tw:compact`) | `aegis tw:compact` |
| `/aegis teamwork clear` | Safely clear TIP inbox and active mutex locks (alias: `tw:clear`) | `aegis tw:clear` |
| `/aegis teamwork setup [dir]` | Export subagents manifest (.aegis/subagents.json, alias: `tw:setup`) | `aegis tw:setup` |
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
| `/aegis godot <subcmd>` | Godot Bridge: status, ui, inspect, validate, query, run | `aegis godot <subcmd>` |
| `/aegis godot ui:lint <scene>` | Static Godot 4 UI compliance linter (anchors, container rules, touch targets) | `aegis godot ui:lint <scene>` |
| `/aegis godot ui:scaffold <type> <name>` | Scaffold production-ready Godot 4 UI (menu, hud, dialog, theme) | `aegis godot ui:scaffold <type> <name>` |
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
| `/aegis search <query>` | Filter 100+ subcommands by keyword (alias: `aegis help <query>`) | `aegis search <query>` |
| `/aegis completion [--install]` | Generate or install PowerShell/Bash tab completion | `aegis completion --install` |

## Antigravity Slash Commands & Sister Skills

Aegis registers dedicated modular slash commands across specialized skill manifests:
- `/tw` or `/aegis tw`: Antigravity Teamwork orchestrator, DAG execution waves, and task staging ([tw](../tw/SKILL.md)).
- `/aegis-tw`: Direct alias for Antigravity Teamwork ([aegis-tw](../aegis-tw/SKILL.md)).
- `/cage`: Instant Demir Kafes compliance audit and line limit radar ([cage](../cage/SKILL.md)).
- `/aegis` / `/aegist`: Universal engine command center ([aegis](./SKILL.md)).

## Subcommand Discovery & Tab-Completion

- **Instant Subcommand Search**: Run `aegis search <query>` or `aegis help <query>` to instantly discover matching commands (e.g., `aegis search tw`, `aegis search cage`, `aegis search nlm`).
- **PowerShell / Bash Tab Completion**:
  - `aegis completion`: Prints native argument completer script block.
  - `aegis completion --install`: Installs completion directly into `$PROFILE` (`Microsoft.PowerShell_profile.ps1`) and the Antigravity bin script (`aegis.ps1`).
  - Once active, typing `aegis <TAB>` or `aegis tw<TAB>` auto-completes all 100+ commands natively.

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
6. **Authoritative 29-Tool MCP Server**:
   - Aegis exposes 29 authoritative tools directly to Antigravity (including `teamwork_plan` and `teamwork_status`), replacing legacy external bloated MCP servers with zero-token UI inspection, native `--check-only` compiler pre-flight, and deterministic port allocation.
7. **Headless Git Safety**: `$env:GIT_TERMINAL_PROMPT=0` mandatory; git push requires prior auth verification and explicit permission.
8. **Strict Phase Boundaries**: Research (NotebookLM) -> Blueprint/Wiki -> Issue Breakdown -> Isolated Worktree Code. No premature implementation!
9. **Meta-Reflex Feedback**: Any engine improvement or toolchain feedback across projects is autonomously published upstream to `frkntlr/aegis` as an RFC & GitHub Discussion.
10. **Anti-Hang Guard (Never use npx ast-grep)**: Unscoped `ast-grep` on npm is an obsolete 2018 package that hangs waiting on STDIN. Always use `/aegis ast:search` or `aegis ast:search` (or `aegis ast-grep` / `aegis sg`).
11. **Socratic Diagnostic Gate**: Before modifying code for crash or error reports, run `/aegis debug` or call MCP `socratic_diagnose` to triangulate ground-truth symbols and inspect line budgets.
12. **CLI Cold-Start & Atomic Mutex Velocity**: Dynamic lazy loading (22 modules) reduces cold start to ~103ms (2.6x speedup). Track file locks are acquired atomically in one pass via `acquireBatchLocks()`, and candidate files resolve in <2ms via persistent disk cache (`.aegis/cache/fast-semantic-manifest.json`).


## Antigravity Subagent Teamwork Runbook (`/aegis teamwork`, `/teamwork`, `/aegis tw`)

When the user triggers `/aegis tw <objective>`, `/aegis teamwork <objective>`, `/aegist tw <objective>`, or standard `/teamwork <objective>`:

1. **Plan & Stage Tracks**:
   Run `aegis tw "<objective>" [targetFiles]` or `aegis teamwork plan "<objective>" [targetFiles]` (or MCP tool `teamwork_plan`).
   - Supports direct execution flags:
     - `--compact` / `-c`: RTK and AST skeleton briefing (saves 85% tokens).
     - `--json` / `-j`: Structured machine-readable JSON output.
     - `--dry-run`: Plan simulation without locking files or mutating inbox.
   - Shortcut commands: `tw`, `tw:plan`, `tw:status`, `tw:compact`, `tw:dag`, `tw:matrix`, `tw:analyze`, `tw:setup`, `tw:clear`.
   - `FastSemanticAnalyzer` uses persistent disk cache to score and discover target files in <2ms.
   - Acquires mutex file locks atomically in one pass via `acquireBatchLocks()` (`.aegis/locks.json`).
   - Ingests the objective and identifies target tracks (`issue-solver`, `qa-hunter`, `ui-specialist`, `doc-architect`).
   - `ui-specialist` is the designated primary owner of Godot UI scenes (`.tscn`), Themes (`.tres`), and presentation scripts (`.gd`).
   - `issue-solver` owns domain logic, models, and algorithms, eliminating file lock collisions.
   - Stages track payloads into `.aegis/task-inbox.json`.
   - Use `aegis tw:clear` / `aegis teamwork:clear` to reset stale inboxes and release orphaned locks.

2. **Render Live Task Matrix in Chat**:
   Immediately output the initial status matrix to the user so they can follow parallel execution in real time:
   ```markdown
   ### 🤖 Antigravity Teamwork Canlı Görev Matrisi
   | Ajan / Rol | Durum | Kilitli Dosyalar | Model | Görev Özeti |
   | :--- | :--- | :--- | :--- | :--- |
   | `issue-solver` | 🔄 Çalışıyor | `src/...` | `inherit` | Temel mantık kodlanıyor |
   | `ui-specialist` | 🔄 Çalışıyor | `res://...` | `inherit` | Arayüz ve tema tasarımı |
   | `qa-hunter` | 🔄 Denetliyor | - | `inherit` | Triage & Test kapısı |
   | `doc-architect` | 🔄 Hazırlanıyor | `docs/...` | `flash` | Dokümantasyon & Wiki |
   ```

3. **Define Subagents (if not defined)**:
   Call `define_subagent` for each required role:
   - `issue-solver`: Demir Kafes, surgical diffs, pre-commit tests.
   - `qa-hunter`: Evidence-based triage, Socratic debugging, mutation score >= 70%.
   - `ui-specialist`: Godot 4 UI scenes (.tscn), container-first layouts, responsive anchors (anchors_preset=15), touch targets (>=44px), themes (.tres), and decoupled GDScript controllers (<300 lines).
   - `doc-architect`: Living wiki sync (`<repo>.wiki.git`), RFC ideation, zero premature coding.

4. **Spawn Subagents with Shared Workspace & Hybrid Models**:
   Call `invoke_subagent` for each staged track concurrently:
   - Set `Workspace: 'share'` so subagents operate directly on the project's repository worktree.
   - Set `Model`: `'inherit'` for `issue-solver`, `qa-hunter`, and `ui-specialist`; `'flash'` for `doc-architect`.
   - Provide the compiled prompt containing the role badge, track objective, locks, and acceptance criteria.

5. **Autonomous Parallel Execution & Verification**:
   - Subagents pull their task with `aegis task:pull [role]` or MCP `task_inbox_pull`.
   - Subagents implement isolated changes without modifying files locked by peers.
   - Subagents run `aegis verify:task` or `aegis godot ui:lint` before reporting back.
   - Subagents send completion message: `[ROLE_COMPLETE: <role>]` with verification summary.

6. **Live Progress Reporting & Lock Release**:
   - As each subagent completes and sends a message, Team Lead receives a reactive wakeup.
   - Team Lead emits an updated status in chat marking that role `✅ Tamamlandı` with its surgical diff / verification summary.
   - Team Lead releases the task lock via `aegis task:release <id> done`.
   - Once all tracks complete, Team Lead presents the final consolidated review card with Demir Kafes and test verification status.
