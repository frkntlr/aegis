import { DiagnosticCategory, PrescriptionPlan, ClarificationOption, DialogueSession } from './types.js';
import { ArmoredPrescriptionBuilder } from './armored-prescription-builder.js';

const DEFAULT_PLANS: Record<string, PrescriptionPlan> = {
  STAGNATION: {
    title: 'Resolve Adaptive Timeout Stagnation',
    rootCause: 'Process did not produce output for over 60 seconds during testing.',
    steps: ['Enable stream output chunking in test runner.', 'Inject heartbeat event in watch loop.'],
    acceptanceCriteria: ['Process watchdog resets timer upon stream chunk reception.', 'Unit test validates 60s stagnation termination triggers cleanly.'],
    targetWorktree: 'experimental/solver',
    lockLabels: ['packages/core/watchdog/src/watchdog.ts']
  },
  ORPHAN_LOCK: {
    title: 'Reclaim Orphaned Git Worktree Locks',
    rootCause: 'Dead session left persistent locks in .aegis/locks without releasing.',
    steps: ['Run aegis auto or invoke OrphanTaskReclaimer.', 'Clear stale lock references from active locks manifest.'],
    acceptanceCriteria: ['Active locks list decrements to 0 when agent disconnects.', 'Sibling worktrees resume execution immediately.'],
    targetWorktree: 'experimental/solver',
    lockLabels: ['packages/core/orchestrator/src/file-lock-manager.ts']
  },
  FUNCTION_OVERFLOW: {
    title: 'Refactor Function Exceeding 40-Line Iron Cage Limit',
    rootCause: 'Method length breached deterministic Demir Kafes boundary.',
    steps: ['Decompose monolithic handler into 2 focused subroutines.', 'Verify surgical diff format and run cage:check.'],
    acceptanceCriteria: ['All modified functions have <= 40 lines.', 'Existing unit tests pass with zero regression.'],
    targetWorktree: 'experimental/solver',
    lockLabels: ['packages/core/iron-cage/src/cage-validator.ts']
  },
  GODOT_UI_CLIPPING: {
    title: 'Resolve Godot UI Collision or Viewport Boundary Clipping',
    rootCause: 'Control elements overlap or overflow screen dimensions across mobile aspect ratios.',
    steps: [
      'Run aegis godot inspect to identify colliding node IDs and target aspect ratios.',
      'Adjust Control anchor presets, minimum size, or wrap within MarginContainer / VBoxContainer.',
      'Re-run zero-token UI inspection across 16:9, 21:9, 16:10, and 9:16 portrait ratios.'
    ],
    acceptanceCriteria: [
      'Zero overlapping interactive controls on the same plane.',
      'All interactive elements fit inside viewport bounds without clipping.',
      'aegis godot inspect reports 100% PASS across configured ratios.'
    ],
    targetWorktree: 'experimental/qa',
    lockLabels: ['scenes/Main.tscn', 'addons/aegis_bridge/ui_verifier.gd']
  },
  GODOT_CLASSSDB_MISMATCH: {
    title: 'Fix GDScript ClassDB Method or Signal Safety Mismatch',
    rootCause: 'GDScript invokes undeclared methods or emits unmapped signals on engine base class.',
    steps: [
      'Run aegis godot validate to pinpoint line numbers and invalid symbols.',
      'Consult ClassDB Oracle (aegis godot query <Class>) for canonical signatures.',
      'Ensure signals are explicitly declared or defined in Godot base class.'
    ],
    acceptanceCriteria: [
      'All method invocations exist in ClassDB inheritance tree.',
      'All emitted signals are valid in GDScriptRulesValidator.',
      'aegis godot validate returns 100% clean.'
    ],
    targetWorktree: 'experimental/solver',
    lockLabels: ['scripts/word_game.gd']
  },
  MUTATION_SURVIVOR: {
    title: 'Eliminate Surviving Mutants with Target Boundary Tests',
    rootCause: 'Changed code survived mutation operator without test failure.',
    steps: [
      'Run aegis mutate on changed files to locate exact surviving line numbers.',
      'Add dedicated unit test asserting exact boundary value and inverted branch condition.',
      'Re-run mutation gate to confirm mutation score >= 70%.'
    ],
    acceptanceCriteria: [
      'All generated mutants in changed lines are killed.',
      'Mutation gate reports >= 70% kill rate.',
      'All unit tests pass cleanly.'
    ],
    targetWorktree: 'experimental/solver',
    lockLabels: ['packages/plugins/telemetry-tester/src/mutation-gate.ts']
  },
  TOOL_UNAUTHORIZED: {
    title: 'Remediate MCP Tool Authorization and Rate Limits',
    rootCause: 'Agent attempted invocation of destructive or un-whitelisted MCP tool.',
    steps: [
      'Inspect agent role permissions against MCPSecurityManager allowlist.',
      'Ensure destructive tools require explicit human approval.',
      'Re-execute task within scoped agent boundary.'
    ],
    acceptanceCriteria: [
      'Only whitelisted tools are dispatched for role.',
      'Security audit passes with zero unauthorized rejections.',
      'MCPSecurityManager rate limits remain within threshold.'
    ],
    targetWorktree: 'experimental/solver',
    lockLabels: ['packages/core/mcp-security/src/mcp-security-manager.ts']
  }
};

