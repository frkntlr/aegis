/**
 * @file language-constitution.ts
 * Language-specific rules and multi-ecosystem constitution generation.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

function appendGodotRules(targetFiles: string[], lines: string[]): void {
  if (!targetFiles.some(f => /\.(gd|tscn)$/i.test(f))) return;
  lines.push(
    '',
    'Godot 4 Clean Component Architecture:',
    "- Decouple nodes; use Signals for upward parent communication (no Direct $'../' coupling).",
    '- Strictly typed GDScript: explicit parameter types and explicit return types required.',
    '- Prevent resource/node leaks: all instantiated nodes must be added to tree or freed.'
  );
}

function appendTypeScriptRules(targetFiles: string[], lines: string[]): void {
  if (!targetFiles.some(f => /\.[jt]sx?$/i.test(f))) return;
  lines.push(
    '',
    'TypeScript Clean Domain Architecture:',
    "- Zero 'any' types: use strict domain types or unknown with type narrowing (TS_001).",
    '- Zero empty catches: swallowing exceptions without comments or handling is prohibited (TS_002).',
    '- Max nesting depth <= 4: refactor deeply nested conditionals with guard clauses (TS_003).'
  );
}

function appendDotNetRules(targetFiles: string[], lines: string[]): void {
  if (!targetFiles.some(f => /\.(cs|xaml)$/i.test(f))) return;
  lines.push(
    '',
    '.NET & Windows Desktop Clean Architecture:',
    '- File-scoped namespaces preferred (C# 10+); 1 public type per file.',
    '- Async/Await hygiene: Always return Task/ValueTask; avoid async void except UI events.',
    '- Resource safety: Use using declarations or IDisposable pattern for native/stream handles.'
  );
}

function appendLinuxRules(targetFiles: string[], lines: string[]): void {
  if (!targetFiles.some(f => /\.(sh|bash)$/i.test(f))) return;
  lines.push(
    '',
    'Linux System & Shell Robust Execution:',
    '- Strict error mode: Always specify set -euo pipefail in scripts.',
    '- Quote variable expansions ("$var") to avoid globbing and word splitting.',
    '- Deterministic exit codes: Explicit exit 0 on clean completion and standard POSIX codes.'
  );
}

export function generateLanguageConstitution(targetFiles: string[]): string {
  const baseLines = [
    'Demir Kafes Constitution:',
    '1. Max 300 lines per source file.',
    '2. Max 40 lines per function.',
    '3. Surgical unified diffs only.',
    '4. Pre-commit test pass mandatory.',
    '5. Anti-Hallucination: NEVER invent non-existent APIs or imports. Verify symbols via aegis find.'
  ];
  appendGodotRules(targetFiles, baseLines);
  appendTypeScriptRules(targetFiles, baseLines);
  appendDotNetRules(targetFiles, baseLines);
  appendLinuxRules(targetFiles, baseLines);
  return baseLines.join('\n');
}
