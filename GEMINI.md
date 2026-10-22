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

## Code Quality Standards (Demir Kafes)
All code modifications in this project must strictly comply with:
1. Max 300 lines per source file.
2. Max 40 lines per function.
3. Surgical unified diffs only.
4. Pre-commit test pass is mandatory.
