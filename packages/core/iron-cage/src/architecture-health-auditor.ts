import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { CageViolation } from '@aegis/shared';
import { AntiSpaghettiValidator, type AntiSpaghettiOptions } from './anti-spaghetti-rules.js';
import { LineBudgetRadar, type LineBudgetAnalysis } from './line-budget-radar.js';
import {
  collectProductionTsFiles,
  extractEdges,
  findCyclesInGraph,
  toPosix
} from './import-cycle-detector.js';

export type DecompositionPrescriptionPattern =
  | 'BREAK_RUNTIME_CYCLE'
  | 'EXTRACT_PREDICATE_TABLE'
  | 'OPTIONS_OBJECT_REFACTOR'
  | 'FACADE_DELEGATION';

export interface DecompositionPrescription {
  pattern: DecompositionPrescriptionPattern;
  target: string;
  summary: string;
}

export interface ArchitectureHealthSummary {
  scannedFiles: number;
  runtimeCycleCount: number;
  typeOnlyCycleCount: number;
  complexityViolations: number;
  cognitiveViolations: number;
  paramViolations: number;
  godClassViolations: number;
  fanOutViolations: number;
  budgetPressureFiles: number;
  healthScore: number;
}

export interface ArchitectureHealthReport {
  targetDir: string;
  healthScore: number;
  summary: ArchitectureHealthSummary;
  runtimeCycles: string[][];
  typeOnlyCycles: string[][];
  violations: CageViolation[];
  budgetPressure: LineBudgetAnalysis[];
  prescriptions: DecompositionPrescription[];
}

interface AuditAccumulator {
  targetDir: string;
  scannedFiles: number;
  runtimeGraph: Map<string, string[]>;
  fullGraph: Map<string, string[]>;
  violations: CageViolation[];
  budgetPressure: LineBudgetAnalysis[];
}

const STRICT_DEFAULTS: Required<AntiSpaghettiOptions> = {
  maxCyclomaticComplexity: 15,
  maxCognitiveComplexity: 18,
  maxParams: 5,
  maxClassMethods: 12,
  maxFileImports: 10
};

function computeHealthScore(summary: Omit<ArchitectureHealthSummary, 'healthScore'>): number {
  const runtimePenalty = summary.runtimeCycleCount * 15;
  const scale = Math.max(1, summary.scannedFiles / 20);
  const rawStructural =
    summary.complexityViolations * 5 +
    summary.cognitiveViolations * 4 +
    summary.godClassViolations * 5 +
    summary.fanOutViolations * 4 +
    summary.paramViolations * 3 +
    summary.typeOnlyCycleCount * 2 +
    summary.budgetPressureFiles * 2;
  const structuralPenalty = Math.round(rawStructural / scale);
  return Math.max(0, Math.min(100, 100 - runtimePenalty - structuralPenalty));
}

function buildPrescriptions(
  runtimeCycles: string[][],
  violations: CageViolation[],
  budgetPressure: LineBudgetAnalysis[]
): DecompositionPrescription[] {
  const rx: DecompositionPrescription[] = runtimeCycles.map((c) => {
    const chain = c.join(' -> ');
    return {
      pattern: 'BREAK_RUNTIME_CYCLE',
      target: chain,
      summary: `Break runtime import cycle (${chain}) by extracting shared contracts or inverting dependency.`
    };
  });
  for (const v of violations) {
    const target = v.line ? `${v.filePath}:${v.line}` : v.filePath;
    if (v.rule === 'CYCLOMATIC_COMPLEXITY' || v.rule === 'ARCH_003_COGNITIVE_COMPLEXITY') {
      rx.push({ pattern: 'EXTRACT_PREDICATE_TABLE', target, summary: v.message });
    } else if (v.rule === 'TS_004_MAX_PARAMS') {
      rx.push({ pattern: 'OPTIONS_OBJECT_REFACTOR', target, summary: v.message });
    } else if (v.rule === 'TS_005_GOD_CLASS' || v.rule === 'ARCH_001_HIGH_FAN_OUT') {
      rx.push({ pattern: 'FACADE_DELEGATION', target, summary: v.message });
    }
  }
  for (const bp of budgetPressure) {
    rx.push({
      pattern: 'FACADE_DELEGATION',
      target: bp.filePath,
      summary: `File has ${bp.fileLines}/${bp.maxFileLines} lines (${bp.status}). Extract helper module before hitting ceiling.`
    });
  }
  return rx;
}

