import { DiagnosticCategory, ClarificationOption } from './types.js';

export class SymptomClassifier {
  public static classify(input: string): DiagnosticCategory {
    const text = input.toLowerCase();
    if (text.includes('slow') || text.includes('latency') || text.includes('timeout') || text.includes('cpu')) {
      return DiagnosticCategory.PERFORMANCE;
    }
    if (text.includes('git') || text.includes('lock') || text.includes('conflict') || text.includes('worktree')) {
      return DiagnosticCategory.GIT_COLLISION;
    }
    if (text.includes('cage') || text.includes('line') || text.includes('function') || text.includes('file')) {
      return DiagnosticCategory.CAGE_VIOLATION;
    }
    return DiagnosticCategory.UNKNOWN;
  }

  public static getClarificationOptions(category: DiagnosticCategory): ClarificationOption[] {
    switch (category) {
      case DiagnosticCategory.PERFORMANCE:
        return [
          { id: 'perf-1', label: 'Adaptive timeout stagnation (>60s)', hypothesisKey: 'STAGNATION' },
          { id: 'perf-2', label: 'AST parser memory leak in large monorepo', hypothesisKey: 'AST_MEMORY' }
        ];
      case DiagnosticCategory.GIT_COLLISION:
        return [
          { id: 'git-1', label: 'Stale file lock from abandoned agent run', hypothesisKey: 'ORPHAN_LOCK' },
          { id: 'git-2', label: 'Concurrent worktree branch rebase mismatch', hypothesisKey: 'REBASE_DESYNC' }
        ];
      case DiagnosticCategory.CAGE_VIOLATION:
        return [
          { id: 'cage-1', label: 'Single function exceeding 40 lines limit', hypothesisKey: 'FUNCTION_OVERFLOW' },
          { id: 'cage-2', label: 'Full file rewrite attempted instead of diff', hypothesisKey: 'REWRITE_VIOLATION' }
        ];
      default:
        return [
          { id: 'unk-1', label: 'General configuration syntax failure', hypothesisKey: 'SYNTAX_CONFIG' },
          { id: 'unk-2', label: 'Unknown runtime unhandled rejection', hypothesisKey: 'UNHANDLED_CRASH' }
        ];
    }
  }
}
