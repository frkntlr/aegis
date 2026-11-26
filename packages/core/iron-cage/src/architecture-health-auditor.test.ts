import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ArchitectureHealthAuditor,
  formatArchitectureHealthReport
} from './architecture-health-auditor.js';

function withTempDir(fn: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-arch-audit-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
}

test('ArchitectureHealthAuditor scores clean codebase at 100', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'src/types.ts': 'export interface Item { id: string; }\n',
      'src/service.ts': "import type { Item } from './types.js';\nexport const idOf = (i: Item): string => i.id;\n"
    });

    const report = new ArchitectureHealthAuditor().auditDirectory(dir);
    assert.equal(report.healthScore, 100);
    assert.equal(report.summary.scannedFiles, 2);
    assert.equal(report.runtimeCycles.length, 0);
    assert.equal(report.typeOnlyCycles.length, 0);
    assert.equal(report.prescriptions.length, 0);
  });
});

test('ArchitectureHealthAuditor detects runtime cycles and distinguishes type-only cycles', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'src/a.ts': "import { b } from './b.js';\nexport const a = (): number => b() + 1;\n",
      'src/b.ts': "import { a } from './a.js';\nexport const b = (): number => a() + 1;\n",
      'src/t1.ts': "import type { T2 } from './t2.js';\nexport interface T1 { ref?: T2; }\n",
      'src/t2.ts': "import { type T1 } from './t1.js';\nexport interface T2 { ref?: T1; }\n"
    });

    const report = new ArchitectureHealthAuditor().auditDirectory(dir);
    assert.equal(report.runtimeCycles.length, 1);
    assert.deepEqual(report.runtimeCycles[0], ['src/a.ts', 'src/b.ts', 'src/a.ts']);
    assert.equal(report.typeOnlyCycles.length, 1);
    assert.deepEqual(report.typeOnlyCycles[0], ['src/t1.ts', 'src/t2.ts', 'src/t1.ts']);
    // 100 - 15 (runtime) - 2 (type-only) = 83
    assert.equal(report.healthScore, 83);
    assert.ok(report.prescriptions.some((p) => p.pattern === 'BREAK_RUNTIME_CYCLE'));
  });
});

test('ArchitectureHealthAuditor excludes test, d.ts, dist, node_modules, and experimental files', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'src/ok.ts': 'export const ok = 1;\n',
      'src/ok.test.ts': 'export const bad = (a: number, b: number, c: number, d: number, e: number, f: number) => a;\n',
      'src/types.d.ts': 'export declare function x(a: number, b: number, c: number, d: number, e: number, f: number): void;\n',
      'dist/generated.ts': 'export const g = 1;\n',
      'node_modules/pkg/index.ts': 'export const p = 1;\n',
      'experimental/agent/foo.ts': 'export const e = 1;\n'
    });

    const report = new ArchitectureHealthAuditor().auditDirectory(dir);
    assert.equal(report.summary.scannedFiles, 1);
    assert.equal(report.healthScore, 100);
  });
});

test('ArchitectureHealthAuditor detects anti-spaghetti violations, budget pressure, and formats report', () => {
  withTempDir((dir) => {
    const longLines = Array.from({ length: 255 }, (_, i) => `export const c${i} = ${i};`).join('\n');
    const manyBranches = Array.from({ length: 16 }, (_, i) => `if (n === ${i}) return ${i};`).join('\n  ');
    const methods = Array.from({ length: 13 }, (_, i) => `  m${i}(): number { return ${i}; }`).join('\n');

    writeFiles(dir, {
      'src/heavy.ts': `${longLines}\n`,
      'src/spaghetti.ts': `
export function complexFn(n: number): number {
  ${manyBranches}
  return -1;
}
export function wideParams(a: number, b: number, c: number, d: number, e: number, f: number): number {
  return a + b + c + d + e + f;
}
export class GodSvc {
${methods}
}
`.trim()
    });

    const report = new ArchitectureHealthAuditor().auditDirectory(dir);
    assert.equal(report.summary.budgetPressureFiles, 1);
    assert.equal(report.summary.complexityViolations, 1);
    assert.equal(report.summary.cognitiveViolations, 0);
    assert.equal(report.summary.paramViolations, 1);
    assert.equal(report.summary.godClassViolations, 1);
    assert.ok(report.healthScore < 100 && report.healthScore >= 0);

    const patterns = new Set(report.prescriptions.map((p) => p.pattern));
    assert.ok(patterns.has('EXTRACT_PREDICATE_TABLE'));
    assert.ok(patterns.has('OPTIONS_OBJECT_REFACTOR'));
    assert.ok(patterns.has('FACADE_DELEGATION'));

    const text = formatArchitectureHealthReport(report);
    assert.ok(text.includes(`Health Score: ${report.healthScore}/100`));
    assert.ok(text.includes('EXTRACT_PREDICATE_TABLE'));
  });
});