export class ArchitectureHealthAuditor {
  public auditDirectory(
    targetDir: string,
    options: Partial<AntiSpaghettiOptions> = {}
  ): ArchitectureHealthReport {
    const resolvedRoot = path.resolve(targetDir);
    const absFiles = collectProductionTsFiles(resolvedRoot);
    const absToRel = new Map(absFiles.map((f) => [f, toPosix(path.relative(resolvedRoot, f))]));
    const validator = new AntiSpaghettiValidator({ ...STRICT_DEFAULTS, ...options });

    const acc: AuditAccumulator = {
      targetDir: resolvedRoot,
      scannedFiles: absFiles.length,
      runtimeGraph: new Map(),
      fullGraph: new Map(),
      violations: [],
      budgetPressure: []
    };

    for (const absPath of absFiles) {
      const relPath = absToRel.get(absPath) ?? toPosix(absPath);
      const content = fs.readFileSync(absPath, 'utf8');
      const sf = ts.createSourceFile(relPath, content, ts.ScriptTarget.Latest, true);
      const edges = extractEdges(sf, absPath, absToRel);
      acc.runtimeGraph.set(relPath, edges.runtime);
      acc.fullGraph.set(relPath, edges.full);
      acc.violations.push(...validator.validateSourceFile(relPath, sf));
      const budget = LineBudgetRadar.analyze(relPath, content);
      if (budget.status !== 'SAFE') acc.budgetPressure.push(budget);
    }

    return this.assembleReport(acc);
  }

  private assembleReport(acc: AuditAccumulator): ArchitectureHealthReport {
    const runtimeCycles = findCyclesInGraph(acc.runtimeGraph);
    const runtimeKeys = new Set(runtimeCycles.map((c) => c.join(' -> ')));
    const typeOnlyCycles = findCyclesInGraph(acc.fullGraph).filter((c) => !runtimeKeys.has(c.join(' -> ')));

    const rawSummary = {
      scannedFiles: acc.scannedFiles,
      runtimeCycleCount: runtimeCycles.length,
      typeOnlyCycleCount: typeOnlyCycles.length,
      complexityViolations: acc.violations.filter((v) => v.rule === 'CYCLOMATIC_COMPLEXITY').length,
      cognitiveViolations: acc.violations.filter((v) => v.rule === 'ARCH_003_COGNITIVE_COMPLEXITY').length,
      paramViolations: acc.violations.filter((v) => v.rule === 'TS_004_MAX_PARAMS').length,
      godClassViolations: acc.violations.filter((v) => v.rule === 'TS_005_GOD_CLASS').length,
      fanOutViolations: acc.violations.filter((v) => v.rule === 'ARCH_001_HIGH_FAN_OUT').length,
      budgetPressureFiles: acc.budgetPressure.length
    };
    const healthScore = computeHealthScore(rawSummary);
    const prescriptions = buildPrescriptions(runtimeCycles, acc.violations, acc.budgetPressure);

    return {
      targetDir: acc.targetDir,
      healthScore,
      summary: { ...rawSummary, healthScore },
      runtimeCycles,
      typeOnlyCycles,
      violations: acc.violations,
      budgetPressure: acc.budgetPressure,
      prescriptions
    };
  }
}

export function formatArchitectureHealthReport(report: ArchitectureHealthReport): string {
  const s = report.summary;
  const lines = [
    `Architecture Health Report (${report.targetDir})`,
    `Health Score: ${report.healthScore}/100 | Files Scanned: ${s.scannedFiles}`,
    `Runtime Cycles: ${s.runtimeCycleCount} | Type-Only Cycles: ${s.typeOnlyCycleCount}`,
    `Violations -> Complexity: ${s.complexityViolations}, Cognitive: ${s.cognitiveViolations}, Params: ${s.paramViolations}, God Class: ${s.godClassViolations}, Fan-Out: ${s.fanOutViolations}`,
    `Budget Pressure (>=250 lines): ${s.budgetPressureFiles}`
  ];
  if (report.prescriptions.length > 0) {
    lines.push('Prescriptions:');
    for (const rx of report.prescriptions) {
      lines.push(`  - [${rx.pattern}] ${rx.target}: ${rx.summary}`);
    }
  }
  return lines.join('\n');
}
