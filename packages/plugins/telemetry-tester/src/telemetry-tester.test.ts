import { test } from 'node:test';
import * as assert from 'node:assert';
import { BoundingBoxInspector, type BoundingBox } from './bounding-box.js';
import { ResponsiveLayoutTester } from './responsive.js';
import { PixelmatchDiffEngine } from './pixelmatch-diff.js';
import { MutationGate } from './mutation-gate.js';

test('BoundingBoxInspector detects overlapping elements on same plane', () => {
  const inspector = new BoundingBoxInspector();
  const box1: BoundingBox = { id: 'btn-save', x: 10, y: 10, width: 100, height: 40 };
  const box2: BoundingBox = { id: 'btn-cancel', x: 50, y: 20, width: 100, height: 40 }; // Overlaps!

  assert.strictEqual(inspector.checkOverlap(box1, box2), true);

  const res = inspector.inspectLayout([box1, box2], { width: 1920, height: 1080, name: 'desktop' });
  assert.strictEqual(res.passed, false);
  assert.ok(res.violations.some(v => v.type === 'OVERLAP'));
  assert.strictEqual(res.violations[0].message, 'Unintended overlap between "btn-save" and "btn-cancel".');
  assert.strictEqual(res.tokenCost, 0); // 0 vision tokens used!
});

test('BoundingBoxInspector detects viewport overflow', () => {
  const inspector = new BoundingBoxInspector();
  // Mobile width is 390; element width is 500 => overflows!
  const box: BoundingBox = { id: 'wide-table', x: 0, y: 0, width: 500, height: 100 };

  const res = inspector.inspectLayout([box], { width: 390, height: 844, name: 'mobile' });
  assert.strictEqual(res.passed, false);
  assert.ok(res.violations.some(v => v.type === 'VIEWPORT_OVERFLOW'));
});

test('ResponsiveLayoutTester runs multi-viewport sweeps', () => {
  const tester = new ResponsiveLayoutTester();
  const report = tester.testAllViewports((vp) => [
    { id: 'header', x: 0, y: 0, width: Math.min(vp.width, 300), height: 50 }
  ]);

  assert.strictEqual(report.overallPassed, true);
  assert.ok(report.reports.desktop.passed);
  assert.ok(report.reports.mobile.passed);
});

test('PixelmatchDiffEngine accurately compares layout/pixel grids', () => {
  const engine = new PixelmatchDiffEngine();
  const gridA = [0, 0, 1, 1, 0];
  const gridB = [0, 0, 1, 0, 0]; // 1 mismatch out of 5 = 20%

  const diff = engine.compareGrids(gridA, gridB, 5.0); // max allowed 5%
  assert.strictEqual(diff.differentPixels, 1);
  assert.strictEqual(diff.diffPercentage, 20.0);
  assert.strictEqual(diff.thresholdExceeded, true);
});

test('MutationGate generates mutants and evaluates test kill score', () => {
  const gate = new MutationGate({ minThresholdPercent: 70 });
  const sampleCode = `
function add(a: number, b: number): number {
  const isValid = true;
  return a + b;
}
  `.trim();

  const mutants = gate.generateMutants(sampleCode);
  assert.ok(mutants.length >= 2);

  // Simulate test suite killing 100% of mutants
  const report = gate.evaluateScore(mutants, () => true);
  assert.strictEqual(report.scorePercent, 100);
  assert.strictEqual(report.passedThreshold, true);

  // Simulate test suite missing mutants (score 0%)
  const failReport = gate.evaluateScore(mutants, () => false);
  assert.strictEqual(failReport.scorePercent, 0);
  assert.strictEqual(failReport.passedThreshold, false);
});


test('MutationGate handles consecutive lines matching same pattern without lastIndex drift', () => {
  const gate = new MutationGate();
  const sampleCode = [
    'const flag1 = true;',
    'const flag2 = true;',
    'const flag3 = true;'
  ].join('\n');

  const mutants = gate.generateMutants(sampleCode);
  const trueMutants = mutants.filter(m => m.id.includes('true to false'));
  assert.strictEqual(trueMutants.length, 3);
  assert.strictEqual(trueMutants[0].line, 1);
  assert.strictEqual(trueMutants[1].line, 2);
  assert.strictEqual(trueMutants[2].line, 3);
});
