import * as fs from 'node:fs';
import * as path from 'node:path';
import { AEGIS_TOOL_SCHEMAS } from './mcp-tool-schemas.js';

export interface DiscoveredSkill {
  name: string;
  description: string;
  path: string;
}

export interface McpServerDefinition {
  name: string;
  command?: string;
  args?: string[];
  url?: string;
  transport: 'stdio' | 'sse';
}

export interface ToolchainSyncReport {
  timestamp: string;
  skillsFound: number;
  mcpServersFound: number;
  syncedIdes: string[];
  warnings: string[];
  success: boolean;
}

export class UniversalToolchainSync {
  private repoRoot: string;

  constructor(repoRoot?: string) {
    this.repoRoot = repoRoot ?? process.cwd();
  }

  public discoverSkills(): DiscoveredSkill[] {
    const skills: DiscoveredSkill[] = [];
    const skillsDir = path.resolve(this.repoRoot, '.agents', 'skills');
    if (!fs.existsSync(skillsDir)) return skills;

    try {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillMd = path.join(skillsDir, entry.name, 'SKILL.md');
        if (fs.existsSync(skillMd)) {
          const content = fs.readFileSync(skillMd, 'utf8');
          const descMatch = content.match(/description:\s*(?:>-|>)?\s*([^\n\r]+)/i);
          skills.push({
            name: entry.name,
            description: descMatch ? descMatch[1].trim() : 'Aegis Agent Skill',
            path: skillMd
          });
        }
      }
    } catch {
      // Ignore read errors
    }
    return skills;
  }

  public discoverMcpServers(): McpServerDefinition[] {
    const servers: McpServerDefinition[] = [];
    let cursorMcp = path.resolve(this.repoRoot, '.cursor', 'mcp.json');
    if (!fs.existsSync(cursorMcp)) {
      cursorMcp = path.resolve(this.repoRoot, '.cursor', 'mcp.example.json');
    }
    if (fs.existsSync(cursorMcp)) {
      try {
        const data = JSON.parse(fs.readFileSync(cursorMcp, 'utf8'));
        if (data.mcpServers) {
          interface RawMcpServerCfg { command?: string; args?: string[]; url?: string; }
          for (const [name, cfg] of Object.entries<RawMcpServerCfg>(data.mcpServers)) {
            servers.push({
              name,
              command: cfg.command,
              args: cfg.args,
              url: cfg.url,
              transport: cfg.url ? 'sse' : 'stdio'
            });
          }
        }
      } catch {
        // Fallback on corrupt JSON
      }
    }
    if (servers.length === 0) {
      servers.push(
        { name: 'aegis-engine', command: 'node', args: ['packages/cli/dist/bin/aegis.js'], transport: 'stdio' },
        { name: 'ast-grep', command: 'npx', args: ['@ast-grep/mcp'], transport: 'stdio' },
        { name: 'context7', command: 'npx', args: ['context7-mcp'], transport: 'stdio' }
      );
    }
    return servers;
  }

  private readExistingServers(jsonPath: string, key: 'mcpServers' | 'servers'): Record<string, unknown> {
    if (!fs.existsSync(jsonPath)) return {};
    try {
      const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      if (parsed?.[key] && typeof parsed[key] === 'object') {
        return parsed[key] as Record<string, unknown>;
      }
    } catch { /* ignore corrupt json */ }
    return {};
  }

  private updateCursorRules(skills: DiscoveredSkill[]): void {
    const rulesFile = path.resolve(this.repoRoot, '.cursorrules');
    const skillLines = skills.map(s => `- **${s.name}**: ${s.description}`).join('\n');
    const header = `# Aegis Synchronized Skills Index\n${skillLines}\n<!-- aegis:skills:end -->\n\n`;
    if (fs.existsSync(rulesFile)) {
      const existing = fs.readFileSync(rulesFile, 'utf8');
      const pattern = /# Aegis Synchronized Skills Index[\s\S]*?(?:<!-- aegis:skills:end -->\r?\n\r?\n?|(?=\r?\n#)|\n$|$)/;
      if (pattern.test(existing)) {
        fs.writeFileSync(rulesFile, existing.replace(pattern, header), 'utf8');
      } else {
        fs.writeFileSync(rulesFile, header + existing, 'utf8');
      }
    } else {
      fs.writeFileSync(rulesFile, header, 'utf8');
    }
  }

  private syncCursor(skills: DiscoveredSkill[], mcps: McpServerDefinition[], warnings: string[]): boolean {
    try {
      const cursorDir = path.resolve(this.repoRoot, '.cursor');
      fs.mkdirSync(cursorDir, { recursive: true });
      const mcpJsonPath = path.join(cursorDir, 'mcp.json');
      const existingServers = this.readExistingServers(mcpJsonPath, 'mcpServers');
      const mcpConfig = { mcpServers: { ...existingServers } as Record<string, unknown> };
      for (const m of mcps) {
        mcpConfig.mcpServers[m.name] = m.url ? { url: m.url } : { command: m.command, args: m.args };
      }
      if (!mcpConfig.mcpServers['aegis-engine']) {
        mcpConfig.mcpServers['aegis-engine'] = { command: 'node', args: ['packages/cli/dist/bin/aegis.js'] };
      }
      fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2), 'utf8');
      this.registerAegisMcpServer(mcpJsonPath);
      this.updateCursorRules(skills);
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
      const existingServers = this.readExistingServers(mcpJsonPath, 'servers');
      const mcpConfig = { servers: { ...existingServers } as Record<string, unknown> };
      for (const m of mcps) {
        mcpConfig.servers[m.name] = m.url ? { url: m.url } : { command: m.command, args: m.args };
      }
      if (!mcpConfig.servers['aegis-engine']) {
        mcpConfig.servers['aegis-engine'] = { command: 'node', args: ['packages/cli/dist/bin/aegis.js'] };
      }
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
      const existing = this.readExistingServers(mcpJsonPath, 'mcpServers');
      const mcpConfig = { mcpServers: { ...existing } as Record<string, unknown> };
      for (const m of mcps) {
        mcpConfig.mcpServers[m.name] = m.url ? { url: m.url } : { command: m.command, args: m.args };
      }
      fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2), 'utf8');
      const userHome = process.env.USERPROFILE || process.env.HOME || '';
      const isTemp = this.repoRoot.includes('Temp') || this.repoRoot.includes('tmp') || !fs.existsSync(path.resolve(this.repoRoot, 'packages', 'cli', 'dist', 'bin', 'aegis.js'));
      if (!isTemp && userHome && fs.existsSync(path.resolve(userHome, '.gemini'))) {
        this.syncGlobalAntigravity(userHome);
      }
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push("Antigravity senkronizasyon hatasi: " + msg);
      return false;
    }
  }

  private registerAegisMcpServer(mcpJsonPath: string): void {
    if (!fs.existsSync(path.dirname(mcpJsonPath))) return;
    try {
      const cliPath = path.resolve(this.repoRoot, 'packages', 'cli', 'dist', 'bin', 'aegis.js');
      let data: { mcpServers?: Record<string, unknown> } = {};
      if (fs.existsSync(mcpJsonPath)) {
        data = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8'));
      }
      data.mcpServers = data.mcpServers || {};
      data.mcpServers.aegis = {
        command: process.execPath,
        args: [cliPath, 'mcp']
      };
      fs.writeFileSync(mcpJsonPath, JSON.stringify(data, null, 2), 'utf8');
    } catch { /* ignore non-fatal */ }
  }

  private syncGlobalAntigravity(userHome: string): void {
    const globalSkillDir = path.resolve(userHome, '.gemini', 'config', 'skills', 'aegis');
    const localSkill = path.resolve(this.repoRoot, '.agents', 'skills', 'aegis', 'SKILL.md');
    if (fs.existsSync(localSkill)) {
      fs.mkdirSync(globalSkillDir, { recursive: true });
      fs.copyFileSync(localSkill, path.join(globalSkillDir, 'SKILL.md'));
    }
    const schemaDir = path.resolve(userHome, '.gemini', 'antigravity', 'mcp', 'aegis');
    fs.mkdirSync(schemaDir, { recursive: true });
    this.writeAegisMcpSchemas(schemaDir);
    const globalMcp = path.resolve(userHome, '.gemini', 'config', 'mcp_config.json');
    this.registerAegisMcpServer(globalMcp);
  }

  private writeAegisMcpSchemas(dir: string): void {
    for (const [name, meta] of Object.entries(AEGIS_TOOL_SCHEMAS)) {
      const schema = {
        name,
        description: meta.desc,
        parameters: { properties: meta.props, required: meta.req, type: 'object' }
      };
      fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(schema, null, 2), 'utf8');
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
      success: warnings.length === 0
    };
  }
}
