/**
 * @file ide-commands.ts
 * IDE adapters, exclusions, and MCP toolchain synchronization CLI commands.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as path from 'node:path';
import { debugLogIgnored } from '@aegis/shared';
import {
  IdeAdapterRegistry,
  McpSkillsSyncEngine,
  UniversalToolchainSync,
  type McpServerConfig
} from '@aegis/orchestrator';
import { CodexInstaller } from '@aegis/orchestrator';
import { GodotInitWorkflow } from '@aegis/godot-bridge';
import { showBanner } from './banner.js';

export function autoConfigureGodot(repoRoot: string): void {
  try {
    const res = GodotInitWorkflow.autoInstallIfGodot(repoRoot);
    if (res && res.installedAddonFiles.length > 0) {
      console.log(`🎮 Godot project detected: Automatically installed Aegis Bridge addon (${res.installedAddonFiles.length} files).`);
    } else if (res) {
      console.log('🎮 Godot project detected: Aegis Bridge verified and active.');
    }
  } catch (err: unknown) {
    debugLogIgnored('ide-commands:autoConfigureGodot', err);
  }
}

export function setupIdeExclusions(repoRoot: string): void {
  const registry = new IdeAdapterRegistry();
  const results = registry.setupAll(repoRoot);
  const universal = new UniversalToolchainSync(repoRoot);
  universal.syncAll();
  for (const r of results) {
    if (r.success) {
      const fileNames = r.configuredFiles.map(f => path.basename(f)).join(', ');
      console.log(`✅ IDE isolation rules configured for [${r.ideId}] (${fileNames}).`);
    }
  }
  autoConfigureGodot(repoRoot);
}

export function handleIdeList(): void {
  showBanner();
  console.log('💻 Supported IDEs and Multi-Agent Environments:');
  const registry = new IdeAdapterRegistry();
  for (const a of registry.listAdapters()) {
    const mcp = a.capabilities.supportsMcp ? '✅ MCP' : '❌ No MCP';
    const skills = a.capabilities.supportsSkills ? '✅ Skills' : '❌ No Skills';
    const subagents = a.capabilities.supportsSubagents ? '✅ Subagents' : '❌ Single-agent';
    console.log(` • [${a.ideId}] ${a.name}`);
    console.log(`    Capabilities: ${mcp} | ${skills} | ${subagents}`);
    if (a.capabilities.mcpConfigFile) {
      console.log(`    Config:       ${a.capabilities.mcpConfigFile}`);
    }
  }
}

export function buildIdeMcpServers(
  repoRoot: string,
  engineRoot: string,
  platform: NodeJS.Platform = process.platform
): Record<string, McpServerConfig> {
  const resolvedEngine = path.resolve(engineRoot);
  const resolvedRepo = path.resolve(repoRoot);
  const isSameRoot = platform === 'win32'
    ? resolvedEngine.toLowerCase() === resolvedRepo.toLowerCase()
    : resolvedEngine === resolvedRepo;
  const cliEntry = isSameRoot
    ? 'packages/cli/dist/bin/aegis.js'
    : path.join(engineRoot, 'packages', 'cli', 'dist', 'bin', 'aegis.js');
  return {
    'aegis-engine': {
      command: 'node',
      args: [cliEntry, 'mcp']
    }
  };
}

export function handleIdeSync(): void {
  showBanner();
  console.log('🔄 Synchronizing MCP Servers & Skills across all supported IDEs...');
  const registry = new IdeAdapterRegistry();
  const repoRoot = process.cwd();
  const engineRoot = CodexInstaller.resolveEngineRoot(repoRoot);
  const engine = new McpSkillsSyncEngine(buildIdeMcpServers(repoRoot, engineRoot));

  const results = engine.syncAll(registry.listAdapters(), repoRoot);
  new UniversalToolchainSync(repoRoot).syncAll();
  for (const r of results) {
    if (r.supported) {
      console.log(`✅ [${r.ideId}] ${r.message}`);
    } else {
      console.log(`⚠️  [${r.ideId}] ${r.message}`);
    }
  }
}
