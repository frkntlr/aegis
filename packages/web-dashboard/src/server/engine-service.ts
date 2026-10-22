import { BoundingBoxInspector, MutationGate } from '@aegis/telemetry-tester';
import { PreExecutionEstimator } from '@aegis/watchdog';
import { MCPSecurityManager } from '@aegis/mcp-security';
import { DiffEngine } from '@aegis/ast-skeleton';
import { ImmutableOracle } from '@aegis/trust-verifier';

export class AegisEngineService {
  private inspector: BoundingBoxInspector;
  private estimator: PreExecutionEstimator;
  private mcpManager: MCPSecurityManager;
  private diffEngine: DiffEngine;
  private oracle: ImmutableOracle;

  constructor() {
    this.inspector = new BoundingBoxInspector();
    this.estimator = new PreExecutionEstimator();
    this.mcpManager = new MCPSecurityManager();
    this.diffEngine = new DiffEngine();
    this.oracle = new ImmutableOracle();
  }

  public runUiInspector(): Record<string, any> {
    const elements = [
      { id: 'top-nav', x: 0, y: 0, width: 390, height: 60 },
      { id: 'kanban-board', x: 0, y: 70, width: 390, height: 400 },
      { id: 'event-log', x: 10, y: 480, width: 370, height: 180 }
    ];
    const report = this.inspector.inspectLayout(elements, { width: 390, height: 844, name: 'Mobile 390x844' });
    return {
      tool: 'ui_inspector',
      elementsChecked: report.elementsScanned,
      visionTokens: report.tokenCost,
      overlapsCount: report.violations.length,
      passed: report.passed,
      summary: report.passed ? '0 Görsel Taşma / 0 Token Harcandı ✅' : 'Çakışma Tespit Edildi ❌'
    };
  }

  public runMutationGate(): Record<string, any> {
    const sampleCode = `export function calc(x: number) { if (x > 0) return x * 2; return 0; }`;
    const gate = new MutationGate({ minThresholdPercent: 70 });
    const mutants = gate.generateMutants(sampleCode);
    const report = gate.evaluateScore(mutants, () => true);
    return {
      tool: 'mutation_gate',
      totalMutants: report.totalMutants,
      killedMutants: report.killedMutants,
      scorePercent: report.scorePercent,
      passed: report.passedThreshold,
      summary: `Mutasyon Skoru: %${report.scorePercent} (Eşik: %70) - ${report.passedThreshold ? 'PASSED ✅' : 'FAILED ❌'}`
    };
  }

  public runAdaptiveTimeout(files = 2, tests = 4): Record<string, any> {
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

  public runMcpSecurity(agent = 'alice', tool = 'ast_skeleton'): Record<string, any> {
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

  public runDiffValidator(diffText?: string): Record<string, any> {
    const sample = diffText || `@@ -1,3 +1,3 @@\n-const a = 1;\n+const a = 2;`;
    const res = this.diffEngine.parseAndValidate(sample);
    return {
      tool: 'diff_validator',
      isSurgical: res.isSurgical,
      addedLines: res.addedLinesCount,
      deletedLines: res.deletedLinesCount,
      rejectionReason: res.rejectionReason,
      summary: res.isSurgical ? `Cerrahi Diff Onaylandı (+${res.addedLinesCount} / -${res.deletedLinesCount}) ✅` : `Diff Reddedildi: ${res.rejectionReason} ❌`
    };
  }

  public runOracleAudit(files: string[] = ['src/feature.ts']): Record<string, any> {
    const rep = this.oracle.audit({
      modifiedFiles: files,
      reportedPassedCount: 1,
      reportedFailedCount: 0
    });
    return {
      tool: 'immutable_oracle',
      verdict: rep.verdict,
      suspicious: rep.suspicious,
      details: rep.details,
      summary: `Oracle Güven Denetimi: ${rep.verdict} (Şüpheli Test: ${rep.suspicious ? 'EVET ⚠️' : 'HAYIR ✅'})`
    };
  }
}
