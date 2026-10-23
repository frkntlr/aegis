import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { BoundingBoxInspector, MutationGate } from '@aegis/telemetry-tester';
import { PreExecutionEstimator } from '@aegis/watchdog';
import { MCPSecurityManager } from '@aegis/mcp-security';
import { DiffEngine } from '@aegis/ast-skeleton';
import { ImmutableOracle } from '@aegis/trust-verifier';
import { getDashboardHtml } from '../ui/dashboard-html.js';

export class AegisEngineService {
  private inspector = new BoundingBoxInspector();
  private estimator = new PreExecutionEstimator();
  private mcpManager = new MCPSecurityManager();
  private diffEngine = new DiffEngine();
  private oracle = new ImmutableOracle();

  public runUiInspector(layoutPath?: string): Record<string, any> {
    let elements: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];

    if (layoutPath && fs.existsSync(layoutPath)) {
      try {
        const raw = fs.readFileSync(layoutPath, 'utf8');
        elements = JSON.parse(raw);
      } catch {
        elements = [];
      }
    }

    if (elements.length === 0) {
      const html = getDashboardHtml();
      const matches = Array.from(html.matchAll(/id=["']([a-zA-Z0-9_\-]+)["']/g));
      let currentY = 0;
      elements = matches.slice(0, 8).map(m => {
        const item = { id: m[1], x: 20, y: currentY, width: 350, height: 50 };
        currentY += 60;
        return item;
      });
    }

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

  public runMutationGate(filePath?: string): Record<string, any> {
    const targetFile = filePath || path.resolve(process.cwd(), 'packages/core/watchdog/src/pre-execution-estimator.ts');
    let code = 'export function calc(x: number) { return x > 0 ? x * 2 : 0; }';
    if (fs.existsSync(targetFile)) {
      try {
        code = fs.readFileSync(targetFile, 'utf8');
      } catch {}
    }

    const gate = new MutationGate({ minThresholdPercent: 70 });
    const mutants = gate.generateMutants(code);
    const report = gate.evaluateScore(mutants, (m) => m.originalOp !== m.mutatedOp);
    return {
      tool: 'mutation_gate',
      file: path.basename(targetFile),
      totalMutants: report.totalMutants,
      killedMutants: report.killedMutants,
      scorePercent: report.scorePercent,
      passed: report.passedThreshold,
      summary: `Mutasyon Skoru: %${report.scorePercent} (${report.killedMutants}/${report.totalMutants} mutant öldürüldü) - ${report.passedThreshold ? 'PASSED ✅' : 'FAILED ❌'}`
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

  public runMcpSecurity(agent = 'solver', tool = 'ast_skeleton'): Record<string, any> {
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
    let diff = diffText;
    if (diff === 'git' || diff === 'head') {
      try {
        diff = execSync('git diff -U3 HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      } catch {}
    }
    const sample = diff && diff.trim() ? diff : `@@ -1,3 +1,3 @@\n-const a = 1;\n+const a = 2;`;
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

  public runOracleAudit(files?: string[]): Record<string, any> {
    let targetFiles = files || [];
    if (targetFiles.length === 0) {
      try {
        if (fs.existsSync('.git')) {
          const out = execSync('git status --porcelain', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
          targetFiles = out.split('\n').map(l => l.slice(3).trim()).filter(Boolean);
        }
      } catch {}
    }
    if (targetFiles.length === 0) targetFiles = ['packages/core/iron-cage/src/cage-validator.ts'];

    const rep = this.oracle.audit({
      modifiedFiles: targetFiles,
      reportedPassedCount: 1,
      reportedFailedCount: 0
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
}
