# Aegis Autonomous Vibe Coding Engine Rules

## `/aegis` Slash Command Protocol
When the user sends `/aegis` or `/aegis <subcommand>`, immediately interpret and execute the corresponding Aegis CLI command in PowerShell:

- `/aegis` or `/aegis status`: Run `npm run aegis -- status` and display worktrees and file locks.
- `/aegis auto`: Run `npm run aegis -- auto` and report autonomous task claims.
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
- `/aegis godot <subcmd>`: Godot Bridge: status, inspect, validate, query, run.
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
3. **No Direct Master Push Without Auth Pre-check**: Verify `gh auth status` or remote connectivity before pushing. Direct pushes to `master`/`main` without verification or user consent are strictly forbidden.
4. **Anti-Hang & STDIN Safeguard**: NEVER run `npx ast-grep` (outdated 2018 package that hangs waiting on STDIN). Always use `npm run aegis -- ast:search <pat> [dir]` or `aegis ast:search`. Headless background commands must never wait on STDIN.

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

## Code Quality Standards (Demir Kafes)
All code modifications in this project must strictly comply with:
1. Max 300 lines per source file.
2. Max 40 lines per function.
3. Surgical unified diffs only.
4. Pre-commit test pass is mandatory.
