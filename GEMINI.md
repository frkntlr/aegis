# Aegis Autonomous Vibe Coding Engine Rules

## `/aegist` and `/aegis` Slash Command Protocol
When the user sends `/aegist` or `/aegis` or any subcommand starting with `/aegist <cmd>` or `/aegis <cmd>`, immediately interpret and execute the corresponding Aegis CLI command in PowerShell:

- `/aegis update [--clean] [--pull] [--bump <patch|minor|major>]`: Run `npm run aegis -- update` to dynamically update, bump monorepo package versions, rebuild, and cleanly reinstall Aegis across the PC.
- `/aegis version:status`: Run `npm run aegis -- version:status` to inspect version grade diagnostics, drift against origin/master, latest git tags, and upgrade availability.
- `/aegis ci:audit` or `/aegis ci:check`: Run `npm run aegis -- ci:audit` to deterministically verify all 10 GitHub Actions CI gates locally before pushing code.
- `/aegis` or `/aegis status`: Run `npm run aegis -- status` and display worktrees and file locks.
- `/aegis auto`: Run `npm run aegis -- auto` and report autonomous task claims.
- `/aegis teamwork [status]`: View active Antigravity subagents and locked tracks.
- `/aegis teamwork plan "<objective>" [files...]`: Generate Antigravity subagent plan and stage in TIP inbox.
- `/aegis tw:report [planId] [--compact] [--json] [--save]`: Run `npm run aegis -- tw:report` to generate <10ms ground-truth execution report (--compact for <120 tokens, --save to .aegis/reports/).
- `/aegis tw:doc [planId] [--compact] [--readme]`: Run `npm run aegis -- tw:doc` for real-time living architecture synthesis and quality gate metrics.
- `/aegis teamwork setup [outDir]`: Export Antigravity subagents manifest (.aegis/subagents.json).
- `/aegis task:list [status]`: List ready, in_progress, or blocked tasks in TIP queue.
- `/aegis task:claim <id> [agent]`: Claim task for role, acquire file locks, set in_progress.
- `/aegis task:release <id> [status]`: Release or complete task, release locks, update status.
- `/aegis task:inject <id> [agent]`: Compile prompt & stage task into TIP inbox (.aegis/task-inbox.json).
- `/aegis task:pull [agent]`: Pull next staged task matching role from TIP inbox.
- `/aegis lock:status`: Inspect active file mutex locks across worktrees.
- `/aegis test [target] [--offline]`: Resilient non-hanging test shield with process watchdog, bounded timeout & auto-triage (supports `--offline` flag).
- `/aegis test:offline [target]`: Run tests isolated inside RFC-050 strict offline network shield (Node.js network mock shim intercepts outbound connections).
- `/aegis verify:task [file]`: Run Multimodal Quality Gate (Demir Kafes + Godot Playtest).
- `/aegis debug [error|file]`: Run Socratic evidence-based interactive debugging session.
- `/aegis dashboard [port]`: Run `npm run aegis -- dashboard [port]` as daemon and provide web link.
- `/aegis skeleton:scan`: Run `npm run aegis -- skeleton:scan` and show token savings.
- `/aegis cage:check`: Run `npm run aegis -- cage:check` and report Demir Kafes compliance.
- `/aegis verify <file>`: Run `npm run aegis -- verify <file>` on target file.
- `/aegis gh:status`: Run `npm run aegis -- gh:status`.
- `/aegis gh:sync`: Run `npm run aegis -- gh:sync`.
- `/aegis rfc:create "<title>" [desc]`: Create RFC blueprint, sync to Wiki and publish GitHub Discussion.
- `/aegis rfc:decompose <rfcId>`: Decompose RFC acceptance criteria into atomic GitHub Issues.
- `/aegis wiki:sync`: Automatically synchronize and push living memory to `<repo>.wiki.git`.
- `/aegis nlm:query "<q>"`: Query project knowledge base via Google NotebookLM.
- `/aegis nlm:research "<topic>"`: Conduct deep architectural research via NotebookLM and stage Wiki.
- `/aegis nlm:auth [args]`: Inspect and authenticate Google NotebookLM session (--browser, --paste, --status).
- `/aegis nlm:switch [args]`: Switch active NotebookLM Google account, backing up existing session and prompting zero-click ambient scan or browser login.
- `/aegis nlm:prune [args]`: Autonomous MFCS pruning with local tombstone vault archiving.
- `/aegis nlm:restore <id>`: Restore archived source from tombstone vault.
- `/aegis deps:drift`: Symbiotic Substrate 2.0 Contract Drift Radar and lockfile integrity verification.
- `/aegis find <symbol>`: Fast AST symbol lookup and precision surgical slice.
- `/aegis triage [dir]`: Evidence-Based Bug Triage (zero false alarms).
- `/aegis trace <target>`: Trace relational callers, signal listeners & scenes.
- `/aegis graph:scan [dir]`: Build cross-reference relational knowledge graph.
- `/aegis godot <subcmd>`: Godot Bridge: status, ui, inspect, validate, query, run, playtest, tree.
- `/aegis godot tree <scene> [--focus=<node>] [--depth=<n>] [--compact]`: Zero-token Targeted Scene Slicing (TSS) without engine cold-start (<0.03ms, <150 tokens).
- `/aegis godot playtest <scene> [--track=<id>]`: Headless playtest runner with RFC-051 ephemeral port sharding and per-track isolated user-data-dir.
- `/aegis godot ui:lint <scene>`: Run static Godot 4 UI compliance linter (anchors, container rules, touch targets).
- `/aegis godot ui:scaffold <type> <name> [dir]`: Scaffold production-ready Godot 4 UI (menu, hud, dialog, theme).
- `/aegis mutate <file>`: Run mutation testing gate on target file.
- `/aegis diff <diff>`: Validate surgical unified diff compliance.
- `/aegis audit <files>`: Run Immutable Oracle trust verification.
- `/aegis estimate <files> <tests>`: Pre-execution adaptive timeout estimation.
- `/aegis ast:search <pat> [dir]`: Structural AST search via ast-grep.
- `/aegis ast:replace <p> <r> <f>`: Structural AST replacement via ast-grep.
- `/aegis rtk:compress [file]`: Compress terminal/test output via RTK Token Killer.
- `/aegis context7:query <lib> <top>`: Query official ground-truth library documentation.
- `/aegis memory:query <sym>`: Query 5-Layer Codebase Memory (AST, Graph, Context7, Demir Kafes).
- `/aegis memory:stats [wt]`: Inspect Codebase Memory diagnostics and token savings.
- `/aegis memory:refresh [d]`: Incrementally refresh Codebase Memory cache.
- `/aegis memory:cold-start [dir] [wt]`: Run full project cold-start AST indexing.
- `/aegis memory:watch [dir] [wt]`: Real-time incremental file watcher for codebase memory.
- `/aegis merge <agent> [base]`: Multi-tier atomic merge (FF -> Rebase-FF -> Merge Commit) & dynamic sibling synchronization.
- `/aegis branch:sync [agent|--all]`: Safely synchronize worktree branches with master with zero data loss stash protection.
- `/aegis loop:status`: Inspect Circuit Breaker failure counters and blocked tasks.
- `/aegis loop:reset [num]`: Reset failure counters and unblock tasks.
- `/aegis push` or `/aegis tw:push`: Autonomous Demir Kafes pre-push gate, staging, commit, and remote push.

