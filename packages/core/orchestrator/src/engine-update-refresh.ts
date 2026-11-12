import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AntigravityInstaller } from './antigravity-installer.js';
import { CodexInstaller } from './codex-installer.js';
import { AEGIS_TOOL_SCHEMAS } from './mcp-tool-schemas.js';

interface SetupHelpers {
  configureAntigravity(engine: string, project: string): string[];
  installUserShims(engine: string, prefix: string, platform?: string): string[];
}

function setupHelpers(engineRoot: string): SetupHelpers {
  return require(path.join(engineRoot, 'scripts/setup-aegis-config.cjs')) as SetupHelpers;
}

export function resolveUpdateEngineRoot(explicit?: string): string {
  const candidates = explicit ? [path.resolve(explicit)] : [path.resolve(__dirname, '../../../..')];
  const root = candidates.find(candidate => {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(candidate, 'package.json'), 'utf8').replace(/^\uFEFF/, '')) as { name?: string };
      return pkg.name === 'aegis' && fs.existsSync(path.join(candidate, 'packages/cli'));
    } catch { return false; }
  });
  if (!root) throw new Error('Cannot locate the installed Aegis engine checkout; update requires its package.json and packages/cli');
  return root;
}

function refreshShims(directory: string, engineRoot: string): number {
  const prefix = process.platform === 'win32' ? directory : path.dirname(directory);
  const files = setupHelpers(engineRoot).installUserShims(engineRoot, prefix);
  for (const file of files) fs.accessSync(file, fs.constants.R_OK);
  return files.length / (process.platform === 'win32' ? 2 : 1);
}

function refreshAntigravity(engineRoot: string, userHome: string): number {
  if (!fs.existsSync(path.join(userHome, '.gemini/config/plugins/aegis')) &&
      !fs.existsSync(path.join(userHome, '.gemini/antigravity/bin/aegis.cmd'))) return 0;
  const template = path.join(engineRoot, 'templates/skills/aegis/SKILL.md');
  fs.accessSync(template, fs.constants.R_OK);
  AntigravityInstaller.installPlugin(userHome, engineRoot);
  const installed = path.join(userHome, '.gemini/config/plugins/aegis/skills/aegis/SKILL.md');
  if (!fs.readFileSync(template).equals(fs.readFileSync(installed))) throw new Error('Antigravity skill refresh failed');
  const schemas = path.join(userHome, '.gemini/antigravity/mcp/aegis');
  AntigravityInstaller.writeMcpSchemas(schemas);
  for (const name of Object.keys(AEGIS_TOOL_SCHEMAS)) fs.accessSync(path.join(schemas, `${name}.json`), fs.constants.R_OK);
  return refreshShims(path.join(userHome, '.gemini/antigravity/bin'), engineRoot);
}

function refreshProjectAntigravity(engineRoot: string, projectRoot: string): string[] {
  const refreshed: string[] = [];
  for (const project of new Set([path.resolve(engineRoot), path.resolve(projectRoot)])) {
    if (!fs.existsSync(path.join(project, '.gemini/config/plugins/aegis'))) continue;
    setupHelpers(engineRoot).configureAntigravity(engineRoot, project);
    refreshed.push(`Google Antigravity (project: ${project})`);
  }
  return refreshed;
}

function isCodexProject(projectRoot: string): boolean {
  const agents = path.join(projectRoot, 'AGENTS.md');
  if (fs.existsSync(agents) && fs.readFileSync(agents, 'utf8').includes('<!-- aegis:codex:start -->')) return true;
  const config = path.join(projectRoot, '.codex/config.toml');
  return fs.existsSync(config) && /\[mcp_servers\.aegis\]/.test(fs.readFileSync(config, 'utf8'));
}

function refreshCodex(engineRoot: string, projectRoot: string, home: string, explicitHome?: string): string[] {
  const refreshed: string[] = [];
  if (fs.existsSync(path.join(home, '.agents/skills/aegis/SKILL.md'))) {
    const script = path.join(engineRoot, 'scripts/install-codex-commands.cjs');
    cp.execFileSync(process.execPath, [script, ...(explicitHome ? [explicitHome] : [])], {
      cwd: engineRoot, timeout: 30000, stdio: ['ignore', 'pipe', 'pipe']
    });
    refreshed.push('OpenAI Codex (user skill)');
  }
  for (const project of new Set([path.resolve(engineRoot), path.resolve(projectRoot)])) {
    if (!isCodexProject(project)) continue;
    CodexInstaller.install(project, engineRoot);
    refreshed.push(`OpenAI Codex (project: ${project})`);
  }
  return refreshed;
}

export function refreshEngineInstallations(engineRoot: string, projectRoot: string, userHome?: string): {
  shimsCount: number; idesSynced: string[]; worktreesSynced: number;
} {
  const home = userHome ?? os.homedir();
  const idesSynced = refreshCodex(engineRoot, projectRoot, home, userHome);
  idesSynced.push(...refreshProjectAntigravity(engineRoot, projectRoot));
  let shimsCount = refreshAntigravity(engineRoot, home);
  if (shimsCount) idesSynced.push('Google Antigravity (current user)');
  const npmBin = process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : undefined;
  if (!userHome && npmBin && fs.existsSync(path.join(npmBin, 'aegis.cmd'))) {
    shimsCount += refreshShims(npmBin, engineRoot);
  }
  return { shimsCount, idesSynced, worktreesSynced: 0 };
}
