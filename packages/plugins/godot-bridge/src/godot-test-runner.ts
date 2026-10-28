/**
 * @file godot-test-runner.ts
 * 3-Tier Headless Test Runner & Native Compiler Pre-Flight Gate for Godot 4.x.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { GodotLocator } from './godot-locator.js';
import { GodotProcessWatchdog } from './godot-process-watchdog.js';
import { GodotPortRouter } from './godot-port-router.js';

export interface SyntaxCheckResult {
  valid: boolean;
  error?: string;
  line?: number;
  output: string;
}

export interface TestExecutionResult {
  passed: boolean;
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  orphanNodesDelta?: number;
  timedOut: boolean;
}

export class GodotTestRunner {
  public static async checkSyntax(scriptPath: string, godotBinary?: string): Promise<SyntaxCheckResult> {
    const install = GodotLocator.findGodot(godotBinary);
    if (!install) {
      return { valid: false, error: 'Godot binary not found', output: '' };
    }

    const absPath = path.resolve(scriptPath);
    const args = ['--headless', '--check-only', '-s', absPath];
    const res = await GodotProcessWatchdog.executeWithWatchdog(install.binaryPath, args, { timeoutMs: 5000 });
    const fullOut = `${res.stdout}\n${res.stderr}`.trim();

    if (res.exitCode === 0 && !fullOut.includes('SCRIPT ERROR:')) {
      return { valid: true, output: fullOut };
    }

    const lineMatch = fullOut.match(/SCRIPT ERROR: Parse Error: ([^\n]+)\s+at: [^(]+\([^:]+:(\d+)\)/);
    const line = lineMatch ? parseInt(lineMatch[2], 10) : undefined;
    const errorMsg = lineMatch ? lineMatch[1] : (fullOut.split('\n')[0] || 'Unknown compile error');

    return { valid: false, error: errorMsg, line, output: fullOut };
  }

  public static async runSceneTreeTest(
    scriptPath: string,
    projectDir: string,
    godotBinary?: string,
    timeoutMs = 15000
  ): Promise<TestExecutionResult> {
    const install = GodotLocator.findGodot(godotBinary);
    if (!install) {
      return { passed: false, exitCode: 1, durationMs: 0, stdout: '', stderr: 'Godot binary not found', timedOut: false };
    }

    const start = Date.now();
    const args = [
      '--headless',
      '--path', projectDir,
      '--display-driver', 'headless',
      '--rendering-driver', 'dummy',
      '--audio-driver', 'Dummy',
      '-s', scriptPath
    ];

    const res = await GodotProcessWatchdog.executeWithWatchdog(install.binaryPath, args, { timeoutMs });
    const durationMs = Date.now() - start;
    const passed = res.exitCode === 0 && !res.timedOut && !res.stderr.includes('SCRIPT ERROR:');

    // Extract orphan node count if printed
    let orphanNodesDelta: number | undefined;
    const orphanMatch = res.stdout.match(/ORPHAN_NODES_DELTA:\s*(\d+)/);
    if (orphanMatch) {
      orphanNodesDelta = parseInt(orphanMatch[1], 10);
    }

    return {
      passed: passed && (orphanNodesDelta === undefined || orphanNodesDelta === 0),
      exitCode: res.exitCode,
      durationMs,
      stdout: res.stdout,
      stderr: res.stderr,
      orphanNodesDelta,
      timedOut: res.timedOut
    };
  }

  public static async runPlaytestScenario(
    projectDir: string,
    scenarioPath?: string,
    godotBinary?: string
  ): Promise<TestExecutionResult> {
    const install = GodotLocator.findGodot(godotBinary);
    if (!install) {
      return { passed: false, exitCode: 1, durationMs: 0, stdout: '', stderr: 'Godot binary not found', timedOut: false };
    }

    const runnerScene = path.join(projectDir, 'addons', 'aegis_bridge', 'runner.tscn');
    const targetScene = scenarioPath || (fs.existsSync(runnerScene) ? 'res://addons/aegis_bridge/runner.tscn' : undefined);
    const args = GodotPortRouter.buildCliArgs({
      worktreeOrRole: path.basename(projectDir),
      scene: targetScene,
      fixedFps: 60,
      timeScale: 5.0
    });

    const start = Date.now();
    const res = await GodotProcessWatchdog.executeWithWatchdog(install.binaryPath, ['--path', projectDir, ...args], { timeoutMs: 20000 });
    const durationMs = Date.now() - start;
    const passed = res.exitCode === 0 && !res.timedOut;

    return {
      passed,
      exitCode: res.exitCode,
      durationMs,
      stdout: res.stdout,
      stderr: res.stderr,
      timedOut: res.timedOut
    };
  }
}
