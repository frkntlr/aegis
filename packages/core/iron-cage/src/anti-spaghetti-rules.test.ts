import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {
  AntiSpaghettiValidator,
  calculateCyclomaticComplexity
} from './anti-spaghetti-rules.js';
import { IronCageValidator } from './cage-validator.js';

function getFirstFunction(source: string): ts.FunctionDeclaration {
  const sf = ts.createSourceFile('sample.ts', source, ts.ScriptTarget.Latest, true);
  const fn = sf.statements.find(ts.isFunctionDeclaration);
  assert.ok(fn, 'Expected a FunctionDeclaration');
  return fn;
}

test('calculateCyclomaticComplexity counts all control-flow branches accurately', () => {
  const code = `
function branchy(a: number, b: number | null, items: number[], obj: Record<string, number>): number {
  let total = a > 0 ? 1 : 0; // +1 (?:)
  const val = b ?? 2; // +1 (??)
  if (a > 1 && val > 0 || a === 0) { // +1 (if), +1 (&&), +1 (||)
    total += 1;
  }
  for (let i = 0; i < 2; i++) { total += i; } // +1 (for)
  for (const x of items) { total += x; } // +1 (for..of)
  for (const k in obj) { total += obj[k]; } // +1 (for..in)
  while (total < 0) { total++; } // +1 (while)
  do { total--; } while (false); // +1 (do)
  switch (a) {
    case 1: total += 10; break; // +1 (case)
    default: break;
  }
  try {
    total += 1;
  } catch (err) { // +1 (catch)
    total -= 1;
  }
  return total;
}
`.trim();

  const fn = getFirstFunction(code);
  // Base 1 + 12 branch points = 13
  assert.equal(calculateCyclomaticComplexity(fn), 13);
});

test('calculateCyclomaticComplexity excludes nested callable bodies', () => {
  const code = `
function outer(flag: boolean): number {
  const helper = (x: number): number => {
    if (x > 0 && x < 10) {
      return x > 5 ? 1 : 2;
    }
    return 0;
  };
  function inner(y: number): number {
    while (y > 0) { y--; }
    return y;
  }
  return flag ? helper(3) : inner(1);
}
`.trim();

  const fn = getFirstFunction(code);
  // outer only has 1 ternary (?:) => complexity 2
  assert.equal(calculateCyclomaticComplexity(fn), 2);
});

test('AntiSpaghettiValidator flags CYCLOMATIC_COMPLEXITY as error', () => {
  const validator = new AntiSpaghettiValidator({ maxCyclomaticComplexity: 2 });
  const code = `
function complex(a: boolean, b: boolean, c: boolean): number {
  if (a && b || c) {
    return 1;
  }
  return 0;
}
`.trim();

  const violations = validator.validate('src/complex.ts', code);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, 'CYCLOMATIC_COMPLEXITY');
  assert.equal(violations[0].severity, 'error');
});

test('AntiSpaghettiValidator flags TS_004_MAX_PARAMS as warning and ignores this param', () => {
  const validator = new AntiSpaghettiValidator({ maxParams: 3 });
  const code = `
function okWithThis(this: unknown, a: number, b: number, c: number): number {
  return a + b + c;
}
function tooMany(a: number, b: number, c: number, d: number): number {
  return a + b + c + d;
}
`.trim();

  const violations = validator.validate('src/params.ts', code);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, 'TS_004_MAX_PARAMS');
  assert.equal(violations[0].severity, 'warning');
  assert.ok(violations[0].message.includes('tooMany'));
});

test('AntiSpaghettiValidator flags TS_005_GOD_CLASS and ARCH_001_HIGH_FAN_OUT', () => {
  const validator = new AntiSpaghettiValidator({ maxClassMethods: 2, maxFileImports: 2 });
  const code = `
import { a } from './a.js';
import { b } from './b.js';
import { c } from './c.js';

export class MegaService {
  m1(): number { return a(); }
  m2(): number { return b(); }
  m3(): number { return c(); }
}
`.trim();

  const violations = validator.validate('src/mega.ts', code);
  const rules = violations.map((v) => v.rule);
  assert.ok(rules.includes('ARCH_001_HIGH_FAN_OUT'));
  assert.ok(rules.includes('TS_005_GOD_CLASS'));
  assert.ok(violations.every((v) => v.severity === 'warning'));
});

test('IronCageValidator enforces configurable maxCyclomaticComplexity without noisy warnings', () => {
  const validator = new IronCageValidator({ maxCyclomaticComplexity: 3 });
  const code = `
import { a } from './a.js';
import { b } from './b.js';
function busy(x: number, y: number, z: number, p: number, q: number, r: number): number {
  if (x > 0 && y > 0 || z > 0) {
    return p + q + r + a + b;
  }
  return 0;
}
`.trim();

  const result = validator.validateFileContent('src/busy.ts', code);
  assert.equal(result.passed, false);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].rule, 'CYCLOMATIC_COMPLEXITY');
});
