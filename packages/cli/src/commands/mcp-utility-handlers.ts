/**
 * @file mcp-utility-handlers.ts
 * Leaf handlers for Socratic diagnostics, Context7, RTK, worktrees, and engine updates.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { Context7Bridge } from '@aegis/github-live';
import { RTKTokenKiller } from '@aegis/watchdog';
import { PolyglotStackTraceParser, SymptomClassifier, SymbioticDiagnosticTriangulator, DynamicHypothesisGenerator } from '@aegis/dialogue-engine';
import { WorktreeManager, EngineUpdater } from '@aegis/orchestrator';

type UtilityToolHandler = (args: Record<string, unknown>) => string;

function handleSocraticDiagnose(args: Record<string, unknown>): string {
  const rawLog = String(args.rawLog || '');
  const parsed = new PolyglotStackTraceParser().parse(rawLog);
  const category = SymptomClassifier.classify(rawLog);
  let boundaryOpt: ReturnType<typeof SymbioticDiagnosticTriangulator.toClarificationOption> | undefined;
  if (args.callSiteCode && args.library && args.symbol) {
    const diag = SymbioticDiagnosticTriangulator.triangulate({
      callSiteCode: String(args.callSiteCode),
      contract: {
        library: String(args.library),
        symbol: String(args.symbol),
        expectedSignature: args.expectedSignature ? String(args.expectedSignature) : undefined,
        isDeprecated: Boolean(args.isDeprecated),
        deprecationNotice: args.deprecationNotice ? String(args.deprecationNotice) : undefined
      },
      runtimeError: rawLog
    });
    boundaryOpt = SymbioticDiagnosticTriangulator.toClarificationOption(diag);
  }
  const options = DynamicHypothesisGenerator.generate(category, undefined, undefined, boundaryOpt);
  return JSON.stringify({ category, evidence: parsed, clarificationOptions: options }, null, 2);
}

function handleWorktreeStatusTool(): string {
  const wm = new WorktreeManager({ persistLocks: true });
  const list = wm.listWorktrees();
  const locks = Object.fromEntries(wm.getLockedFiles().entries());
  return JSON.stringify({ worktrees: list.worktrees, lockedFiles: locks, activeCount: list.activeCount }, null, 2);
}

const UTILITY_TOOL_HANDLERS: Record<string, UtilityToolHandler> = {
  socratic_diagnose: handleSocraticDiagnose,
  context7_query: (args) => JSON.stringify(new Context7Bridge().query(String(args.library || ''), String(args.topic || '')), null, 2),
  rtk_compress: (args) => {
    const c = RTKTokenKiller.compress(String(args.text || ''));
    return JSON.stringify({ savings: c.tokenSavingsPercent, text: c.compressedText }, null, 2);
  },
  worktree_status: () => handleWorktreeStatusTool(),
  engine_update: (args) => JSON.stringify(EngineUpdater.runUpdate({ clean: args.clean === true, pull: args.pull === true, force: args.force === true }), null, 2),
  version_status: () => JSON.stringify(EngineUpdater.getVersionReport(), null, 2)
};

export function executeUtilityTool(name: string, args: Record<string, unknown>): string {
  const handler = UTILITY_TOOL_HANDLERS[name];
  if (handler) return handler(args);
  return JSON.stringify({ error: `Unknown tool: ${name}` });
}
