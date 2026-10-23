import { test } from 'node:test';
import * as assert from 'node:assert';
import { IronCageValidator } from './cage-validator.js';

test('IronCageValidator passes clean files', () => {
  const validator = new IronCageValidator({ maxFunctionLines: 40, maxFileLines: 300 });
  const content = `
function cleanHelper() {
  const a = 1;
  const b = 2;
  return a + b;
}
  `.trim();

  const result = validator.validateFileContent('src/clean.ts', content);
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.violations.length, 0);
});

test('IronCageValidator flags files exceeding line limits', () => {
  const validator = new IronCageValidator({ maxFileLines: 5 });
  const content = '1\n2\n3\n4\n5\n6\n7\n8';

  const result = validator.validateFileContent('src/long.ts', content);
  assert.strictEqual(result.passed, false);
  assert.ok(result.violations.some(v => v.rule === 'MAX_FILE_LINES'));
});

test('IronCageValidator detects full file rewrites', () => {
  const validator = new IronCageValidator();
  const result = validator.validateDiff('src/Core.ts', 200, 180, 100);

  assert.strictEqual(result.passed, false);
  assert.ok(result.violations.some(v => v.rule === 'FULL_FILE_REWRITE'));
});

test('IronCageValidator accurately parses AST with multi-line signatures, template strings and callbacks', () => {
  const validator = new IronCageValidator({ maxFunctionLines: 40, maxFileLines: 300 });
  const complexTs = `
export async function complexHandler(
  paramA: string,
  paramB: number,
  options: {
    verbose: boolean;
    tags: string[];
  }
): Promise<{ success: boolean; data: string }> {
  const template = \`
    {
      "nested": "\${paramA}",
      "calc": \${paramB + 10}
    }
  \`;
  const items = [1, 2, 3].map(item => {
    return { id: item, str: \`item-\${item}\` };
  });
  return { success: true, data: template };
}
  `.trim();

  const result = validator.validateFileContent('src/complex.ts', complexTs);
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.violations.length, 0);
});

test('IronCageValidator flags oversized function using true TypeScript AST', () => {
  const validator = new IronCageValidator({ maxFunctionLines: 10, maxFileLines: 300 });
  const lines: string[] = ['function oversizedProcessor() {'];
  for (let i = 0; i < 15; i++) {
    lines.push(`  const step${i} = ${i};`);
  }
  lines.push('  return true;');
  lines.push('}');
  const content = lines.join('\n');

  const result = validator.validateFileContent('src/oversized.ts', content);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.violations.length, 1);
  assert.strictEqual(result.violations[0].rule, 'MAX_FUNCTION_LINES');
  assert.ok(result.violations[0].message.includes('oversizedProcessor'));
});
