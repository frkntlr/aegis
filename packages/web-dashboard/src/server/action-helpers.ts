import * as path from 'node:path';
import type { ProjectHub } from './project-hub.js';
import { type IdeLauncher, RoleClassifier } from '@aegis/orchestrator';
import { LoopBreaker } from '@aegis/watchdog';
import type { AegisEngineService } from './engine-service.js';
import type { SystemIssue } from './metrics-types.js';
import { isSafeIdentifier, requireExistingRepoRoot, resolveContainedPath } from './path-containment.js';

export type SupportedIde = 'Google Antigravity' | 'Cursor AI' | 'VS Code' | 'Universal IDE';
type EngineToolHandler = (svc: AegisEngineService, payload: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>;
export type HubActiveContext = ReturnType<ProjectHub['getActiveContext']>;

const ENGINE_TOOL_HANDLERS: Record<string, EngineToolHandler> = {
  ui_inspector: (svc, p) => svc.runUiInspector(p.layoutPath as string | undefined),
  mutation_gate: (svc, p) => svc.runMutationGate(p.filePath as string | undefined),
  adaptive_timeout: (svc, p) => ({ ...svc.runAdaptiveTimeout(Number(p.files ?? 2), Number(p.tests ?? 4)) }),
  mcp_security: (svc, p) => svc.runMcpSecurity(p.agent as string, p.mcpTool as string),
  diff_validator: (svc, p) => svc.runDiffValidator(p.diffText as string),
  immutable_oracle: (svc, p) => svc.runOracleAudit(p.files as string[]),
  oracle_audit: (svc, p) => svc.runOracleAudit(p.files as string[]),
  cage_check: (svc, p) => svc.runCageCheck(p.dir as string | undefined),
  bug_triage: (svc, p) => svc.runBugTriage(p.dir as string | undefined),
  symbol_find: (svc, p) => svc.runSymbolFind(p.query as string | undefined),
  relational_trace: (svc, p) => svc.runRelationalTrace(p.target as string | undefined),
  memory_query: (svc, p) => svc.runMemoryQuery(p.symbol as string | undefined, p.worktreeId as string | undefined),
  memory_stats: (svc, p) => svc.runMemoryStats(p.worktreeId as string | undefined),
  ast_search: (svc, p) => svc.runAstSearch(p.pattern as string | undefined, p.dir as string | undefined),
  rtk_compress: (svc, p) => svc.runRtkCompress(p.text as string | undefined),
  context7_query: (svc, p) => svc.runContext7Query(p.library as string | undefined, p.topic as string | undefined)
};

export const ALLOWED_IDES: ReadonlySet<string> = new Set<SupportedIde>([
  'Google Antigravity',
  'Cursor AI',
  'VS Code',
  'Universal IDE'
]);

export const IDE_SYNC_ACTIONS = new Set(['launch_ide', 'sync_toolchain', 'run_engine_tool', 'save_settings', 'update_settings']);

export async function handleCreateTask(hubCtx: HubActiveContext, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const issue = await hubCtx.metrics.createIssue((payload.title as string) || 'Yeni Görev', (payload.targetFiles as string[]) || []);
  return { success: true, message: `GitHub Görevi #${issue.number} oluşturuldu.`, issue };
}

export function assignTaskInProgress(
  ctx: HubActiveContext,
  issue: SystemIssue,
  payload: Record<string, unknown>,
  loopBreaker?: LoopBreaker
): Record<string, unknown> {
  const breaker = loopBreaker ?? new LoopBreaker();
  if (breaker.isBlocked(issue.number)) {
    return {
      success: false,
      message: `🛑 Görev #${issue.number} 3 başarısız deneme nedeniyle kilitlendi (Circuit Breaker aktif). Önce hatayı çözün veya kilidi kaldırın.`
    };
  }
  let agent = payload.agentName as string | undefined;
  if (!agent || agent === 'auto') {
    agent = new RoleClassifier().classify({ title: issue.title, targetFiles: issue.targetFiles }).role;
  } else if (typeof agent !== 'string' || !isSafeIdentifier(agent)) {
    return { success: false, message: 'Geçersiz ajan adı.' };
  }
  const ide = (payload.ideType as string) || 'Google Antigravity';
  const lockRes = ctx.wtManager.acquireFileLocks(agent, issue.targetFiles);
  if (!lockRes.success) {
    return { success: false, message: `Kilit çakışması: ${lockRes.conflictingFiles.join(', ')}` };
  }
  ctx.metrics.moveTask(issue.number, 'in_progress', agent, ide);
  return { success: true, message: `Görev #${issue.number} [@${agent}] (${ide}) atandı.` };
}

export function handleReleaseLocks(hubCtx: HubActiveContext, payload: Record<string, unknown>): Record<string, unknown> {
  const rawAgent = payload.agentName;
  if (rawAgent !== undefined && (typeof rawAgent !== 'string' || !isSafeIdentifier(rawAgent))) {
    return { success: false, error: 'Invalid agentName.' };
  }
  hubCtx.wtManager.releaseFileLocks((rawAgent as string) || 'solver');
  hubCtx.metrics.releaseIssueLocks(rawAgent as string | undefined);
  return { success: true, message: 'Kilitler boşaltıldı.' };
}

export function launchIdeAction(
  launcher: IdeLauncher,
  localPath: string,
  payload: Record<string, unknown>
): Record<string, unknown> {
  const rawIde = payload.ideType === undefined ? 'Google Antigravity' : payload.ideType;
  if (typeof rawIde !== 'string' || !ALLOWED_IDES.has(rawIde)) {
    return { success: false, message: 'Geçersiz IDE türü.' };
  }
  const rootRes = requireExistingRepoRoot(localPath);
  if (!rootRes.ok) return { success: false, message: rootRes.reason };
  const rawWt = payload.worktreePath === undefined ? path.join(rootRes.root, 'experimental', 'solver') : payload.worktreePath;
  if (typeof rawWt !== 'string') return { success: false, message: 'Geçersiz worktreePath.' };
  const wtRes = resolveContainedPath(rootRes.root, rawWt, { allowNonExistent: true });
  if (!wtRes.ok) return { success: false, message: wtRes.reason };
  let focusPath: string | undefined;
  if (payload.focusFile !== undefined) {
    if (typeof payload.focusFile !== 'string') return { success: false, message: 'Geçersiz focusFile.' };
    const inWt = resolveContainedPath(wtRes.realPath, payload.focusFile, { allowNonExistent: true });
    if (!inWt.ok) return { success: false, message: inWt.reason };
    const inRoot = resolveContainedPath(rootRes.root, inWt.realPath, { allowNonExistent: true });
    if (!inRoot.ok) return { success: false, message: inRoot.reason };
    focusPath = inWt.realPath;
  }
  const res = launcher.launchIde({ ideType: rawIde as SupportedIde, worktreePath: wtRes.realPath, focusFile: focusPath });
  return { success: res.success, command: res.command, message: res.message, pid: res.pid };
}

export async function runEngineToolAction(
  engineSvc: AegisEngineService,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const t = payload.tool;
  const handler = typeof t === 'string' && Object.hasOwn(ENGINE_TOOL_HANDLERS, t)
    ? ENGINE_TOOL_HANDLERS[t]
    : undefined;
  if (!handler) {
    return { success: false, error: 'Bilinmeyen araç: ' + t, message: 'Bilinmeyen araç: ' + t };
  }
  const res = await handler(engineSvc, payload);
  return { success: true, result: res, message: (res.summary as string) || 'Motor aracı çalıştırıldı.' };
}
