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

test('BoundingBoxInspector ignores parent-child hierarchies and zero-dimension boxes', () => {
  const inspector = new BoundingBoxInspector();
  const parentBox: BoundingBox = { id: 'modal', x: 100, y: 100, width: 400, height: 300 };
  const childBox: BoundingBox = { id: 'modal/close_btn', x: 450, y: 110, width: 30, height: 30 };

  assert.strictEqual(inspector.checkOverlap(parentBox, childBox), false);

  const zeroBox: BoundingBox = { id: 'invisible', x: 200, y: 200, width: 0, height: 0 };
  assert.strictEqual(inspector.checkOverlap(parentBox, zeroBox), false);

  const parentIdChild: BoundingBox = { id: 'btn', parentId: 'modal', x: 150, y: 150, width: 100, height: 40 };
  assert.strictEqual(inspector.checkOverlap(parentBox, parentIdChild), false);
});

test('MutationGate ignores comment lines during mutant generation', () => {
  const gate = new MutationGate();
  const sampleCode = [
    '// const flag = true;',
    '# a + b is calculated here',
    '/* return true */',
    'const actual = true;'
  ].join('\n');

  const mutants = gate.generateMutants(sampleCode);
  assert.strictEqual(mutants.length, 1);
  assert.strictEqual(mutants[0].line, 4);
});

test('MutationGate skips TypeScript interfaces and type declarations (#214)', () => {
  const gate = new MutationGate();
  const tsCode = [
    'export interface UserConfig {',
    '  isAdmin: boolean;',
    '  timeout: number;',
    '}',
    'type Flag = true;',
    'function isAllowed(user: UserConfig): boolean {',
    '  return user.timeout >= 10;',
    '}'
  ].join('\n');

  const mutants = gate.generateMutants(tsCode);
  // Mutants should only be generated from the runtime function, not the interface or type
  for (const m of mutants) {
    assert.ok(m.line >= 6, `Mutant generated on line ${m.line} which is in a type declaration`);
  }
});

test('MutationGate mutates boundaries, logical operators, and returns (#215)', () => {
  const gate = new MutationGate();
  const code = [
    'function check(a: number, b: number): boolean {',
    '  if (a >= 10 && b < 5) {',
    '    return true;',
    '  }',
    '  return false;',
    '}'
  ].join('\n');

  const mutants = gate.generateMutants(code);
  const boundaryMutants = mutants.filter(m => m.id.includes('>= to <') || m.id.includes('< to >='));
  const logicalMutants = mutants.filter(m => m.id.includes('&& to ||'));
  const returnMutants = mutants.filter(m => m.id.includes('return true to return false'));

  assert.ok(boundaryMutants.length >= 2);
  assert.ok(logicalMutants.length >= 1);
  assert.ok(returnMutants.length >= 1);
});

test('BoundingBoxInspector handles zIndex, edge touching, negative dims, and prefix separation', () => {
  const inspector = new BoundingBoxInspector();
  const base: BoundingBox = { id: 'modal', x: 0, y: 0, width: 100, height: 100, zIndex: 1 };
  const layered: BoundingBox = { id: 'tooltip', x: 10, y: 10, width: 50, height: 50, zIndex: 2 };
  const sameLayer: BoundingBox = { id: 'panel', x: 10, y: 10, width: 50, height: 50, zIndex: 1 };
  const oneSided: BoundingBox = { id: 'overlay', x: 10, y: 10, width: 50, height: 50 };
  const edgeTouch: BoundingBox = { id: 'adjacent', x: 100, y: 0, width: 50, height: 100, zIndex: 1 };
  const negDim: BoundingBox = { id: 'bad', x: 10, y: 10, width: -10, height: 20 };
  const siblingPrefix: BoundingBox = { id: 'modal2', x: 10, y: 10, width: 50, height: 50, zIndex: 1 };

  assert.strictEqual(inspector.checkOverlap(base, layered), false);
  assert.strictEqual(inspector.checkOverlap(base, sameLayer), true);
  assert.strictEqual(inspector.checkOverlap(base, oneSided), true);
  assert.strictEqual(inspector.checkOverlap(base, edgeTouch), false);
  assert.strictEqual(inspector.checkOverlap(base, negDim), false);
  assert.strictEqual(inspector.checkOverlap(base, siblingPrefix), true);
});

