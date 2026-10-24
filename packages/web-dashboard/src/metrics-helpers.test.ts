import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { collectSourceFiles, collectTestFiles, compilePromptFile } from './server/metrics-helpers.js';

test('metrics-helpers collects source and test files correctly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-metrics-test-'));
  try {
    const srcFile = path.join(tmpDir, 'service.ts');
    const testFile = path.join(tmpDir, 'service.test.ts');
    const ignoredFile = path.join(tmpDir, 'types.d.ts');

    fs.writeFileSync(srcFile, 'export const x = 1;\n', 'utf8');
    fs.writeFileSync(testFile, 'test("ok", () => {});\n', 'utf8');
    fs.writeFileSync(ignoredFile, 'export type X = number;\n', 'utf8');

    const sources = collectSourceFiles(tmpDir);
    assert.ok(sources.some(f => f.endsWith('service.ts')));
    assert.strictEqual(sources.some(f => f.endsWith('types.d.ts')), false);

    const tests = collectTestFiles(tmpDir);
    assert.strictEqual(tests.length, 1);
    assert.ok(tests[0].endsWith('service.test.ts'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('metrics-helpers compiles surgical task prompt markdown file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-prompt-test-'));
  try {
    const promptPath = compilePromptFile(
      {
        id: 7,
        number: 7,
        title: 'Fix Telemetry Bug',
        status: 'in_progress',
        targetFiles: ['src/ui.ts'],
        labels: ['status:in_progress'],
        acceptanceCriteria: ['Pass layout check']
      },
      'solver',
      tmpDir
    );

    assert.ok(fs.existsSync(promptPath));
    const content = fs.readFileSync(promptPath, 'utf8');
    assert.ok(content.includes('Task Assignment: #7 Fix Telemetry Bug'));
    assert.ok(content.includes('@SOLVER'));
    assert.ok(content.includes('- `src/ui.ts`'));
    assert.ok(content.includes('- [ ] Pass layout check'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
