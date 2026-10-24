import * as fs from 'node:fs';
import * as path from 'node:path';
import type { IdeAdapter } from './ide-adapter.js';

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
}

export interface McpSyncResult {
  ideId: string;
  targetFile?: string;
  supported: boolean;
  syncedServersCount: number;
  message: string;
}

export class McpSkillsSyncEngine {
  private servers: Map<string, McpServerConfig> = new Map();

  constructor(defaultServers: Record<string, McpServerConfig> = {}) {
    for (const [name, config] of Object.entries(defaultServers)) {
      this.servers.set(name, config);
    }
  }

  public registerServer(name: string, config: McpServerConfig): void {
    this.servers.set(name, config);
  }

  public getServers(): Record<string, McpServerConfig> {
    const obj: Record<string, McpServerConfig> = {};
    for (const [name, cfg] of this.servers.entries()) {
      obj[name] = cfg;
    }
    return obj;
  }

  private writeConfigFile(targetPath: string, content: unknown): void {
    const dir = path.dirname(targetPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(targetPath, JSON.stringify(content, null, 2), 'utf8');
  }

  public syncToIde(adapter: IdeAdapter, repoRoot: string): McpSyncResult {
    if (!adapter.capabilities.supportsMcp || !adapter.capabilities.mcpConfigFile) {
      return {
        ideId: adapter.ideId,
        supported: false,
        syncedServersCount: 0,
        message: `IDE [${adapter.name}] does not support MCP configuration.`
      };
    }

    const targetFile = path.resolve(repoRoot, adapter.capabilities.mcpConfigFile);
    let existingConfig: Record<string, unknown> = {};
    if (fs.existsSync(targetFile)) {
      try {
        existingConfig = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
      } catch {
        existingConfig = {};
      }
    }
    const existingServers = (typeof existingConfig.mcpServers === 'object' && existingConfig.mcpServers !== null && !Array.isArray(existingConfig.mcpServers))
      ? (existingConfig.mcpServers as Record<string, unknown>)
      : {};
    const mergedServers = { ...existingServers, ...this.getServers() };
    const mcpPayload = { ...existingConfig, mcpServers: mergedServers };
    this.writeConfigFile(targetFile, mcpPayload);

    return {
      ideId: adapter.ideId,
      targetFile,
      supported: true,
      syncedServersCount: Object.keys(mergedServers).length,
      message: `Synchronized ${this.servers.size} MCP servers into [${adapter.capabilities.mcpConfigFile}].`
    };
  }

  public syncAll(adapters: IdeAdapter[], repoRoot: string): McpSyncResult[] {
    const results: McpSyncResult[] = [];
    for (const adapter of adapters) {
      results.push(this.syncToIde(adapter, repoRoot));
    }
    return results;
  }
}
