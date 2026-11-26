import * as fs from 'node:fs';
import * as path from 'node:path';
import { debugLogIgnored, readJsonSafe } from '@aegis/shared';

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
  env?: Record<string, string>;
  disabled?: boolean;
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

export function discoverSkillsInRepo(repoRoot: string): DiscoveredSkill[] {
  const skills: DiscoveredSkill[] = [];
  const candidates = [
    path.resolve(repoRoot, 'templates', 'skills'),
    path.resolve(repoRoot, '.agents', 'skills'),
  ];
  const skillsDir = candidates.find((d) => fs.existsSync(d));
  if (!skillsDir) return skills;

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
          path: skillMd,
        });
      }
    }
  } catch (err: unknown) {
    debugLogIgnored('ToolchainSync:discoverSkills', err);
  }
  return skills;
}

interface RawMcpServerCfg {
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  disabled?: boolean;
}

function readCursorMcpFile(cursorMcp: string): McpServerDefinition[] {
  const servers: McpServerDefinition[] = [];
  if (!fs.existsSync(cursorMcp)) return servers;
  try {
    const data = readJsonSafe<{ mcpServers?: Record<string, RawMcpServerCfg> }>(cursorMcp);
    if (!data.mcpServers) return servers;
    for (const [name, cfg] of Object.entries(data.mcpServers)) {
      servers.push({
        name,
        command: cfg.command,
        args: cfg.args,
        url: cfg.url,
        env: cfg.env,
        disabled: cfg.disabled,
        transport: cfg.url ? 'sse' : 'stdio',
      });
    }
  } catch (err: unknown) {
    debugLogIgnored('ToolchainSync:discoverMcpServers', err);
  }
  return servers;
}

export function discoverMcpServersInRepo(repoRoot: string): McpServerDefinition[] {
  let cursorMcp = path.resolve(repoRoot, '.cursor', 'mcp.json');
  if (!fs.existsSync(cursorMcp)) {
    cursorMcp = path.resolve(repoRoot, '.cursor', 'mcp.example.json');
  }
  const servers = readCursorMcpFile(cursorMcp);
  if (servers.length === 0) {
    servers.push(
      { name: 'aegis-engine', command: 'node', args: ['packages/cli/dist/bin/aegis.js', 'mcp'], transport: 'stdio' },
      { name: 'ast-grep', command: 'npx', args: ['@ast-grep/mcp'], transport: 'stdio' },
      { name: 'context7', command: 'npx', args: ['context7-mcp'], transport: 'stdio' },
    );
  }
  return servers;
}

export function readExistingMcpServers(
  jsonPath: string,
  key: 'mcpServers' | 'servers',
): Record<string, unknown> {
  if (!fs.existsSync(jsonPath)) return {};
  try {
    const parsed = readJsonSafe<Record<string, unknown>>(jsonPath);
    if (parsed?.[key] && typeof parsed[key] === 'object') {
      return parsed[key] as Record<string, unknown>;
    }
  } catch (err: unknown) {
    debugLogIgnored('ToolchainSync:readExistingServers', err);
  }
  return {};
}

export function mergeMcpServerEntries(
  existing: Record<string, unknown>,
  mcps: McpServerDefinition[],
  includeEngineFallback: boolean,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };
  for (const m of mcps) {
    merged[m.name] = m.url ? { url: m.url } : { command: m.command, args: m.args };
  }
  if (includeEngineFallback && !merged['aegis-engine']) {
    merged['aegis-engine'] = { command: 'node', args: ['packages/cli/dist/bin/aegis.js', 'mcp'] };
  }
  return merged;
}

export function updateCursorRulesFile(repoRoot: string, skills: DiscoveredSkill[]): void {
  const rulesFile = path.resolve(repoRoot, '.cursorrules');
  const skillLines = skills.map((s) => `- **${s.name}**: ${s.description}`).join('\n');
  const header = `# Aegis Synchronized Skills Index\n${skillLines}\n<!-- aegis:skills:end -->\n\n`;
  if (fs.existsSync(rulesFile)) {
    const existing = fs.readFileSync(rulesFile, 'utf8');
    const pattern =
      /# Aegis Synchronized Skills Index[\s\S]*?(?:<!-- aegis:skills:end -->\r?\n\r?\n?|(?=\r?\n#)|\n$|$)/;
    if (pattern.test(existing)) {
      fs.writeFileSync(rulesFile, existing.replace(pattern, header), 'utf8');
    } else {
      fs.writeFileSync(rulesFile, header + existing, 'utf8');
    }
  } else {
    fs.writeFileSync(rulesFile, header, 'utf8');
  }
}

export function registerAegisMcpServerInFile(repoRoot: string, mcpJsonPath: string): void {
  if (!fs.existsSync(path.dirname(mcpJsonPath))) return;
  try {
    const cliPath = path.resolve(repoRoot, 'packages', 'cli', 'dist', 'bin', 'aegis.js');
    const relCfg = path.relative(repoRoot, mcpJsonPath);
    const isInsideRepo = Boolean(relCfg) && !relCfg.startsWith('..') && !path.isAbsolute(relCfg);
    const entry = isInsideRepo
      ? { command: 'node', args: [path.relative(repoRoot, cliPath).replace(/\\/g, '/'), 'mcp'] }
      : { command: process.execPath, args: [cliPath, 'mcp'] };
    const data = fs.existsSync(mcpJsonPath) ? readJsonSafe<Record<string, unknown>>(mcpJsonPath) : {};
    const key = typeof data.servers === 'object' && data.servers !== null ? 'servers' : 'mcpServers';
    const map =
      typeof data[key] === 'object' && data[key] !== null
        ? (data[key] as Record<string, unknown>)
        : {};
    map.aegis = entry;
    data[key] = map;
    fs.writeFileSync(mcpJsonPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err: unknown) {
    debugLogIgnored('ToolchainSync:registerAegisMcpServer', err);
  }
}
