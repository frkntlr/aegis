/**
 * @file ide-commands.ts
 * IDE adapters, exclusions, and MCP toolchain synchronization CLI commands.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as path from 'node:path';
import {
  IdeAdapterRegistry,
  McpSkillsSyncEngine,
  UniversalToolchainSync
} from '@aegis/orchestrator';
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
  } catch {
    // Ignore non-fatal auto-install errors
  }
}

export function setupIdeExclusions(repoRoot: string): void {
  const registry = new IdeAdapterRegistry();
  const results = registry.setupAll(repoRoot);
  const universal = new UniversalToolchainSync(process.cwd());
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

export function handleIdeSync(): void {
  showBanner();
  console.log('🔄 Synchronizing MCP Servers & Skills across all supported IDEs...');
  const registry = new IdeAdapterRegistry();
  const engine = new McpSkillsSyncEngine({
    notebooklm: {
      command: 'C:\\Program Files\\nodejs\\node.exe',
      args: ['C:\\Users\\Lenovo\\Documents\\work\\notebooklm\\notebooklm-mcp-server\\dist\\index.js', 'server']
    },
    godot: {
      command: 'C:\\Program Files\\nodejs\\node.exe',
      args: ['C:\\Users\\Lenovo\\AppData\\Roaming\\npm\\node_modules\\godot-mcp-runtime\\dist\\index.js'],
      env: { GODOT_MCP_DISABLE_ELICITATION: 'true' }
    }
  });

  const results = engine.syncAll(registry.listAdapters(), process.cwd());
  new UniversalToolchainSync(process.cwd()).syncAll();
  for (const r of results) {
    if (r.supported) {
      console.log(`✅ [${r.ideId}] ${r.message}`);
    } else {
      console.log(`⚠️  [${r.ideId}] ${r.message}`);
    }
  }
}