test('ArchitectureHealthAuditor applies exact unscaled penalty for <= 20 files', () => {
  withTempDir((dir) => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 18; i++) {
      files[`src/clean${i}.ts`] = `export const clean${i} = ${i};\n`;
    }
    const longLines = Array.from({ length: 255 }, (_, i) => `export const p${i} = ${i};`).join('\n');
    files['src/heavy.ts'] = `${longLines}\n`;
    files['src/wide.ts'] = 'export const wide = (a: number, b: number, c: number, d: number, e: number, f: number) => a;\n';

    writeFiles(dir, files);
    const report = new ArchitectureHealthAuditor().auditDirectory(dir);
    assert.equal(report.summary.scannedFiles, 20);
    // scale = max(1, 20 / 20) = 1 -> structuralPenalty = 3 (param) + 2 (budget) = 5
    assert.equal(report.healthScore, 95);
  });
});

test('ArchitectureHealthAuditor normalizes structural penalties for > 20 files while keeping runtime cycles unscaled', () => {
  withTempDir((dir) => {
    const files: Record<string, string> = {
      'src/a.ts': "import { b } from './b.js';\nexport const a = (): number => b() + 1;\n",
      'src/b.ts': "import { a } from './a.js';\nexport const b = (): number => a() + 1;\n",
      'src/wide.ts': 'export const wide = (a: number, b: number, c: number, d: number, e: number, f: number) => a;\n'
    };
    const longLines = Array.from({ length: 255 }, (_, i) => `export const p${i} = ${i};`).join('\n');
    files['src/heavy.ts'] = `${longLines}\n`;
    for (let i = 0; i < 36; i++) {
      files[`src/clean${i}.ts`] = `export const clean${i} = ${i};\n`;
    }

    writeFiles(dir, files);
    const report = new ArchitectureHealthAuditor().auditDirectory(dir);
    assert.equal(report.summary.scannedFiles, 40);
    assert.equal(report.summary.runtimeCycleCount, 1);
    assert.equal(report.summary.paramViolations, 1);
    assert.equal(report.summary.budgetPressureFiles, 1);
    // runtimePenalty = 15; scale = 40 / 20 = 2; rawStructural = 3 + 2 = 5 -> round(5 / 2) = 3
    // healthScore = 100 - 15 - 3 = 82
    assert.equal(report.healthScore, 82);
  });
});

test('ArchitectureHealthAuditor tracks cognitiveViolations in summary, score, prescriptions, and report', () => {
  withTempDir((dir) => {
    writeFiles(dir, {
      'src/nested.ts': `
export function deepWork(rows: number[][], active: boolean): number {
  let acc = 0;
  for (const row of rows) {
    if (active) {
      for (const n of row) {
        if (n > 0) {
          if (n < 100) {
            if (n !== 42) acc += n;
          }
        }
      }
    }
  }
  return acc;
}
`.trim()
    });

    const report = new ArchitectureHealthAuditor().auditDirectory(dir);
    assert.equal(report.summary.complexityViolations, 0);
    assert.equal(report.summary.cognitiveViolations, 1);
    // 100 - 1 * 4 = 96
    assert.equal(report.healthScore, 96);
    assert.ok(report.prescriptions.some((p) => p.pattern === 'EXTRACT_PREDICATE_TABLE'));
    assert.ok(formatArchitectureHealthReport(report).includes('Cognitive: 1'));
  });
});
