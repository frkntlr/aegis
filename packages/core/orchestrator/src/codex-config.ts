import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse, stringify, type TomlTable } from 'smol-toml';

export interface CodexMcpServer {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  disabled?: boolean;
  cwd?: string;
}

function requireTable(value: unknown, label: string): void {
  if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof Date)) {
    throw new Error(`Codex ${label} must be a TOML table`);
  }
}

/** Merge TOML semantically; invalid existing configuration must never be overwritten. */
export function syncCodexMcp(repoRoot: string, servers: Record<string, CodexMcpServer>): string {
  const target = path.resolve(repoRoot, '.codex', 'config.toml');
  const config = fs.existsSync(target) ? parse(fs.readFileSync(target, 'utf8')) : {};
  const existing = config.mcp_servers;
  requireTable(existing, 'mcp_servers');
  const merged: TomlTable = { ...(existing as TomlTable | undefined) };
  for (const [name, server] of Object.entries(servers)) {
    requireTable(merged[name], `mcp_servers.${name}`);
    const fields = Object.fromEntries(Object.entries(server).filter(([key, val]) => key !== 'disabled' && val !== undefined));
    if (server.disabled !== undefined) fields.enabled = !server.disabled;
    const entry = { ...(merged[name] as TomlTable | undefined), ...fields } as TomlTable;
    if (server.url) {
      for (const key of ['command', 'args', 'env', 'cwd']) delete entry[key];
    } else if (server.command) {
      for (const key of ['url', 'bearer_token_env_var', 'http_headers', 'env_http_headers']) delete entry[key];
    }
    merged[name] = entry;
  }
  config.mcp_servers = merged;
  const output = stringify(config);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, output, 'utf8');
  return target;
}