test('BoundingBoxInspector checks negative coordinates, vertical overflow, exact fit, and empty boxes', () => {
  const inspector = new BoundingBoxInspector();
  const vp = { width: 390, height: 844, name: 'mobile' };

  assert.strictEqual(inspector.inspectLayout([], vp).passed, true);
  assert.strictEqual(inspector.inspectLayout([{ id: 'fit', x: 0, y: 0, width: 390, height: 844 }], vp).passed, true);

  const negX = inspector.inspectLayout([{ id: 'neg', x: -1, y: 0, width: 50, height: 50 }], vp);
  assert.strictEqual(negX.passed, false);
  assert.strictEqual(negX.violations[0].type, 'VIEWPORT_OVERFLOW');

  const tall = inspector.inspectLayout([{ id: 'tall', x: 0, y: 800, width: 50, height: 50 }], vp);
  assert.strictEqual(tall.passed, false);
  assert.strictEqual(tall.violations[0].type, 'VIEWPORT_OVERFLOW');
});

test('ResponsiveLayoutTester fails overallPassed on partial viewport failure', () => {
  const tester = new ResponsiveLayoutTester();
  const report = tester.testAllViewports(() => [
    { id: 'banner', x: 0, y: 0, width: 500, height: 50 }
  ]);
  assert.strictEqual(report.overallPassed, false);
  assert.strictEqual(report.reports.desktop.passed, true);
  assert.strictEqual(report.reports.laptop.passed, true);
  assert.strictEqual(report.reports.mobile.passed, false);
});

test('PixelmatchDiffEngine handles empty grids and mismatched grid lengths', () => {
  const engine = new PixelmatchDiffEngine();
  const empty = engine.compareGrids([], []);
  assert.strictEqual(empty.totalPixels, 0);
  assert.strictEqual(empty.diffPercentage, 0);
  assert.strictEqual(empty.thresholdExceeded, false);

  const mismatched = engine.compareGrids([1, 0], [1, 0, 1, 1], 10);
  assert.strictEqual(mismatched.totalPixels, 4);
  assert.strictEqual(mismatched.differentPixels, 2);
  assert.strictEqual(mismatched.diffPercentage, 50);
  assert.strictEqual(mismatched.thresholdExceeded, true);
});

test('MutationGate handles multiline type unions and avoids duplicate return true mutants', () => {
  const gate = new MutationGate();
  const code = [
    'export type Mode =',
    "  | 'fast'",
    "  | 'deep';",
    'export function flag(): boolean {',
    '  return true;',
    '}'
  ].join('\n');
  const mutants = gate.generateMutants(code);
  assert.strictEqual(mutants.length, 1);
  assert.strictEqual(mutants[0].line, 5);
});

test('MutationGate handles ASI multiline types, trailing comments, strings, block comments, and regexes', () => {
  const gate = new MutationGate({ minThresholdPercent: 60 });
  const asiCode = [
    'type Color =',
    "  | 'red'",
    "  | 'blue'",
    'export const isGreater = (a: number, b: number) => a > b;',
    'type Flag = true',
    'export function sub(a: number, b: number): number {',
    '  return a - b;',
    '}'
  ].join('\n');
  const asiMutants = gate.generateMutants(asiCode);
  assert.ok(asiMutants.some(m => m.line === 4 && m.mutatedCode.includes('a <= b')));
  assert.ok(asiMutants.some(m => m.line === 7 && m.mutatedCode.includes('a + b')));

  const mixedCode = [
    'export function check(x: number, s: string) {',
    '  /* a + b && c > 0',
    '     return false */',
    "  const cmd = 'aegis status && aegis inspect';",
    '  const re = /^"a && b"$/;',
    '  const tpl = `sum + $' + '{x / 2 + 1}`;',
    '  if (x <= 0 || x !== 1) return false;',
    '  return x > 0; // checks: boolean',
    '}'
  ].join('\n');
  const mixedMutants = gate.generateMutants(mixedCode);
  assert.ok(mixedMutants.every(m => m.line >= 6), 'No mutants inside block comments, strings, or regex');
  assert.ok(mixedMutants.some(m => m.line === 6 && m.mutatedCode.includes('x / 2 - 1') && m.mutatedCode.includes('sum + ')));
  assert.ok(mixedMutants.some(m => m.line === 7 && m.mutatedCode.includes('x > 0')));
  assert.ok(mixedMutants.some(m => m.line === 7 && m.mutatedCode.includes('return true')));
  assert.ok(mixedMutants.some(m => m.line === 8 && m.mutatedCode.includes('x <= 0; // checks: boolean')));
  assert.strictEqual(gate.evaluateScore([], () => false).scorePercent, 100);
});
