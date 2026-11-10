import * as fs from 'node:fs';
import * as path from 'node:path';
import { CodexAdapter, CodexInstaller } from '@aegis/orchestrator';

export function handleCodexSetup(projectDir?: string): void {
  const repoRoot = path.resolve(projectDir ?? process.cwd());
  const engineRoot = CodexInstaller.resolveEngineRoot(repoRoot);
  const packageFile = path.join(repoRoot, 'package.json');
  if (!fs.existsSync(path.join(repoRoot, '.git')) && !fs.existsSync(packageFile) &&
      !fs.existsSync(path.join(repoRoot, 'project.godot'))) {
    throw new Error(`Not a project directory: ${repoRoot}`);
  }
  const files = CodexInstaller.install(repoRoot, engineRoot);
  new CodexAdapter().setupExclusions(repoRoot);
  console.log(`Codex configured for ${repoRoot}`);
  for (const file of files) console.log(` • ${path.relative(repoRoot, file)}`);
  console.log('Open this project in Codex or restart its MCP connection to load Aegis.');
}
