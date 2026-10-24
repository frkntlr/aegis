import * as fs from 'node:fs';
import * as path from 'node:path';

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
      servers.push({ name: 'aegis-engine', command: 'node', args: ['packages/cli/dist/bin/aegis.js'], transport: 'stdio' });
    }
    return servers;
  }

  private syncCursor(skills: DiscoveredSkill[], mcps: McpServerDefinition[], warnings: string[]): boolean {
    try {
      const cursorDir = path.resolve(this.repoRoot, '.cursor');
      fs.mkdirSync(cursorDir, { recursive: true });
      const mcpConfig: { mcpServers: Record<string, unknown> } = { mcpServers: {} };
      for (const m of mcps) {
        mcpConfig.mcpServers[m.name] = m.url ? { url: m.url } : { command: m.command, args: m.args };
      }
      fs.writeFileSync(path.join(cursorDir, 'mcp.json'), JSON.stringify(mcpConfig, null, 2), 'utf8');

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
      const mcpConfig: { servers: Record<string, unknown> } = { servers: {} };
      for (const m of mcps) {
        mcpConfig.servers[m.name] = m.url ? { url: m.url } : { command: m.command, args: m.args };
      }
      fs.writeFileSync(path.join(vscodeDir, 'mcp.json'), JSON.stringify(mcpConfig, null, 2), 'utf8');
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`VS Code senkronizasyon hatası: ${msg}`);
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

    const agySkills = path.resolve(this.repoRoot, '.agents', 'skills');
    const isAgyPresent = fs.existsSync(agySkills) || fs.existsSync(path.resolve(this.repoRoot, '.gemini')) || Boolean(process.env.ANTIGRAVITY_ENV);
    if (isAgyPresent) {
      syncedIdes.push('Google Antigravity');
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
