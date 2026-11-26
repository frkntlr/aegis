import * as fs from 'node:fs';
import * as path from 'node:path';
import { AntigravityInstaller } from './antigravity-installer.js';
import { CodexInstaller } from './codex-installer.js';
import {
  type DiscoveredSkill,
  discoverMcpServersInRepo,
  discoverSkillsInRepo,
  type McpServerDefinition,
  mergeMcpServerEntries,
  readExistingMcpServers,
  registerAegisMcpServerInFile,
  type ToolchainSyncReport,
  updateCursorRulesFile,
} from './toolchain-sync-helpers.js';

export type { DiscoveredSkill, McpServerDefinition, ToolchainSyncReport };

export class UniversalToolchainSync {
  private repoRoot: string;

  constructor(repoRoot?: string) {
    this.repoRoot = repoRoot ?? process.cwd();
  }

  public discoverSkills(): DiscoveredSkill[] {
    return discoverSkillsInRepo(this.repoRoot);
  }

  public discoverMcpServers(): McpServerDefinition[] {
    return discoverMcpServersInRepo(this.repoRoot);
  }

  private syncCursor(
    skills: DiscoveredSkill[],
    mcps: McpServerDefinition[],
    warnings: string[],
  ): boolean {
    try {
      const cursorDir = path.resolve(this.repoRoot, '.cursor');
      fs.mkdirSync(cursorDir, { recursive: true });
      const mcpJsonPath = path.join(cursorDir, 'mcp.json');
      const existingServers = readExistingMcpServers(mcpJsonPath, 'mcpServers');
      const mcpConfig = { mcpServers: mergeMcpServerEntries(existingServers, mcps, true) };
      fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2), 'utf8');
      registerAegisMcpServerInFile(this.repoRoot, mcpJsonPath);
      updateCursorRulesFile(this.repoRoot, skills);
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`Cursor senkronizasyon hatası: ${msg}`);
      return false;
    }
  }

  private syncVSCode(mcps: McpServerDefinition[], warnings: string[]): boolean {
    try {
      const vscodeDir = path.resolve(this.repoRoot, '.vscode');
      fs.mkdirSync(vscodeDir, { recursive: true });
      const mcpJsonPath = path.join(vscodeDir, 'mcp.json');
      const existingServers = readExistingMcpServers(mcpJsonPath, 'servers');
      const mcpConfig = { servers: mergeMcpServerEntries(existingServers, mcps, true) };
      fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2), 'utf8');
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`VS Code senkronizasyon hatası: ${msg}`);
      return false;
    }
  }

  private syncAntigravity(mcps: McpServerDefinition[], warnings: string[]): boolean {
    try {
      const geminiDir = path.resolve(this.repoRoot, '.gemini', 'config');
      fs.mkdirSync(geminiDir, { recursive: true });
      const mcpJsonPath = path.join(geminiDir, 'mcp_config.json');
      const existing = readExistingMcpServers(mcpJsonPath, 'mcpServers');
      const mcpConfig = { mcpServers: mergeMcpServerEntries(existing, mcps, false) };
      fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2), 'utf8');
      const userHome = process.env.USERPROFILE || process.env.HOME || '';
      const isTemp =
        this.repoRoot.includes('Temp') ||
        this.repoRoot.includes('tmp') ||
        !fs.existsSync(path.resolve(this.repoRoot, 'packages', 'cli', 'dist', 'bin', 'aegis.js'));
      if (!isTemp && userHome && fs.existsSync(path.resolve(userHome, '.gemini'))) {
        this.syncGlobalAntigravity(userHome);
      }
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`Antigravity senkronizasyon hatasi: ${msg}`);
      return false;
    }
  }

  private syncGlobalAntigravity(userHome: string): void {
    AntigravityInstaller.syncGlobal(userHome, this.repoRoot, (cfg) =>
      registerAegisMcpServerInFile(this.repoRoot, cfg),
    );
  }

  private syncCodex(mcps: McpServerDefinition[], warnings: string[]): boolean {
    try {
      const servers = Object.fromEntries(
        mcps
          .filter((m) => m.name !== 'aegis-engine' && m.name !== 'aegis')
          .map((m) => [
            m.name,
            {
              command: m.command,
              args: m.args,
              url: m.url,
              env: m.env,
              disabled: m.disabled,
              cwd: m.url ? undefined : this.repoRoot,
            },
          ]),
      );
      CodexInstaller.sync(this.repoRoot, servers);
      const engineRoot = CodexInstaller.resolveEngineRoot(this.repoRoot);
      const cli = path.resolve(engineRoot, 'packages/cli/dist/bin/aegis.js');
      if (fs.existsSync(cli)) CodexInstaller.install(this.repoRoot, engineRoot);
      return true;
    } catch (e: unknown) {
      warnings.push(`Codex synchronization failed: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  public syncAll(): ToolchainSyncReport {
    const skills = this.discoverSkills();
    const mcps = this.discoverMcpServers();
    const warnings: string[] = [];
    const syncedIdes: string[] = [];

    if (this.syncCursor(skills, mcps, warnings)) syncedIdes.push('Cursor AI');
    if (this.syncVSCode(mcps, warnings)) syncedIdes.push('VS Code');
    if (this.syncAntigravity(mcps, warnings)) syncedIdes.push('Google Antigravity');
    if (this.syncCodex(mcps, warnings)) syncedIdes.push('OpenAI Codex');
    const hasCopilot =
      fs.existsSync(path.resolve(this.repoRoot, '.github', 'copilot')) ||
      fs.existsSync(path.resolve(this.repoRoot, 'plugins', 'aegis-copilot'));
    if (hasCopilot) {
      syncedIdes.push('GitHub Copilot');
    }

    const isGodot = fs.existsSync(path.resolve(this.repoRoot, 'project.godot'));
    if (isGodot) {
      syncedIdes.push('Godot Engine (Aegis Bridge)');
    }

    return {
      timestamp: new Date().toISOString(),
      skillsFound: skills.length,
      mcpServersFound: mcps.length,
      syncedIdes,
      warnings,
      success: warnings.length === 0,
    };
  }
}
