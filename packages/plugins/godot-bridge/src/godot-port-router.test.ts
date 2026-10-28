import { test } from 'node:test';
import * as assert from 'node:assert';
import { GodotPortRouter } from './godot-port-router.js';
import { GodotProcessWatchdog } from './godot-process-watchdog.js';

test('GodotPortRouter deterministically maps worktrees to ports', () => {
  assert.strictEqual(GodotPortRouter.resolvePort(), 6850);
  assert.strictEqual(GodotPortRouter.resolvePort('HakeGame-solver'), 6851);
  assert.strictEqual(GodotPortRouter.resolvePort('experimental/solver'), 6851);
  assert.strictEqual(GodotPortRouter.resolvePort('HakeGame-qa'), 6852);
  assert.strictEqual(GodotPortRouter.resolvePort('experimental/qa'), 6852);
  assert.strictEqual(GodotPortRouter.resolvePort('HakeGame-ui'), 6853);
  assert.strictEqual(GodotPortRouter.resolvePort('experimental/ui'), 6853);

  const customPort = GodotPortRouter.resolvePort('experimental/custom-feature');
  assert.ok(customPort >= 6850 && customPort <= 6950);
});

test('GodotPortRouter builds standard CLI arguments with token and port', () => {
  const args = GodotPortRouter.buildCliArgs({
    worktreeOrRole: 'solver',
    token: 'secret123',
    fixedFps: 60,
    timeScale: 5.0
  });

  assert.ok(args.includes('--headless'));
  assert.ok(args.includes('--display-driver'));
  assert.ok(args.includes('--fixed-fps'));
  assert.ok(args.includes('60'));
  assert.ok(args.includes('--time-scale'));
  assert.ok(args.includes('5'));
  assert.ok(args.includes('--aegis-port=6851'));
  assert.ok(args.includes('--aegis-token=secret123'));
});

test('GodotProcessWatchdog executes quick process and enforces timeout', async () => {
  // Test fast execution
  const nodeBinary = process.execPath;
  const fastResult = await GodotProcessWatchdog.executeWithWatchdog(
    nodeBinary,
    ['-e', 'console.log("hello from test"); process.exit(0);'],
    { timeoutMs: 5000 }
  );

  assert.strictEqual(fastResult.exitCode, 0);
  assert.strictEqual(fastResult.timedOut, false);
  assert.ok(fastResult.stdout.includes('hello from test'));

  // Test timeout enforcement
  const timeoutResult = await GodotProcessWatchdog.executeWithWatchdog(
    nodeBinary,
    ['-e', 'setInterval(() => {}, 1000);'],
    { timeoutMs: 500 }
  );

  assert.strictEqual(timeoutResult.timedOut, true);
});
