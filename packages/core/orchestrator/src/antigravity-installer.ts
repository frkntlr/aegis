/**
 * @file antigravity-installer.ts
 * Manages Google Antigravity global plugin and shim installation.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { AEGIS_TOOL_SCHEMAS } from './mcp-tool-schemas.js';

export class AntigravityInstaller {
  public static cleanLegacy(userHome: string): void {
    const list = [
      '.gemini/config/skills/aegis',
      '.gemini/config/skills/aegist',
      '.gemini/config/skills.json',
      '.gemini/config/plugins.json'
    ];
    for (const rel of list) {
      const p = path.resolve(userHome, rel);
      if (fs.existsSync(p)) {
        try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    }
  }

  public static installPlugin(userHome: string, repoRoot: string): void {
    const localSkill = path.resolve(repoRoot, '.agents', 'skills', 'aegis', 'SKILL.md');
    const pluginDir = path.resolve(userHome, '.gemini', 'config', 'plugins', 'aegis');
    const skillDir = path.join(pluginDir, 'skills', 'aegis');
    const rulesDir = path.join(pluginDir, 'rules');

    fs.mkdirSync(skillDir, { recursive: true });
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({ name: 'aegis', version: '0.1.0' }, null, 2), 'utf8');

    if (fs.existsSync(localSkill)) fs.copyFileSync(localSkill, path.join(skillDir, 'SKILL.md'));
    const geminiMd = path.resolve(repoRoot, 'GEMINI.md');
    if (fs.existsSync(geminiMd)) fs.copyFileSync(geminiMd, path.join(rulesDir, 'AGENTS.md'));
  }

  public static installShims(userHome: string, cliPath: string): void {
    const binDir = path.resolve(userHome, '.gemini', 'antigravity', 'bin');
    if (!fs.existsSync(binDir) && process.platform !== 'win32') return;
    try {
      fs.mkdirSync(binDir, { recursive: true });
      const cmd = `@echo off\r\nnode "${cliPath}" %*\r\n`;
      const ps1 = `& node "${cliPath}" @args\r\n`;
      fs.writeFileSync(path.join(binDir, 'aegis.cmd'), cmd, 'utf8');
      fs.writeFileSync(path.join(binDir, 'aegist.cmd'), cmd, 'utf8');
      fs.writeFileSync(path.join(binDir, 'aegis.ps1'), ps1, 'utf8');
      fs.writeFileSync(path.join(binDir, 'aegist.ps1'), ps1, 'utf8');
    } catch { /* ignore non-fatal */ }
  }

  public static writeMcpSchemas(dir: string): void {
    for (const [name, meta] of Object.entries(AEGIS_TOOL_SCHEMAS)) {
      const schema = {
        name,
        description: meta.desc,
        parameters: { properties: meta.props, required: meta.req, type: 'object' }
      };
      fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(schema, null, 2), 'utf8');
    }
  }

  public static syncGlobal(userHome: string, repoRoot: string, registerMcpFn: (cfgPath: string) => void): void {
    const cliPath = path.resolve(repoRoot, 'packages', 'cli', 'dist', 'bin', 'aegis.js');
    this.cleanLegacy(userHome);
    this.installPlugin(userHome, repoRoot);
    this.installShims(userHome, cliPath);

    const schemaDir = path.resolve(userHome, '.gemini', 'antigravity', 'mcp', 'aegis');
    fs.mkdirSync(schemaDir, { recursive: true });
    this.writeMcpSchemas(schemaDir);
    registerMcpFn(path.resolve(userHome, '.gemini', 'config', 'mcp_config.json'));
  }
}