export class PrescriptionBuilder {
  public static buildPlan(
    category: DiagnosticCategory,
    option: ClarificationOption,
    session?: DialogueSession
  ): PrescriptionPlan {
    if (session && (session.evidence || session.budgetReport || option.microProbeCommand)) {
      return buildArmoredSync(session, option);
    }
    return DEFAULT_PLANS[option.hypothesisKey] || buildFallbackPlan(category, option);
  }

  public static formatAegisTask(plan: PrescriptionPlan, sessionId: string): string {
    return ArmoredPrescriptionBuilder.formatTask(plan, sessionId);
  }
}

function buildArmoredSync(session: DialogueSession, option: ClarificationOption): PrescriptionPlan {
  const file = session.evidence?.filePath || 'src/index.ts';
  const remaining = session.budgetReport ? session.budgetReport.remainingLines : 50;
  const mustDecompose = session.budgetReport?.mustDecompose || remaining < 15;
  const targetWorktree = session.category === DiagnosticCategory.GODOT_ENGINE ? 'experimental/qa' : 'experimental/solver';
  const steps: string[] = [];

  if (mustDecompose) {
    steps.push(
      `Decompose subroutine in ${file} to sibling helper module to free up Demir Kafes line budget.`,
      `Apply surgical fix for ${option.hypothesisKey} in the extracted subroutine.`
    );
  } else {
    steps.push(`Apply surgical unified patch for ${option.hypothesisKey} in ${file}.`);
  }

  if (option.microProbeCommand) {
    steps.push(`Execute micro-probe verification: '${option.microProbeCommand}'.`);
  }
  steps.push('Run cage:check and verify 100% Iron Cage compliance.');

  return {
    title: `Remediate ${option.hypothesisKey}: ${option.label}`,
    rootCause: `Diagnosed ${option.label}.`,
    steps,
    acceptanceCriteria: [
      `Root defect for ${option.hypothesisKey} is resolved cleanly.`,
      `Compliance with Demir Kafes (max 40 lines/fn, max 300 lines/file).`
    ],
    targetWorktree,
    lockLabels: [file],
    mustDecompose,
    microProbeCommand: option.microProbeCommand
  };
}

function buildFallbackPlan(category: DiagnosticCategory, option: ClarificationOption): PrescriptionPlan {
  return {
    title: 'Remediate ' + category + ' Issue',
    rootCause: 'Diagnosed ' + option.label + ' in 3-turn interactive triage.',
    steps: ['Apply surgical patch.', 'Execute local pre-commit verification.'],
    acceptanceCriteria: ['All tests pass.', 'Demir Kafes 100% compliant.'],
    targetWorktree: 'experimental/solver',
    lockLabels: ['src/index.ts']
  };
}
