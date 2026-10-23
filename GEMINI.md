# Aegis Autonomous Vibe Coding Engine Rules

## `/aegis` Slash Command Protocol
When the user sends `/aegis` or `/aegis <subcommand>`, immediately interpret and execute the corresponding Aegis CLI command in PowerShell:

- `/aegis` or `/aegis status`: Run `npm run aegis -- status` and display worktrees and file locks.
- `/aegis auto`: Run `npm run aegis -- auto` and report autonomous task claims.
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

## Headless Git & Remote Execution Safeguards
To prevent indefinite command hangs during git remote operations:
1. **Non-Interactive Flag**: Always prefix git network calls with `$env:GIT_TERMINAL_PROMPT=0` (or set in session). Git must fail fast rather than hanging on credential/passphrase prompts.
2. **No Background Remote Hangs**: Remote operations (`git push`, `git fetch`, `git clone`) must NEVER run as indefinite background daemons. Use finite timeout (e.g. `WaitMsBeforeAsync: 10000`).
3. **No Direct Master Push Without Auth Pre-check**: Verify `gh auth status` or remote connectivity before pushing. Direct pushes to `master`/`main` without verification or user consent are strictly forbidden.

## Phase Boundary Gate (Zero Premature Coding)
Whenever the user requests planning, research, architectural analysis, or issue creation:
1. **Phase 0 - Research & Grounding**: Use NotebookLM / `/grill-me` / doc tools. Strictly NO implementation code edits or source file changes.
2. **Phase 1 - Repository & Wiki Blueprint**: Establish repository structure, README, and GitHub Wiki documentation based on research synthesis.
3. **Phase 2 - Issue Decomposition**: Decompose the plan into atomic, well-specified GitHub Issues / Aegis task files (`.aegis/prompts/`).
4. **Phase 3 - Isolated Implementation**: Implementation code is ONLY written after Phase 2 is validated, exclusively within isolated worktrees (`HakeGame-solver`, `experimental/solver`).

## Code Quality Standards (Demir Kafes)
All code modifications in this project must strictly comply with:
1. Max 300 lines per source file.
2. Max 40 lines per function.
3. Surgical unified diffs only.
4. Pre-commit test pass is mandatory.
