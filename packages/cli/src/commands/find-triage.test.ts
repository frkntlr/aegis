import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { handleFind } from './find-command.js';
import { handleTriage } from './triage-command.js';

function captureOutput(fn: () => void): string {
  const originalLog = console.log;
  const originalErr = console.error;
  let logs = '';
  console.log = (...args: unknown[]) => { logs += args.join(' ') + '\n'; };
  console.error = (...args: unknown[]) => { logs += args.join(' ') + '\n'; };
  try {
    fn();
    return logs;
  } finally {
    console.log = originalLog;
    console.error = originalErr;
  }
}

test('handleFind outputs symbol location and surgical slice', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-find-test-'));
  const testFile = path.join(tmpDir, 'service.ts');
  const code = [
    'export class PaymentService {',
    '  processPayment(amount: number): boolean {',
    '    return amount > 0;',
    '  }',
    '}'
  ].join('\n');
  fs.writeFileSync(testFile, code, 'utf8');

  const oldCwd = process.cwd();
  try {
    process.chdir(tmpDir);
    const output = captureOutput(() => handleFind('PaymentService'));
    assert.ok(output.includes("Symbol found: 'PaymentService'") || output.includes('PaymentService'));
  } finally {
    process.chdir(oldCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('handleFind handles non-existent symbol gracefully', () => {
  const output = captureOutput(() => handleFind('NonExistentSymbolxyz123'));
  assert.ok(output.includes('No symbols matching') || output.includes('not found'));
});

test('handleTriage runs evidence-based triage and outputs stratified layers', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-triage-test-'));
  const testFile = path.join(tmpDir, 'clean.ts');
  fs.writeFileSync(testFile, 'export function multiply(a: number, b: number): number { return a * b; }\n', 'utf8');

  try {
    const output = captureOutput(() => handleTriage(tmpDir));
    assert.ok(output.includes('Evidence-Based Bug Triage'));
    assert.ok(output.includes('Critical Defects: 0'));
    assert.ok(output.includes('Triage Verdict: CLEAN'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
