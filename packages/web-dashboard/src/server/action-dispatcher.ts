import * as path from 'node:path';
import type { ProjectHub } from './project-hub.js';
import type { IdeLauncher, UniversalToolchainSync } from '@aegis/orchestrator';
import { RoleClassifier } from '@aegis/orchestrator';
import { LoopBreaker, type OrphanTaskReclaimer } from '@aegis/watchdog';
import type { AegisEngineService } from './engine-service.js';
import type { SystemIssue } from './metrics-types.js';
import { isSafeIdentifier, requireExistingRepoRoot, resolveContainedPath } from './path-containment.js';

type SupportedIde = 'Google Antigravity' | 'Cursor AI' | 'VS Code' | 'Universal IDE';
type EngineToolHandler = (svc: AegisEngineService, payload: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>;

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
const ALLOWED_IDES: ReadonlySet<string> = new Set<SupportedIde>([
  'Google Antigravity',
  'Cursor AI',
  'VS Code',
  'Universal IDE'
]);
const IDE_SYNC_ACTIONS = new Set(['launch_ide', 'sync_toolchain', 'run_engine_tool', 'save_settings', 'update_settings']);

type HubActiveContext = ReturnType<ProjectHub['getActiveContext']>;

async function handleCreateTask(hubCtx: HubActiveContext, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const issue = await hubCtx.metrics.createIssue((payload.title as string) || 'Yeni Görev', (payload.targetFiles as string[]) || []);
  return { success: true, message: `GitHub Görevi #${issue.number} oluşturuldu.`, issue };
}

function assignTaskInProgress(
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

function handleReleaseLocks(hubCtx: HubActiveContext, payload: Record<string, unknown>): Record<string, unknown> {
  const rawAgent = payload.agentName;
  if (rawAgent !== undefined && (typeof rawAgent !== 'string' || !isSafeIdentifier(rawAgent))) {
    return { success: false, error: 'Invalid agentName.' };
  }
  hubCtx.wtManager.releaseFileLocks((rawAgent as string) || 'solver');
  hubCtx.metrics.releaseIssueLocks(rawAgent as string | undefined);
  return { success: true, message: 'Kilitler boşaltıldı.' };
}

export interface ActionDispatcherContext {
  hub: ProjectHub;
  launcher: IdeLauncher;
  toolchainSync: UniversalToolchainSync;
  engineSvc: AegisEngineService;
  orphanReclaimer: OrphanTaskReclaimer;
  loopBreaker?: LoopBreaker;
  broadcast: (event: string, payload: unknown) => void;
}

export class ActionDispatcher {
  constructor(private ctx: ActionDispatcherContext) {}

  private handleProjectAndSync(action: string, payload: Record<string, unknown>): Record<string, unknown> | null {
    if (action === 'switch_project') {
      const res = this.ctx.hub.switchProject(payload.projectId as string);
      this.ctx.broadcast('context_switched', res);
      return { success: true, ...res };
    }
    if (action === 'focus_project') {
      if (typeof payload.workspacePath !== 'string' || !payload.workspacePath.trim()) {
        return { success: false, error: 'Invalid workspacePath: expected non-empty string.' };
      }
      const res = this.ctx.hub.handleFocus(payload.workspacePath);
      if (res.switched) this.ctx.broadcast('context_switched', res);
      return { success: true, ...res };
    }
    if (action === 'loop_status') {
      const breaker = this.ctx.loopBreaker ?? new LoopBreaker();
      const records = Array.from(breaker.getAllRecords().entries()).map(([num, r]) => ({
        number: num, attempts: r.attempts, blocked: r.blocked, lastError: r.lastError
      }));
      return { success: true, records, blocked: breaker.getBlockedIssues() };
    }
    if (action === 'loop_reset') {
      const breaker = this.ctx.loopBreaker ?? new LoopBreaker();
      const num = payload.issueNumber ? parseInt(String(payload.issueNumber), 10) : undefined;
      breaker.reset(num);
      return { success: true, message: num ? `Görev #${num} sıfırlandı.` : 'Tüm devre kesici sayaçları sıfırlandı.' };
    }
    return null;
  }

  private async handleSyncGitHub(hubCtx: ReturnType<ProjectHub['getActiveContext']>): Promise<Record<string, unknown>> {
    const issues = await hubCtx.metrics.fetchLiveIssues();
    this.handleReclaimOrphans();
    return {
      success: true,
      issues: hubCtx.metrics.getIssues(),
      status: hubCtx.metrics.getGitHubStatus(),
      message: `GitHub senkronize edildi: ${issues.length} görev güncellendi.`
    };
  }

  public async executeAction(action: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const hubRes = this.handleProjectAndSync(action, payload);
    if (hubRes) return hubRes;
    if (IDE_SYNC_ACTIONS.has(action)) return this.handleIdeAndSync(action, payload);

    const directMap: Record<string, () => Record<string, unknown>> = {
      auto: () => this.handleAutoAction(),
      move_task: () => this.handleMoveTask(payload),
      reclaim_orphans: () => this.handleReclaimOrphans(),
      complete_task: () => this.handleMoveTask({ issueNumber: payload.issueNumber, targetStatus: 'done' })
    };
    const directHandler = Object.hasOwn(directMap, action) ? directMap[action] : undefined;
    if (directHandler) return directHandler();

    const hubCtx = this.ctx.hub.getActiveContext();
    if (action === 'sync_github') return this.handleSyncGitHub(hubCtx);
    if (action === 'create_task') return handleCreateTask(hubCtx, payload);
    if (action === 'release_locks') return handleReleaseLocks(hubCtx, payload);
    return { success: false, error: 'Bilinmeyen aksiyon: ' + action };
  }

  private handleMoveTask(payload: Record<string, unknown>): Record<string, unknown> {
    const ctx = this.ctx.hub.getActiveContext();
    const num = parseInt(String(payload.issueNumber), 10);
    const targetStatus = payload.targetStatus as SystemIssue['status'];
    const issue = ctx.metrics.getIssues().find(i => i.number === num);
    if (!issue) return { success: false, message: `Görev #${num} bulunamadı.` };

    if (targetStatus === 'in_progress') {
      return assignTaskInProgress(ctx, issue, payload, this.ctx.loopBreaker);
    }

    if (targetStatus === 'done' || targetStatus === 'ready') {
      if (issue.assignedAgent) ctx.wtManager.releaseFileLocks(issue.assignedAgent);
    }
    ctx.metrics.moveTask(num, targetStatus);
    return { success: true, message: `Görev #${num} '${targetStatus}' sütununa alındı.` };
  }

  private handleAutoAction(): Record<string, unknown> {
    const ctx = this.ctx.hub.getActiveContext();
    const breaker = this.ctx.loopBreaker ?? new LoopBreaker();
    const ready = ctx.metrics.getIssues().filter(i => i.status === 'ready' && !breaker.isBlocked(i.number));
    if (ready.length === 0) {
      const blocked = ctx.metrics.getIssues().filter(i => i.status === 'ready' && breaker.isBlocked(i.number));
      if (blocked.length > 0) {
        return { success: false, message: `🛑 Ready havuzundaki ${blocked.length} görev 3 başarısız deneme limitine ulaştığı için kilitlendi (Circuit Breaker aktif).` };
      }
      return { success: true, message: 'Ready sütununda bekleyen görev yok.' };
    }
    const sessions = ctx.detector.detectSessions();
    const target = ready[0];
    const inf = new RoleClassifier().classify({ title: target.title, targetFiles: target.targetFiles });
    const idle = sessions.find(s => s.agentName === inf.role && s.status === 'idle') || sessions.find(s => s.status === 'idle') || sessions[0];
    const agentName = idle?.agentName || inf.role || 'solver';
    const ideType = idle?.ideType || 'Google Antigravity';
    const lockRes = ctx.wtManager.acquireFileLocks(agentName, target.targetFiles);
    if (!lockRes.success) {
      return { success: false, message: `Kilit çakışması: ${lockRes.conflictingFiles.join(', ')}` };
    }
    ctx.metrics.assignIssue(target.number, agentName, ideType);
    return { success: true, message: `Görev #${target.number} [@${agentName}] (${ideType}) atandı.` };
  }

  private handleLaunchIde(localPath: string, payload: Record<string, unknown>): Record<string, unknown> {
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
    const res = this.ctx.launcher.launchIde({
      ideType: rawIde as SupportedIde,
      worktreePath: wtRes.realPath,
      focusFile: focusPath
    });
    return { success: res.success, command: res.command, message: res.message, pid: res.pid };
  }

  private async handleIdeAndSync(action: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const ctx = this.ctx.hub.getActiveContext();
    if (action === 'launch_ide') return this.handleLaunchIde(ctx.localPath, payload);
    if (action === 'sync_toolchain') {
      const rep = this.ctx.toolchainSync.syncAll();
      return { success: rep.success, report: rep, message: `Toolchain senkronize edildi: ${rep.syncedIdes.join(', ')}` };
    }
    if (action === 'run_engine_tool') {
      return this.handleRunEngineTool(payload);
    }
    const s = ctx.metrics.updateSettings((payload.settings || payload) as Record<string, unknown>);
    return { success: true, settings: s, message: `Ayarlar kaydedildi (Ana Dal: ${s.primaryBranch || 'master'}).` };
  }

  private async handleRunEngineTool(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const t = payload.tool;
    const handler = typeof t === 'string' && Object.hasOwn(ENGINE_TOOL_HANDLERS, t)
      ? ENGINE_TOOL_HANDLERS[t]
      : undefined;
    if (!handler) {
      return { success: false, error: 'Bilinmeyen araç: ' + t, message: 'Bilinmeyen araç: ' + t };
    }
    const res = await handler(this.ctx.engineSvc, payload);
    return { success: true, result: res, message: (res.summary as string) || 'Motor aracı çalıştırıldı.' };
  }

  private handleReclaimOrphans(): Record<string, unknown> {
    const ctx = this.ctx.hub.getActiveContext();
    const issues = ctx.metrics.getIssues();
    const locks = ctx.wtManager.getLockedFiles();
    const sessions = ctx.detector.detectSessions();
    const { reclaimed } = this.ctx.orphanReclaimer.scanAndReclaim(issues, locks, sessions);
    for (const r of reclaimed) {
      ctx.metrics.moveTask(r.issueNumber, 'ready');
      if (r.previousAgent) ctx.wtManager.releaseFileLocks(r.previousAgent);
    }
    const msg = reclaimed.length > 0
      ? `${reclaimed.length} adet asılı görev kurtarılarak 'Ready' sütununa devredildi.`
      : 'Tüm görevler tutarlı. Asılı veya yetim görev yok.';
    return { success: true, count: reclaimed.length, reclaimed, message: msg };
  }
}