## Mandatory Identity Badges
Every autonomous agent must prefix its conversational announcements with its designated role badge:
- `qa-hunter` -> `🎯 [QA HUNTER] AKTİF | Teşhis, Oynanış ve Görsel UI Denetçisi`
- `issue-solver` -> `🛠️ [ISSUE SOLVER] AKTİF | İzole Çözücü ve Geliştirici`
- `ui-specialist` -> `🎨 [UI SPECIALIST] AKTİF | Arayüz, Tema ve Görsel Cilalama Uzmanı`
- `doc-architect` -> `📚 [DOC ARCHITECT] AKTİF | GitHub Dokümantasyon ve Proje Mimarı`

## NotebookLM Interactive Auth Resolution & Tri-State Protocol
Whenever any `/aegis nlm:*` command or NotebookLM tool call encounters an authentication failure, expired session, or connection issue (`AUTH_REQUIRED_INTERACTIVE` or HTTP 401/403/400):
1. **Zero Silent Fallback**: The agent must NEVER silently downgrade to offline mode or guess without developer consent.
2. **Mandatory Antigravity Modal**: The agent MUST immediately invoke the `ask_question` tool with:
   - Question: `"NotebookLM'e bağlanılamadı. Ne yapmak istersiniz?"`
   - Options:
     1. `"(Recommended) NotebookLM'e tekrar giriş yap / oturumu yenile"` (Triggers `aegis nlm:auth --browser` or guides token paste, then retries original operation)
     2. `"NotebookLM olmadan (Yerel AST ve Context7 ile) devam et"` (Executes with `--offline` / graceful fallback)
     3. `"Görevi iptal et"` (Halts operation cleanly, releasing locks with status 0)
