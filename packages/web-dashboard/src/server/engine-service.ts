import * as path from 'node:path';
import { BoundingBoxInspector, runFileMutationTest } from '@aegis/telemetry-tester';
import { PreExecutionEstimator } from '@aegis/watchdog';
import { MCPSecurityManager } from '@aegis/mcp-security';
import { DiffEngine } from '@aegis/ast-skeleton';
import { ImmutableOracle } from '@aegis/trust-verifier';
import { EngineAnalysisTools } from './engine-analysis-tools.js';
import {
  collectAuditTestContents,
  findUncontainedAuditPath,
  getGitModifiedFiles,
  loadAuditTestReport,
  loadTelemetryLayout,
  readGitDiffHead
} from './engine-gate-helpers.js';
import { requireExistingRepoRoot, resolveContainedPath } from './path-containment.js';

export interface AdaptiveTimeoutReport {
  tool: string;
  timeoutSeconds: number;
  confidence: string;
  reasoning: string;
  summary: string;
}

export class AegisEngineService {
  private inspector = new BoundingBoxInspector();
  private estimator = new PreExecutionEstimator();
  private mcpManager = new MCPSecurityManager();
  private diffEngine = new DiffEngine();
  private oracle = new ImmutableOracle();
  private analysisTools: EngineAnalysisTools;
  private readonly repoRoot?: string;

  constructor(repoRoot?: string) {
    this.repoRoot = repoRoot;
    this.analysisTools = new EngineAnalysisTools(repoRoot);
  }

  public runUiInspector(layoutPath?: string): Record<string, unknown> {
    const loaded = loadTelemetryLayout(layoutPath, this.repoRoot);
    if (loaded.elements.length === 0) {
      return {
        tool: 'ui_inspector',
        elementsChecked: 0,
        visionTokens: 0,
        overlapsCount: 0,
        passed: false,
        unavailable: true,
        reason: 'No usable UI telemetry found (.aegis/ui_telemetry.json). Capture runtime telemetry before inspection.',
        summary: 'UI Telemetrisi Bulunamadı: .aegis/ui_telemetry.json eksik veya boş ❌'
      };
    }

    const vp = loaded.viewport || { width: 390, height: 844, name: 'Mobile 390x844' };
    const report = this.inspector.inspectLayout(loaded.elements, {
      width: vp.width,
      height: vp.height,
      name: vp.name || `${vp.width}x${vp.height}`
    });
    return {
      tool: 'ui_inspector',
      elementsChecked: report.elementsScanned,
      visionTokens: report.tokenCost,
      overlapsCount: report.violations.length,
      passed: report.passed,
      summary: report.passed ? '0 Görsel Taşma / 0 Token Harcandı ✅' : 'Çakışma Tespit Edildi ❌'
    };
  }

  private failMutationGate(file: string, reason: string, summary: string): Record<string, unknown> {
    return {
      tool: 'mutation_gate',
      file,
      totalMutants: 0,
      sampledMutants: 0,
      killedMutants: 0,
      survivedMutants: 0,
      skippedCompileErrors: 0,
      scorePercent: 0,
      baselinePassed: false,
      passed: false,
      unavailable: true,
      reason,
      survivors: [],
      summary
    };
  }

  public runMutationGate(filePath?: string): Record<string, unknown> {
    if (filePath !== undefined && !filePath.trim()) {
      return this.failMutationGate('', 'No target file specified.', 'Mutasyon Kapısı Reddedildi: Hedef dosya belirtilmedi ❌');
    }
    const rootRes = requireExistingRepoRoot(this.repoRoot);
    if (!rootRes.ok) {
      return this.failMutationGate(filePath?.trim() || '', rootRes.reason, `Mutasyon Kapısı Engellendi: ${rootRes.reason} ❌`);
    }
    const targetInput = filePath?.trim() || 'packages/core/watchdog/src/pre-execution-estimator.ts';
    const contained = resolveContainedPath(rootRes.root, targetInput, { allowNonExistent: false });
    if (!contained.ok) {
      return this.failMutationGate(path.basename(targetInput), contained.reason, `Mutasyon Kapısı Engellendi: ${contained.reason} ❌`);
    }
    const relTarget = path.relative(rootRes.root, contained.realPath);
    const report = runFileMutationTest({ filePath: relTarget, repoRoot: rootRes.root, thresholdPercent: 70 });
    return {
      tool: 'mutation_gate',
      file: path.basename(report.filePath),
      totalMutants: report.totalMutants,
      sampledMutants: report.sampledMutants,
      killedMutants: report.killedMutants,
      survivedMutants: report.survivedMutants,
      skippedCompileErrors: report.skippedCompileErrors,
      scorePercent: report.scorePercent,
      baselinePassed: report.baselinePassed,
      passed: report.passedThreshold,
      reason: report.reason,
      survivors: report.survivors,
      summary: `Mutasyon Skoru: %${report.scorePercent} (${report.killedMutants}/${report.sampledMutants} örneklenen mutant öldürüldü) - ${report.passedThreshold ? 'PASSED ✅' : 'FAILED ❌'}`
    };
  }

  public runAdaptiveTimeout(files = 2, tests = 4): AdaptiveTimeoutReport {
    const est = this.estimator.estimate({
      blastRadiusFiles: files,
      affectedTestCount: tests,
      dependencyDepth: 1
    });
    return {
      tool: 'adaptive_timeout',
      timeoutSeconds: est.calculatedTimeoutSeconds,
      confidence: est.confidence,
      reasoning: est.reasoning,
      summary: `Dinamik Süre: ${est.calculatedTimeoutSeconds}s (${est.confidence.toUpperCase()})`
    };
  }

