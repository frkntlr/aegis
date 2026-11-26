import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { MutationGate } from './mutation-gate.js';

test('MutationGate skips interfaces, type aliases, import type, and typed params', () => {
  const gate = new MutationGate();
  const code = [
    "import type { Foo } from './foo.js';",
    'export interface Config {',
    '  enabled: boolean;',
    '  count: number;',
    '}',
    'export type Box<',
    '  T extends object',
    '> = {',
    '  value: T;',
    '};',
    'type Union =',
    "  | 'a'",
    "  | 'b'",
    'function fn(',
    '  flag: boolean,',
    '  count: number',
    '): boolean {',
    '  return count >= 1 && flag === true;',
    '}'
  ].join('\n');
  const mutants = gate.generateMutants(code);
  assert.ok(mutants.length >= 2);
  assert.ok(mutants.every(m => m.line === 18));
});

test('MutationGate handles ASI multiline types, brace-continuation, extends, and trailing comments', () => {
  const gate = new MutationGate();
  const code = [
    'type Pair =',
    '  | { a: number }',
    '  | { b: string }',
    'type Ext<T> =',
    '  T extends',
    '  string',
    'export function cmp(a: number, b: number): boolean {',
    '  return a > b; // checks: boolean',
    '}',
    'type Alias = string',
    'export const sub = (x: number, y: number): number => x - y;'
  ].join('\n');
  const mutants = gate.generateMutants(code);
  assert.ok(mutants.some(m => m.line === 8 && m.mutatedCode.includes('a <= b; // checks: boolean')));
  assert.ok(mutants.some(m => m.line === 11 && m.mutatedCode.includes('x + y;')));
  assert.ok(mutants.every(m => m.line === 8 || m.line === 11));
});

test('MutationGate masks comments, escaped strings, regex char classes, templates, and division', () => {
  const gate = new MutationGate();
  const code = [
    'export function scan(x: number): boolean {',
    '  /* multi-line',
    '     a + b && c > 0 */',
    '  const s1 = "escaped \\" a && b";',
    "  const s2 = 'single \\' a || b';",
    '  const re = /[/"a && b]/;',
    '  const div = x / 2 + 1;',
    '  const plainTpl = `$a + 1`;',
    '  const tpl = `escaped \\` && $' + '{ { k: 1 }.k + 2 }`;',
    '  return div <= 10 || x !== 0;',
    '}'
  ].join('\n');
  const mutants = gate.generateMutants(code);
  assert.ok(mutants.every(m => m.line >= 7 && m.line !== 8));
  assert.ok(mutants.some(m => m.line === 7 && m.mutatedCode.includes('x / 2 - 1')));
  assert.ok(mutants.some(m => m.line === 9 && m.mutatedCode.includes('{ k: 1 }.k - 2')));
  assert.ok(mutants.some(m => m.line === 10 && m.mutatedCode.includes('div > 10')));
  assert.ok(mutants.some(m => m.line === 10 && m.mutatedCode.includes('div <= 10 && x !== 0')));
  assert.ok(mutants.some(m => m.line === 10 && m.mutatedCode.includes('x === 0')));
});

test('MutationGate preserves CRLF, regex after return/keyword, and exact evaluateScore thresholds', () => {
  const gate = new MutationGate({ minThresholdPercent: 50 });
  const crlf = 'export function f(a: number): boolean {\r\n  if (/a && b/.test("a") && a < 5) return false;\r\n  return true;\r\n}';
  const mutants = gate.generateMutants(crlf);
  assert.ok(mutants.length >= 4);
  assert.ok(mutants.every(m => m.mutatedCode.includes('\r\n')));
  assert.ok(!mutants.some(m => m.mutatedCode.includes('/a || b/')));

  const two = mutants.slice(0, 2);
  const exactPass = gate.evaluateScore(two, m => m === two[0]);
  assert.equal(exactPass.scorePercent, 50);
  assert.equal(exactPass.passedThreshold, true);
  assert.equal(exactPass.killedMutants, 1);
  assert.equal(exactPass.survivedMutants, 1);

  const defaultGate = new MutationGate();
  assert.equal(defaultGate.evaluateScore(two, m => m === two[0]).passedThreshold, false);
  assert.equal(defaultGate.evaluateScore([], () => false).scorePercent, 100);
});

test('MutationGate skips multiline tuple type aliases without false positives', () => {
  const gate = new MutationGate();
  const code = [
    'export type PairTuple = [',
    '  boolean,',
    '  true,',
    '  number',
    '];',
    'export const ok = (x: number): boolean => x > 0;'
  ].join('\n');
  const mutants = gate.generateMutants(code);
  assert.ok(mutants.length >= 1);
  assert.ok(mutants.every(m => m.line === 6));
});
