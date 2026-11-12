# Teamwork performance and grounding validation

Validated locally on Windows, 2026-11-12, with three native Codex workers and
root integration review. Orchestra run: `4a75ff07-6aaf-4588-be53-b1853caab273`.
Both clients retain their respective dispatch schemas; Antigravity execution
was covered by payload and compatibility tests, not an Antigravity live session.

## Repeatable integrated measurement

Run `npm run build`, then `node scripts/benchmark-teamwork.cjs`.
The benchmark creates and removes a temporary 24-file TypeScript project,
generates seven deterministic tracks and reports the median of 15 warm planning
calls after one warmup. It excludes native agent startup and model inference.

| Metric | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Median warm plan | 7.582 ms | 2.258 ms | 70.2% |
| Antigravity prompt bytes | 175,816 | 74,559 | 57.6% |
| Codex message bytes | 152,264 | 73,252 | 51.9% |
| Serialized plan bytes | 521,637 | 232,987 | 55.3% |

Timing is machine/fixture dependent. Byte counts describe this fixture and
retain scopes, dependencies and verification instructions. Smaller context is
not a measured claim about model accuracy or end-to-end response latency.
Raw measurements are in `.aegis/tw-optimize-baseline.json` and
`.aegis/tw-optimize-after.json` in this checkout.

## Changes and practical limits

- Canonical path aliases share AST work. Source stamps include change time and
  inode as well as modification time and size; callers cannot mutate cached reports.
- Target and upstream sections each include up to eight distinct files, with
  bounded excerpts. Omitted files and members are explicitly identified as
  incomplete evidence. Agents must inspect current signatures before edits,
  particularly after upstream work changes a planned snapshot.
- Read/extraction failures and directories are marked unavailable, rather than
  incorrectly declared missing files to create.
- Repeated tool catalogues and unconditional recursive agent instructions were
  removed from both client prompts. Delegation depends on actual tools/capacity.
- Disk discovery snapshots expire after ten seconds even if Git's index is
  unchanged. Deleted discovered files are filtered immediately; explicit new-file
  targets remain permitted. New untracked files may be absent for up to ten seconds.
  On a separate 300-file fixture, freshness checks added about 0.18 ms per warm
  analysis (median 0.0672 to 0.2439 ms); this is a correctness tradeoff.
- Bootstrap runs once per coordinator, with retries after failure and explicit
  refresh still available. A normal constructor-plus-staging path went from two
  bootstrap calls to one.
- Inbox numeric IDs are allocated above existing IDs while holding the inbox
  mutex. Repeated plans no longer reuse an old task's numeric identifier.

On the worker's 24-file/48-alias grounding fixture, AST extractions fell from 48
to 8 and context characters from 65,318 to 11,374. The lower extraction count
includes both alias deduplication and the explicit eight-file grounding budget.

## Verification

`npm run build`, `npm run typecheck` and `npm test` passed. The full test report
contains 1,096 passing tests with zero failures; unchanged Turbo tasks reused
cached results. All 13 affected TypeScript source/test files passed
`aegis verify:task`. Regressions cover cache freshness, restored-mtime edits,
partial evidence, unavailable files, bounded client prompts, bootstrap retries
and repeated-plan inbox ID collisions.

These controls reduce avoidable stale or invented context; they do not guarantee
that an AI model cannot hallucinate. Source review and test evidence remain
required for completion.
