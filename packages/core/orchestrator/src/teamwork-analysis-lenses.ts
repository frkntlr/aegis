/**
 * @file teamwork-analysis-lenses.ts
 * Specialized concurrent analysis lenses for parallel codebase exploration.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  AnalysisInsight,
  LensExecutionResult
} from './teamwork-analysis-types.js';

export class AstStructuralLens {
  public static executeSync(repoRoot: string, files: string[]): LensExecutionResult {
    const start = Date.now();
    const insights: AnalysisInsight[] = [];
    const targets = files.filter(f => f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.gd'));

    for (const rel of targets.slice(0, 15)) {
      const full = path.join(repoRoot, rel);
      if (!fs.existsSync(full)) continue;
      try {
        const content = fs.readFileSync(full, 'utf8');
        const lines = content.split('\n').length;
        if (lines > 250) {
          insights.push({
            id: `ast-${rel}`, lens: 'ast', agent: 'ast-architect',
            category: 'bottleneck', severity: lines > 300 ? 'critical' : 'high',
            target: rel,
            finding: `File length is ${lines} lines, nearing or exceeding Demir Kafes limit of 300 lines.`,
            actionableStep: 'Refactor using Facade or Delegation pattern to shard responsibilities.',
            timestamp: new Date().toISOString()
          });
        }
      } catch { /* ignore read errors */ }
    }
    return { lens: 'ast', agent: 'ast-architect', durationMs: Date.now() - start, insights };
  }

  public static async execute(repoRoot: string, files: string[]): Promise<LensExecutionResult> {
    return this.executeSync(repoRoot, files);
  }
}

export class TriageHunterLens {
  public static executeSync(repoRoot: string, files: string[]): LensExecutionResult {
    const start = Date.now();
    const insights: AnalysisInsight[] = [];
    const sourceFiles = files.filter(f => !f.endsWith('.test.ts') && !f.endsWith('.spec.ts'));

    for (const rel of sourceFiles.slice(0, 15)) {
      const baseName = rel.replace(/\.[^/.]+$/, '');
      const testFile = `${baseName}.test.ts`;
      if (!files.includes(testFile) && !fs.existsSync(path.join(repoRoot, testFile))) {
        insights.push({
          id: `triage-${rel}`, lens: 'triage', agent: 'triage-hunter',
          category: 'flaw', severity: 'medium', target: rel,
          finding: `Missing companion test suite for source module: ${rel}`,
          actionableStep: `Generate companion test file \`${testFile}\` with unit assertions.`,
          timestamp: new Date().toISOString()
        });
      }
    }
    return { lens: 'triage', agent: 'triage-hunter', durationMs: Date.now() - start, insights };
  }

  public static async execute(repoRoot: string, files: string[]): Promise<LensExecutionResult> {
    return this.executeSync(repoRoot, files);
  }
}

export class RelationalMapperLens {
  public static executeSync(repoRoot: string, files: string[]): LensExecutionResult {
    const start = Date.now();
    const insights: AnalysisInsight[] = [];
    const importCounts: Record<string, number> = {};

    for (const rel of files.slice(0, 20)) {
      const full = path.join(repoRoot, rel);
      if (!fs.existsSync(full)) continue;
      try {
        const content = fs.readFileSync(full, 'utf8');
        const matches = content.match(/from\s+['"][^'"]+['"]/g) || [];
        importCounts[rel] = matches.length;
        if (matches.length > 10) {
          insights.push({
            id: `rel-${rel}`, lens: 'relation', agent: 'relational-mapper',
            category: 'coupling', severity: 'medium', target: rel,
            finding: `High architectural fan-out with ${matches.length} external imports.`,
            actionableStep: 'Extract shared submodules or unify import barrels.',
            timestamp: new Date().toISOString()
          });
        }
      } catch { /* ignore */ }
    }
    return { lens: 'relation', agent: 'relational-mapper', durationMs: Date.now() - start, insights };
  }

  public static async execute(repoRoot: string, files: string[]): Promise<LensExecutionResult> {
    return this.executeSync(repoRoot, files);
  }
}

export class GroundingMemoryLens {
  public static executeSync(repoRoot: string, objective: string): LensExecutionResult {
    const start = Date.now();
    const insights: AnalysisInsight[] = [];
    const rfcDir = path.join(repoRoot, 'docs', 'rfc');

    if (fs.existsSync(rfcDir)) {
      try {
        const rfcs = fs.readdirSync(rfcDir).filter(f => f.endsWith('.md'));
        const matched = rfcs.slice(-5);
        for (const rfc of matched) {
          insights.push({
            id: `ground-${rfc}`, lens: 'grounding', agent: 'living-grounder',
            category: 'contract', severity: 'info', target: `docs/rfc/${rfc}`,
            finding: `Active RFC architectural reference detected for objective: ${objective}`,
            actionableStep: 'Maintain backward compatibility with established RFC design patterns.',
            timestamp: new Date().toISOString()
          });
        }
      } catch { /* ignore */ }
    }
    return { lens: 'grounding', agent: 'living-grounder', durationMs: Date.now() - start, insights };
  }

  public static async execute(repoRoot: string, objective: string): Promise<LensExecutionResult> {
    return this.executeSync(repoRoot, objective);
  }
}