3. **Execution Fidelity**: Strictly respect the user's chosen option.

## Ambient Session Harvesting & Conversational Account Switch
1. **Zero-Click Ambient Discovery**: NotebookLM authentication automatically probes active CDP debug ports (9222–9229) and Chromium cookie vaults (Chrome, Edge, Brave) before prompting manual input.
2. **Conversational Account Switch Detection**: Whenever the user expresses intent to change accounts (e.g., "başka hesaba geç", "farklı bir hesapla giriş yap", "switch account"), the agent must proactively invoke `npm run aegis -- nlm:switch`. Existing sessions are safely archived to `.notebooklm-mcp/auth.backup-<ts>.json` before the switch.

## Headless Git & Remote Execution Safeguards
To prevent indefinite command hangs during git remote operations:
1. **Non-Interactive Flag**: Always prefix git network calls with `$env:GIT_TERMINAL_PROMPT=0` (or set in session). Git must fail fast rather than hanging on credential/passphrase prompts.
2. **No Background Remote Hangs**: Remote operations (`git push`, `git fetch`, `git clone`) must NEVER run as indefinite background daemons. Use finite timeout (e.g. `WaitMsBeforeAsync: 10000`).
3. **Pre-Push Auth Pre-check & Quality Gate**: Verify `gh auth status` or remote connectivity before pushing. Direct pushes to `master`/`main` must have passing pre-push gates (`aegis ci:audit`, `cage:check` + monorepo tests).
4. **Anti-Hang & STDIN Safeguard**: NEVER run `npx ast-grep` (outdated 2018 package that hangs waiting on STDIN). Always use `npm run aegis -- ast:search <pat> [dir]` or `aegis ast:search`. Headless background commands must never wait on STDIN.
5. **Autonomous Post-Verification Push**: When running an autonomous workflow, goal, or `/tw` teamwork session, once all tasks and quality gates (`cage:check` + unit tests) pass 100%, Aegis MUST automatically commit staged changes and push to GitHub remote (`npm run aegis -- push` or `git push origin master`) rather than leaving completed work unpushed as local commits.

## Phase Boundary Gate (Zero Premature Coding)
Whenever the user requests planning, research, architectural analysis, or issue creation:
1. **Phase 0 - Research & Grounding**: Use NotebookLM / `/grill-me` / doc tools. Strictly NO implementation code edits or source file changes.
2. **Phase 1 - Repository & Wiki Blueprint**: Establish repository structure, README, and GitHub Wiki documentation based on research synthesis.
3. **Phase 2 - Issue Decomposition**: Decompose the plan into atomic, well-specified GitHub Issues / Aegis task files (`.aegis/prompts/`).
4. **Phase 3 - Isolated Implementation**: Implementation code is ONLY written after Phase 2 is validated, exclusively within isolated worktrees (`HakeGame-solver`, `experimental/solver`).

## Aegis Meta-Reflex Protocol (Recursive Self-Improvement)
Whenever the user or agent proposes an improvement, feature, toolchain gap, or architectural feedback concerning Aegis itself (regardless of the active project workspace):
1. **Zero-Prompt Upstream Detection**: The agent must recognize that the feedback targets the central Aegis engine (`frkntlr/aegis`).
2. **Autonomous Discussion & RFC Sync**: Automatically publish an RFC and GitHub Discussion under `Ideas` on `frkntlr/aegis` (`npm run aegis -- rfc:create "<title>" [desc]`). Never leave engine feedback lost in local conversation context!
3. **Traceability**: Link the originating project context or prompt in the published RFC.

