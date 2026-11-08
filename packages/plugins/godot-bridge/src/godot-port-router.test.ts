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

test('GodotPortRouter allocates deterministic track ports and isolated userDataDir', () => {
  const defaultAlloc = GodotPortRouter.allocateTrackPort();
  assert.strictEqual(defaultAlloc.port, 6850);
  assert.strictEqual(defaultAlloc.debugPort, 6200);
  assert.ok(defaultAlloc.userDataDir.includes('aegis-godot-default'));

  const solverAlloc = GodotPortRouter.allocateTrackPort('solver');
  assert.strictEqual(solverAlloc.port, 6851);
  assert.strictEqual(solverAlloc.debugPort, 6201);
  assert.ok(solverAlloc.userDataDir.includes('aegis-godot-solver'));

  const qaAlloc = GodotPortRouter.allocateTrackPort('qa');
  assert.strictEqual(qaAlloc.port, 6852);
  assert.strictEqual(qaAlloc.debugPort, 6202);
  assert.ok(qaAlloc.userDataDir.includes('aegis-godot-qa'));

  const uiAlloc = GodotPortRouter.allocateTrackPort('ui');
  assert.strictEqual(uiAlloc.port, 6853);
  assert.strictEqual(uiAlloc.debugPort, 6203);
  assert.ok(uiAlloc.userDataDir.includes('aegis-godot-ui'));

  const customAlloc = GodotPortRouter.allocateTrackPort('track-feature-alpha', 7000);
  assert.ok(customAlloc.port >= 7010 && customAlloc.port <= 7060);
  assert.ok(customAlloc.debugPort >= 6210 && customAlloc.debugPort <= 6260);
  assert.ok(customAlloc.userDataDir.includes('aegis-godot-track-feature-alpha'));

  const secondAlloc = GodotPortRouter.allocateTrackPort('track-feature-alpha', 7000);
  assert.deepStrictEqual(customAlloc, secondAlloc);
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

test('GodotPortRouter builds CLI args with user-data-dir and trackId isolation', () => {
  const argsWithUserData = GodotPortRouter.buildCliArgs({
    userDataDir: '/tmp/isolated-godot-user'
  });
  assert.ok(argsWithUserData.includes('--user-data-dir'));
  const idx = argsWithUserData.indexOf('--user-data-dir');
  assert.strictEqual(argsWithUserData[idx + 1], '/tmp/isolated-godot-user');

  const argsWithTrack = GodotPortRouter.buildCliArgs({
    trackId: 'track-beta'
  });
  assert.ok(argsWithTrack.includes('--user-data-dir'));
  assert.ok(argsWithTrack[argsWithTrack.indexOf('--user-data-dir') + 1].includes('aegis-godot-track-beta'));
  assert.ok(argsWithTrack.some((a: string) => a.startsWith('--aegis-port=')));
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