  public runMcpSecurity(agent = 'solver', tool = 'ast_skeleton'): Record<string, unknown> {
    const auth = this.mcpManager.authorizeToolCall(agent, tool);
    return {
      tool: 'mcp_security',
      agent,
      requestedTool: tool,
      allowed: auth.allowed,
      reason: auth.reason,
      summary: auth.allowed ? `[${agent}] için "${tool}" yetkilendirildi ✅` : `Engellendi: ${auth.reason} ⛔`
    };
  }

  public async runDiffValidator(diffText?: string): Promise<Record<string, unknown>> {
    if (diffText !== undefined && !diffText.trim()) {
      return {
        tool: 'diff_validator',
        isSurgical: false,
        addedLines: 0,
        deletedLines: 0,
        rejectionReason: 'Empty diff supplied.',
        summary: 'Diff Reddedildi: Boş diff ❌'
      };
    }

    let diff = diffText;
    if (diff === undefined || diff === 'git' || diff === 'head') {
      const gitRes = await readGitDiffHead(this.repoRoot);
      if (gitRes.error || !gitRes.diff.trim()) {
        const reason = gitRes.error || 'No uncommitted git diff found against HEAD.';
        return {
          tool: 'diff_validator',
          isSurgical: false,
          addedLines: 0,
          deletedLines: 0,
          rejectionReason: reason,
          summary: `Diff Reddedildi: ${reason} ❌`
        };
      }
      diff = gitRes.diff;
    }

    const res = this.diffEngine.parseAndValidate(diff);
    return {
      tool: 'diff_validator',
      isSurgical: res.isSurgical,
      addedLines: res.addedLinesCount,
      deletedLines: res.deletedLinesCount,
      rejectionReason: res.rejectionReason,
      summary: res.isSurgical ? `Cerrahi Diff Onaylandı (+${res.addedLinesCount} / -${res.deletedLinesCount}) ✅` : `Diff Reddedildi: ${res.rejectionReason} ❌`
    };
  }

  public async runOracleAudit(files?: string[]): Promise<Record<string, unknown>> {
    const rootRes = requireExistingRepoRoot(this.repoRoot);
    if (!rootRes.ok) {
      return { tool: 'immutable_oracle', filesAudited: 0, verdict: 'UNAVAILABLE', suspicious: false, details: [rootRes.reason], summary: 'Oracle Güven Denetimi: UNAVAILABLE (Geçersiz repo kökü) ⚠️' };
    }
    const repoRoot = rootRes.root;
    const targetFiles = files !== undefined
      ? files.map(f => f.trim()).filter(Boolean)
      : await getGitModifiedFiles(repoRoot);
    if (targetFiles.length === 0) {
      return { tool: 'immutable_oracle', filesAudited: 0, verdict: 'UNAVAILABLE', suspicious: false, details: ['No modified files supplied or detected.'], summary: 'Oracle Güven Denetimi: UNAVAILABLE (Değişen dosya yok) ⚠️' };
    }
    const badPath = findUncontainedAuditPath(targetFiles, repoRoot);
    if (badPath) {
      return { tool: 'immutable_oracle', filesAudited: targetFiles.length, verdict: 'REJECTED', suspicious: true, details: [`Path containment violation: ${badPath}`], summary: 'Oracle Güven Denetimi: REJECTED (Sınır dışı dosya yolu ⚠️)' };
    }
    const testReport = loadAuditTestReport(repoRoot);
    const testContents = collectAuditTestContents(targetFiles, repoRoot);
    if (testReport.failedCount === 0 && (!testReport.found || testReport.passedCount <= 0 || testContents.length === 0)) {
      return { tool: 'immutable_oracle', filesAudited: targetFiles.length, verdict: 'MANUAL_REVIEW_REQUIRED', suspicious: true, details: ['Incomplete test evidence (require executed passing test report and companion test files).'], summary: 'Oracle Güven Denetimi: MANUAL_REVIEW_REQUIRED (Eksik test kanıtı ⚠️)' };
    }
    const rep = this.oracle.audit({
      modifiedFiles: targetFiles,
      testContents,
      reportedPassedCount: testReport.passedCount,
      reportedFailedCount: testReport.failedCount
    });
    return {
      tool: 'immutable_oracle',
      filesAudited: targetFiles.length,
      verdict: rep.verdict,
      suspicious: rep.suspicious,
      details: rep.details,
      summary: `Oracle Güven Denetimi: ${rep.verdict} (Şüpheli Test: ${rep.suspicious ? 'EVET ⚠️' : 'HAYIR ✅'})`
    };
  }

  public runCageCheck(dir?: string): Record<string, unknown> {
    return this.analysisTools.runCageCheck(dir);
  }

  public runBugTriage(dir?: string): Record<string, unknown> {
    return this.analysisTools.runBugTriage(dir);
  }

  public runSymbolFind(query?: string): Record<string, unknown> {
    return this.analysisTools.runSymbolFind(query);
  }

  public runRelationalTrace(target?: string): Record<string, unknown> {
    return this.analysisTools.runRelationalTrace(target);
  }

  public runMemoryQuery(symbol?: string, worktreeId?: string): Record<string, unknown> {
    return this.analysisTools.runMemoryQuery(symbol, worktreeId);
  }

  public runMemoryStats(worktreeId?: string): Record<string, unknown> {
    return this.analysisTools.runMemoryStats(worktreeId);
  }

  public runAstSearch(pattern?: string, targetDir?: string): Record<string, unknown> {
    return this.analysisTools.runAstSearch(pattern, targetDir);
  }

  public runRtkCompress(text?: string): Record<string, unknown> {
    return this.analysisTools.runRtkCompress(text);
  }

  public runContext7Query(library?: string, topic?: string): Record<string, unknown> {
    return this.analysisTools.runContext7Query(library, topic);
  }
}
