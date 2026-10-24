import { DiagnosticCategory, ClarificationOption } from './types.js';

const CATEGORY_OPTIONS: Record<DiagnosticCategory, ClarificationOption[]> = {
  [DiagnosticCategory.PERFORMANCE]: [
    { id: 'perf-1', label: 'Adaptive timeout stagnation (>60s)', hypothesisKey: 'STAGNATION' },
    { id: 'perf-2', label: 'AST parser memory leak in large monorepo', hypothesisKey: 'AST_MEMORY' }
  ],
  [DiagnosticCategory.GIT_COLLISION]: [
    { id: 'git-1', label: 'Stale file lock from abandoned agent run', hypothesisKey: 'ORPHAN_LOCK' },
    { id: 'git-2', label: 'Concurrent worktree branch rebase mismatch', hypothesisKey: 'REBASE_DESYNC' }
  ],
  [DiagnosticCategory.CAGE_VIOLATION]: [
    { id: 'cage-1', label: 'Single function exceeding 40 lines limit', hypothesisKey: 'FUNCTION_OVERFLOW' },
    { id: 'cage-2', label: 'Full file rewrite attempted instead of diff', hypothesisKey: 'REWRITE_VIOLATION' }
  ],
  [DiagnosticCategory.GODOT_ENGINE]: [
    { id: 'godot-1', label: 'UI bounding box collision or viewport boundary clipping', hypothesisKey: 'GODOT_UI_CLIPPING' },
    { id: 'godot-2', label: 'GDScript ClassDB symbol mismatch or undeclared signal', hypothesisKey: 'GODOT_CLASSSDB_MISMATCH' }
  ],
  [DiagnosticCategory.MUTATION_GAP]: [
    { id: 'mut-1', label: 'Surviving mutant escaped existing assertion suite (<70%)', hypothesisKey: 'MUTATION_SURVIVOR' },
    { id: 'mut-2', label: 'Tautological or vacuous assertion bypassing testing gate', hypothesisKey: 'VACUOUS_ASSERTION' }
  ],
  [DiagnosticCategory.MCP_SECURITY]: [
    { id: 'mcp-1', label: 'Autonomous agent attempted blocked destructive MCP tool', hypothesisKey: 'TOOL_UNAUTHORIZED' },
    { id: 'mcp-2', label: 'Agent burst requests exceeded per-minute MCP tool rate quota', hypothesisKey: 'RATE_LIMIT_EXCEEDED' }
  ],
  [DiagnosticCategory.UNKNOWN]: [
    { id: 'unk-1', label: 'General configuration syntax failure', hypothesisKey: 'SYNTAX_CONFIG' },
    { id: 'unk-2', label: 'Unknown runtime unhandled rejection', hypothesisKey: 'UNHANDLED_CRASH' }
  ]
};

export class SymptomClassifier {
  public static classify(input: string): DiagnosticCategory {
    const text = input.toLowerCase();
    if (text.includes('godot') || text.includes('gdscript') || text.includes('tscn') || text.includes('tres') || text.includes('aspect') || text.includes('classdb')) {
      return DiagnosticCategory.GODOT_ENGINE;
    }
    if (text.includes('mutation') || text.includes('mutant') || text.includes('survived') || text.includes('kill score')) {
      return DiagnosticCategory.MUTATION_GAP;
    }
    if (text.includes('mcp') || text.includes('unauthorized') || text.includes('destructive tool') || text.includes('tool rate')) {
      return DiagnosticCategory.MCP_SECURITY;
    }
    if (text.includes('slow') || text.includes('latency') || text.includes('timeout') || text.includes('cpu')) {
      return DiagnosticCategory.PERFORMANCE;
    }
    if (text.includes('git') || text.includes('lock') || text.includes('conflict') || text.includes('worktree')) {
      return DiagnosticCategory.GIT_COLLISION;
    }
    if (text.includes('cage') || text.includes('demir kafes') || text.includes('complexity') || text.includes('line limit') || text.includes('function') || text.includes('file length')) {
      return DiagnosticCategory.CAGE_VIOLATION;
    }
    return DiagnosticCategory.UNKNOWN;
  }

  public static getClarificationOptions(category: DiagnosticCategory): ClarificationOption[] {
    return CATEGORY_OPTIONS[category] || CATEGORY_OPTIONS[DiagnosticCategory.UNKNOWN];
  }
}
