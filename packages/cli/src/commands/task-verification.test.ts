import test, { type TestContext } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GodotTestRunner, type TestExecutionResult } from '@aegis/godot-bridge';
import { handleTaskVerify } from './task-verification.js';
import { handleCageCheck } from './cage-check-runner.js';

function fixture(t: TestContext, godot = true): { root: string; output: string[] } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-task-verify-'));
  const previous = { cwd: process.cwd(), exitCode: process.exitCode };
  const output: string[] = [];
  fs.writeFileSync(path.join(root, 'good.ts'), 'export const good = true;\n');
  if (godot) fs.writeFileSync(path.join(root, 'project.godot'), '[application]\n');
  process.chdir(root);
  t.mock.method(console, 'log', (...args: unknown[]) => output.push(args.join(' ')));
  t.mock.method(console, 'error', (...args: unknown[]) => output.push(args.join(' ')));
  t.after(() => {
    process.chdir(previous.cwd);
    process.exitCode = previous.exitCode;
    t.mock.restoreAll();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, output };
}

function result(overrides: Partial<TestExecutionResult> = {}): TestExecutionResult {
  return { passed: true, exitCode: 0, durationMs: 1, stdout: '', stderr: '', timedOut: false, ...overrides };
}

test('task verification waits for actual Godot runtime before reporting success', async t => {
  const { root, output } = fixture(t);
  let finish: (value: TestExecutionResult) => void = () => {};
  const runtime = new Promise<TestExecutionResult>(resolve => { finish = resolve; });
  const runner = t.mock.method(GodotTestRunner, 'runPlaytestScenario', async (projectDir: string) => {
    assert.equal(projectDir, root);
    return runtime;
  });
  const pending = handleTaskVerify('good.ts');
  assert.equal(runner.mock.callCount(), 1);
  assert.ok(!output.some(line => line.includes('Task Verification PASSED')));
  finish(result());
  await pending;
  assert.ok(output.some(line => line.includes('Godot runtime playtest passed')));
  assert.ok(output.some(line => line.includes('Task Verification PASSED')));
  assert.ok(!output.some(line => /UI Layout Verification|100%/.test(line)));
});

test('runtime failures, missing engine, timeout and thrown errors fail task verification', async t => {
  const { output } = fixture(t);
  const failures = [result({ passed: false, stderr: 'SCRIPT ERROR: failure' }),
    result({ passed: false, exitCode: 1, stderr: 'Godot binary not found' }),
    result({ passed: true, timedOut: true }), result({ passed: true, exitCode: 1 })];
  for (const failed of failures) {
    const runner = t.mock.method(GodotTestRunner, 'runPlaytestScenario', async () => failed);
    output.length = 0;
    process.exitCode = 0;
    await handleTaskVerify('good.ts');
    assert.equal(process.exitCode, 1);
    assert.ok(output.some(line => line.includes('Task Verification FAILED')));
    assert.ok(!output.some(line => line.includes('Task Verification PASSED')));
    runner.mock.restore();
  }
  t.mock.method(GodotTestRunner, 'runPlaytestScenario', async () => { throw new Error('spawn denied'); });
  process.exitCode = 0;
  await handleTaskVerify('good.ts');
  assert.equal(process.exitCode, 1);
  assert.ok(output.some(line => line.includes('spawn denied')));
});

test('non-Godot source verification explicitly reports runtime not applicable', async t => {
  const { output } = fixture(t, false);
  const runner = t.mock.method(GodotTestRunner, 'runPlaytestScenario', async () => result());
  await handleTaskVerify('good.ts');
  assert.equal(runner.mock.callCount(), 0);
  assert.ok(output.some(line => line.includes('Godot playtest: not applicable')));
  output.length = 0;
  await handleTaskVerify('missing.ts');
  assert.equal(process.exitCode, 1);
  assert.ok(!output.some(line => line.includes('Task Verification PASSED')));
});

test('cage audit rejects missing and empty source targets with failing JSON evidence', t => {
  const { root, output } = fixture(t, false);
  const empty = path.join(root, 'empty');
  fs.mkdirSync(empty);
  for (const target of [path.join(root, 'missing'), empty]) {
    output.length = 0;
    process.exitCode = 0;
    handleCageCheck([target, '--json', '--no-cache']);
    const response = JSON.parse(output[0]) as { clean: boolean; error: string; filesScanned: number };
    assert.equal(process.exitCode, 1);
    assert.equal(response.clean, false);
    assert.equal(response.filesScanned, 0);
    assert.match(response.error, /does not exist|No source files/);
  }
});