## Antigravity Subagent Teamwork Protocol (`/aegis teamwork`, `/teamwork`, `/tw`, `/tr`, `/aegis-tw`)
When the user sends `/tw`, `/tr`, `/aegis-tw`, `/aegis teamwork`, `/aegist teamwork`, `/aegis tr`, `/aegist tr`, standard `/teamwork`, or requests multi-agent teamwork:
1. **Immediate Team Lead Role & Zero Direct Execution**: The agent immediately adopts the Team Lead role.
   - 🚨 **STRICT PROHIBITION**: Team Lead is STRICTLY FORBIDDEN from directly modifying source code, editing files, or doing sequential development in the main conversation thread! Doing work directly in the main thread completely defeats the user's multi-agent mandate.
   - All implementation, testing, UI polish, and deep analysis MUST be executed exclusively by concurrently invoked subagents (`invoke_subagent`).
2. **Plan & Stage**: Run `aegis teamwork plan "<objective>" [targetFiles]` or call MCP `teamwork_plan`. This decomposes the goal into atomic tracks (`issue-solver`, `qa-hunter`, `ui-specialist`, `doc-architect`), acquires file mutex locks, and stages tracks into .aegis/task-inbox.json.
3. **Print Live Task Matrix**: Immediately render the initial markdown table in chat showing which subagents are running (`🔄 Çalışıyor`), their locked files, models, and task titles.
4. **Register & Concurrently Invoke All Active Wave 1 Subagents**:
   - Register roles via `define_subagent` if not already defined for this session (`EnableSubagentTools: true`, `EnableWriteTools: true`, `EnableMCPTools: true`).
   - IN THE VERY SAME TURN as printing the matrix, call `invoke_subagent` for ALL Wave 1 tracks SIMULTANEOUSLY!
   - Cease calling further tools in that turn to allow Antigravity to spin up and display all subagents executing in parallel in the user interface.
   - Hybrid model allocation:
     - `issue-solver`: `Model: 'inherit'`
     - `qa-hunter`: `Model: 'inherit'`
     - `ui-specialist`: `Model: 'inherit'`
     - `doc-architect`: `Model: 'flash'`
5. **Role Specialization & Intelligent Aegis Tool Arsenal**:
   - `ui-specialist` (`🎨 [UI SPECIALIST]`): Designated primary owner of Godot UI scenes (`.tscn`), Themes (`.tres`), and presentation scripts (`.gd`). Uses `godot ui:lint`, `aegis godot inspect` (`aegis_godot_inspect_ui`), `godot ui:scaffold`, `aegis godot tree` (`GodotSceneSlicer` zero-token TSS with `--focus`/`--depth`), and `aegis_godot_signals`.
   - `issue-solver` (`🛠️ [ISSUE SOLVER]`): Focuses strictly on core logic, algorithms, state engines, and domain models, avoiding UI file lock collisions. Uses 5-layer Codebase Memory (`find_symbol`, `memory_query`), AST search/replace (`ast_search`, `ast_replace`), relational trace (`trace_relational`), official docs (`context7_query`), and Socratic debugging (`socratic_diagnose`).
   - `qa-hunter` (`🎯 [QA HUNTER]`): Runs headless playtests with RFC-051 ephemeral port sharding and track isolation (`aegis godot playtest --track=qa-hunter`), UI layout sweeps (`aegis godot inspect`), evidence-based bug triage (`triage`), Demir Kafes audits (`cage_check`), RTK output compression (`rtk_compress`), and mutation/oracle trust verification (`mutate`, `audit`).
   - `doc-architect` (`📚 [DOC ARCHITECT]`): Maintains living wiki (`wiki_sync`), living architecture blueprints & reports (`teamwork_doc_synthesize` / `aegis tw:doc`, `aegis tw:report`), NotebookLM grounding (`nlm:query`, `nlm:research`), and RFC lifecycle (`rfc:create`, `rfc:decompose`).
