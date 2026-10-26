import * as fs from 'node:fs';
import {
  DialogueEngine,
  DialogueSession,
  ClarificationOption
} from '@aegis/dialogue-engine';
import {
  CliEvidenceProvider,
  CliMemorySliceResolver,
  CliLineBudgetInspector,
  CliTaskDispatcher
} from '../adapters/index.js';
import { showBanner } from './banner.js';

export interface DebugCommandOptions {
  autoSelect?: boolean;
  selectedOptionIndex?: number;
  silent?: boolean;
  targetWorktree?: string;
}

export interface DebugCommandResult {
  session: DialogueSession;
  taskPrompt: string;
}

function resolveEvidenceInput(inputArg?: string): string {
  if (!inputArg) {
    return 'Error: Diagnostic session started without explicit error log. Polyglot parser awaiting trace.';
  }
  const trimmed = inputArg.trim();
  if (!trimmed.includes('\n') && fs.existsSync(trimmed)) {
    try {
      return fs.readFileSync(trimmed, 'utf8');
    } catch {
      return inputArg;
    }
  }
  return inputArg;
}

function printTurn1(session: DialogueSession): void {
  console.log(`\n🩺 [Turn 1: Symptom Triangulation]`);
  console.log(` • Session ID:    ${session.sessionId}`);
  console.log(` • Category:      ${session.category}`);
  console.log(` • Target File:   ${session.evidence?.filePath ?? 'Unknown'}:${session.evidence?.lineNumber ?? 0}`);
  console.log(` • Confidence:    ${Math.round((session.evidence?.confidenceScore ?? 0.5) * 100)}%`);
  console.log('\nOptions:');
  session.availableOptions.forEach((opt: ClarificationOption, idx: number) => {
    console.log(`   [${idx + 1}] [${opt.id}] ${opt.label}`);
    if (opt.microProbeCommand) console.log(`       Micro-Probe: ${opt.microProbeCommand}`);
  });
}

function printTurn2(session: DialogueSession): void {
  console.log(`\n🔬 [Turn 2: Falsifiable Prescription]`);
  const rx = session.prescription;
  if (rx) {
    console.log(` • Title:         ${rx.title}`);
    console.log(` • Root Cause:    ${rx.rootCause}`);
    if (rx.microProbeCommand) {
      console.log(` • Micro-Probe:   ${rx.microProbeCommand}`);
    }
  }
  if (session.budgetReport) {
    const b = session.budgetReport;
    console.log(` • Line Budget:   ${b.currentLines}/${b.maxLines} (Remaining: ${b.remainingLines})`);
    if (b.mustDecompose || rx?.mustDecompose) {
      console.log(` ⚠️  Mandate:      Decomposition-First Refactoring required!`);
    }
  }
}

function printTurn3(session: DialogueSession, filePath?: string): void {
  console.log(`\n📋 [Turn 3: Armored Resolution]`);
  console.log(` • Status:        ${session.isResolved ? 'RESOLVED ✅' : 'PENDING ⏳'}`);
  if (filePath) {
    console.log(` • Dispatched:    ${filePath}`);
  }
}

export async function handleDebugCommand(
  inputArg?: string,
  options: DebugCommandOptions = {}
): Promise<DebugCommandResult> {
  if (!options.silent) showBanner();
  const rawEvidence = resolveEvidenceInput(inputArg);

  const taskDispatcher = new CliTaskDispatcher();
  const engine = new DialogueEngine({
    evidenceProvider: new CliEvidenceProvider(),
    memoryResolver: new CliMemorySliceResolver(),
    budgetInspector: new CliLineBudgetInspector(),
    taskDispatcher
  });

  const session = await engine.startSessionWithEvidence(rawEvidence);
  if (!options.silent) printTurn1(session);

  const chosenIdx = options.selectedOptionIndex ?? 0;
  const chosenOpt = session.availableOptions[chosenIdx] || session.availableOptions[0];
  if (chosenOpt) {
    engine.chooseClarification(session.sessionId, chosenOpt.id);
  }
  if (!options.silent) printTurn2(session);

  engine.confirmAndResolve(session.sessionId, true);
  const taskPrompt = engine.exportTask(session.sessionId);

  const dispatchRes = await taskDispatcher.dispatchTask(taskPrompt, {
    targetWorktree: options.targetWorktree || 'solver',
    lockLabels: session.evidence?.filePath ? [session.evidence.filePath] : []
  });

  if (!options.silent) printTurn3(session, dispatchRes.filePathCreated);

  return { session, taskPrompt };
}
