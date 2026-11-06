---
name: cage
description: >-
  Aegis Demir Kafes (Iron Cage) quality gate audit (/cage, /aegis cage:check).
  Scans all files for line limits (<300 lines/file, <40 lines/function) and strictly 0 any.
---

# Aegis Demir Kafes Gate (/cage, /aegis cage:check)

Use this skill whenever the user triggers `/cage` or requests Demir Kafes compliance verification.

## Commands
- `/cage` or `aegis cage:check`: Audit entire codebase or specified package against Demir Kafes rules.
- `aegis verify <file>`: Validate a single file against Demir Kafes limits.
- `aegis verify:task [file]`: Run multimodal quality gate (Demir Kafes + Godot Playtest).
