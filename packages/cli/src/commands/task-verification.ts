import * as fs from 'node:fs';
import * as path from 'node:path';
import { IronCageValidator } from '@aegis/iron-cage';
import { GodotTestRunner } from '@aegis/godot-bridge';
import { resolveSafeRepoRoot } from '@aegis/shared';
import { showBanner } from './banner.js';
import { getChangedSourceFiles, verifyFile } from './dev-helpers.js';

function resolveTargetFile(file: string): string {
  if (fs.existsSync(file)) return file;
  const fromRoot = path.resolve(resolveSafeRepoRoot(), file);
  if (fs.existsSync(fromRoot)) return fromRoot;
  if (file.startsWith('packages/cli/') && fs.existsSync(file.replace('packages/cli/', ''))) {
    return file.replace('packages/cli/', '');
  }
  return file;
}

async function verifyGodotProject(): Promise<boolean> {
  const projectDir = process.cwd();
  if (!fs.existsSync(path.join(projectDir, 'project.godot'))) {
    console.log('Godot playtest: not applicable (no project.godot in the working directory).');
    return true;
  }
  console.log('Godot project detected: running headless playtest...');
  try {
    const result = await GodotTestRunner.runPlaytestScenario(projectDir);
    if (result.stdout) console.log(result.stdout);
    if (result.stderr) console.error(result.stderr);
    if (result.passed && result.exitCode === 0 && !result.timedOut) {
      console.log('Godot runtime playtest passed.');
      return true;
    }
    console.error(`Godot runtime playtest failed: exit=${result.exitCode}, timedOut=${result.timedOut}`);
  } catch (error) {
    console.error(`Godot runtime playtest failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return false;
}

export async function handleTaskVerify(targetArg?: string): Promise<void> {
  showBanner();
  console.log('Running task quality gate (Iron Cage and Godot runtime when applicable)...');
  const validator = new IronCageValidator();
  const rawChanged = targetArg ? [targetArg] : getChangedSourceFiles();
  let files = rawChanged.map(resolveTargetFile);
  if (files.length === 0) {
    const candidate = fs.existsSync('packages/cli/src/bin/aegis.ts') ? 'packages/cli/src/bin/aegis.ts' : 'src/bin/aegis.ts';
    if (fs.existsSync(candidate)) files = [candidate];
  }
  let allValid = true;
  if (files.length === 0) console.log('No source files selected for Iron Cage validation.');
  for (const file of files) {
    if (!verifyFile(file, validator)) allValid = false;
  }
  if (!await verifyGodotProject()) allValid = false;
  if (!allValid) {
    console.error('Task Verification FAILED: source or runtime verification failed.');
    process.exitCode = 1;
  } else {
    console.log('Task Verification PASSED: selected source and applicable runtime checks passed.');
  }
}