6. **Autonomous Subagent Execution & Resilient Error Protocol**: Subagents pull tasks via `aegis task:pull [role]` or MCP `task_inbox_pull`, edit code under Demir Kafes rules (<300 lines/file, <40 lines/function), and validate with `aegis verify:task` or `aegis test` / `aegis test:offline`. If tests fail, subagents run `aegis triage` or `aegis debug` for Socratic diagnosis (max 2 surgical fix attempts; never hang or loop indefinitely). If unresolvable, subagents report `[ROLE_FAILED: <role>] <reason>` and release locks (`aegis task:release <role> blocked "<reason>"`). On success, subagents report `[ROLE_COMPLETE: <role>]`.
7. **Live Progress Reporting & Graceful Lock Release**:
   - As each subagent message arrives, Team Lead receives a reactive wakeup.
   - On `[ROLE_COMPLETE: <role>]`, Team Lead marks `✅ Tamamlandı` and releases lock via `aegis task:release <id> done`.
   - On `[ROLE_FAILED: <role>]`, Team Lead marks `🛑 Başarısız / Hata`, releases file locks immediately, unblocks diagnostic QA tracks, and avoids indefinite hangs.
8. **Final Consolidation**: Once all tracks complete, Team Lead triggers `aegis tw:report [planId] --compact` (or `--save`) for sub-10ms ground-truth metrics (<120 tokens) and presents the final consolidated review card with Demir Kafes and test verification status.
9. **Hyper-Scale Concurrency & Dynamic Scaling (`--max-agents`, `--scale`)**:
   - When an objective involves multiple components, sentences, or files, or when the user invokes `--max-agents=<n>` / `--scale`:
   - Teamwork automatically shards work across up to 12 parallel, conflict-free subagents with 100% disjoint file locks.
   - Multiple issue-solvers (`issue-solver [ModuleA]`, `issue-solver [ModuleB]`) and UI specialists run concurrently in Phase 1 (Wave 1), accelerating completion without lock contention.
10. **Autonomous Post-Task Remote Push**: Once all tracks complete and the multimodal quality gate (`cage:check` + monorepo unit tests) passes 100%, Team Lead automatically commits remaining staged assets and pushes to the tracking remote branch (`npm run aegis -- push` or `$env:GIT_TERMINAL_PROMPT=0; git push origin master`). Never leave completed and verified work unpushed as orphaned local commits.
11. **Hierarchical Recursive Subagent Trees (Child Subagents)**:
   - When registering subagents via `define_subagent`, ALWAYS set `EnableSubagentTools: true`.
   - Subagents (e.g. `qa-hunter`, `issue-solver`, `ui-specialist`) are empowered and instructed to spawn their own child subagents (e.g. 4 concurrent testing agents under `qa-hunter`: playtest, ui-sweep, ast-audit, mutation) when their task covers multiple files or deep verification.
12. **Automatic Dynamic Agent Allocation**:
   - The user NEVER needs to specify the number of subagents manually. Aegis autonomously evaluates task complexity, scope, and domain radius via `TaskComplexityAnalyzer` (bilingual TR/EN radar) and automatically shards the task across 1 to 12 concurrent subagents with 100% disjoint locks.

## Godot 4 UI Architecture & Engineering Protocol (Demir Kafes for UI)
When editing, scaffolding, or polishing Godot UI:
1. **Container-First Layout**: Always wrap UI elements inside responsive containers (`MarginContainer`, `PanelContainer`, `VBoxContainer`, `HBoxContainer`, `GridContainer`, `ScrollContainer`). Never hardcode manual pixel positions or offsets on container children.
2. **Responsive Anchors**: Full-screen root UI (`Control`, `CanvasLayer`) must define `anchors_preset = 15` (Full Rect) with `grow_horizontal = 2, grow_vertical = 2`.
3. **Touch Targets**: Interactive controls (`Button`, `CheckButton`, `Slider`) must maintain a minimum touch target size of 44x44px (`custom_minimum_size = Vector2(44, 44)`).
4. **Theme & StyleBoxes**: Consolidate visuals into `.tres` Theme resources using `StyleBoxFlat` (margins, corner radius, borders, background colors).
5. **Decoupled Controllers**: UI GDScript controllers must extend `Control` or `CanvasLayer`, reference nodes via unique names (`%NodeName`) or clean typed paths, and emit custom signals (`signal start_pressed`) rather than directly mutating business models.
6. **Pre-PR Static Verification**: Run `aegis godot ui:lint <scene.tscn>` and verify 100/100 score before releasing UI tasks.

## Code Quality Standards (Demir Kafes)
All code modifications in this project must strictly comply with:
1. Max 300 lines per source file.
2. Max 40 lines per function.
3. Surgical unified diffs only.
4. Pre-commit test pass is mandatory.
