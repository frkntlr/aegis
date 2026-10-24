import { test } from 'node:test';
import * as assert from 'node:assert';
import { CleanArchitectureValidator } from './clean-architecture-rules.js';

test('CleanArchitectureValidator flags TS_001_NO_ANY on explicit any keyword', () => {
  const validator = new CleanArchitectureValidator();
  const badCode = `
    function processPayload(data: any): any {
      const temp: any = data;
      return temp;
    }
  `.trim();

  const violations = validator.validate('src/bad.ts', badCode);
  const anyRules = violations.filter(v => v.rule === 'TS_001_NO_ANY');
  assert.strictEqual(anyRules.length, 3);
  assert.ok(anyRules[0].message.includes("Explicit 'any' type is prohibited"));

  const goodCode = `
    function processPayload(data: unknown): string {
      return typeof data === 'string' ? data : '';
    }
  `.trim();
  const cleanViolations = validator.validate('src/good.ts', goodCode);
  assert.strictEqual(cleanViolations.filter(v => v.rule === 'TS_001_NO_ANY').length, 0);
});

test('CleanArchitectureValidator flags TS_002_EMPTY_CATCH on uncommented swallowed catches', () => {
  const validator = new CleanArchitectureValidator();
  const badCatch = `
    function readFile() {
      try {
        fs.readFileSync('missing');
      } catch {}
    }
  `.trim();

  const violations = validator.validate('src/catch.ts', badCatch);
  const emptyCatches = violations.filter(v => v.rule === 'TS_002_EMPTY_CATCH');
  assert.strictEqual(emptyCatches.length, 1);
  assert.ok(emptyCatches[0].message.includes('Empty catch block detected'));

  const validWithBlockComment = `
    try {
      op();
    } catch { /* intentional fallback */ }
  `.trim();
  assert.strictEqual(validator.validate('src/c1.ts', validWithBlockComment).length, 0);

  const validWithLineComment = `
    try {
      op();
    } catch {
      // non-fatal
    }
  `.trim();
  assert.strictEqual(validator.validate('src/c2.ts', validWithLineComment).length, 0);
});

test('CleanArchitectureValidator flags TS_003_NESTING_DEPTH for excessive control depth', () => {
  const validator = new CleanArchitectureValidator({ maxNestingDepth: 3 });
  const deepNesting = `
    function deeplyNested(a: boolean, b: boolean, c: boolean, d: boolean) {
      if (a) {
        if (b) {
          if (c) {
            if (d) return true;
          }
        }
      }
      return false;
    }
  `.trim();

  const violations = validator.validate('src/deep.ts', deepNesting);
  const depthViolations = violations.filter(v => v.rule === 'TS_003_NESTING_DEPTH');
  assert.strictEqual(depthViolations.length, 1);
  assert.ok(depthViolations[0].message.includes('Control flow nesting depth of 4 exceeds threshold'));
});

test('CleanArchitectureValidator allows flat else-if chains and resets depth on inner functions', () => {
  const validator = new CleanArchitectureValidator({ maxNestingDepth: 3 });
  const flatElseIf = `
    function flatBranch(x: number) {
      if (x === 1) return 1;
      else if (x === 2) return 2;
      else if (x === 3) return 3;
      else if (x === 4) return 4;
      return 0;
    }
  `.trim();
  assert.strictEqual(validator.validate('src/flat.ts', flatElseIf).length, 0);

  const nestedFunctionResetsDepth = `
    function outer(a: boolean) {
      if (a) {
        const handler = () => {
          if (true) {
            if (true) return 1;
          }
        };
      }
    }
  `.trim();
  assert.strictEqual(validator.validate('src/reset.ts', nestedFunctionResetsDepth).length, 0);
});
