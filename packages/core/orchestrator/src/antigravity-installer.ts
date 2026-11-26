/**
 * @file antigravity-installer.ts
 * Manages Google Antigravity global plugin, shims, skills, and MCP schemas.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { debugLogIgnored } from '@aegis/shared';
import { AEGIS_TOOL_SCHEMAS } from './mcp-tool-schemas.js';

const SKILL_NAMES: readonly string[] = ['aegis'];
const SHIM_COMMANDS: readonly string[] = ['aegis', 'aegist', 'tw', 'aegis-tw', 'aegist-tw', 'aegis-tr'];

const LEGACY_PATHS: readonly string[] = [
  '.gemini/config/skills.json',
  '.gemini/config/plugins.json',
  '.gemini/config/skills/tr',
  '.gemini/config/plugins/aegis/skills/tr',
  '.gemini/config/plugins/aegis/skills/aegist',
  '.gemini/config/plugins/aegis/skills/aegis-tw',
  '.gemini/config/plugins/aegis/skills/cage',
  '.gemini/config/plugins/aegis/skills/tw',
  '.gemini/config/skills/aegis',
  '.gemini/config/skills/aegist',
  '.gemini/config/skills/tw',
  '.gemini/config/skills/aegis-tw',
  '.gemini/config/skills/cage',
  '.gemini/config/skills/ajan1',
  '.gemini/config/skills/ajan2',
  '.gemini/config/skills/ajan-docs',
  '.gemini/config/skills/ajan-qa',
  '.gemini/config/skills/ajan-solver',
  '.gemini/config/skills/ajan-ui',
  '.gemini/config/skills/agent-status',
  '.gemini/config/skills/durum',
  '.gemini/config/skills/doc-architect',
  '.gemini/config/skills/docs',
  '.gemini/config/skills/issue-solver',
  '.gemini/config/skills/solver',
  '.gemini/config/skills/qa',
  '.gemini/config/skills/qa-hunter',
  '.gemini/config/skills/ui',
  '.gemini/config/skills/ui-specialist',
  '.gemini/config/skills/teamwork',
  '.gemini/antigravity/mcp/aegis_aegis',
  '.gemini/config/plugins/aegis/mcp_config.json'
];

export class AntigravityInstaller {
  public static cleanLegacy(userHome: string): void {
    for (const rel of LEGACY_PATHS) {
      const p = path.resolve(userHome, rel);
      if (fs.existsSync(p)) {
        try { fs.rmSync(p, { recursive: true, force: true }); } catch (err: unknown) { debugLogIgnored('AntigravityInstaller:cleanLegacy', err); }
      }
    }
  }

  public static copySkillFiles(srcDir: string, destDir: string): void {
    if (!fs.existsSync(srcDir)) return;
    fs.mkdirSync(destDir, { recursive: true });
    for (const file of fs.readdirSync(srcDir)) {
      const s = path.join(srcDir, file);
      const d = path.join(destDir, file);
      if (fs.statSync(s).isDirectory()) {
        this.copySkillFiles(s, d);
      } else {
        fs.copyFileSync(s, d);
      }
    }
  }

  public static installPlugin(userHome: string, repoRoot: string): void {
    const pluginDir = path.resolve(userHome, '.gemini', 'config', 'plugins', 'aegis');
    const pluginSkills = path.join(pluginDir, 'skills');
    const rulesDir = path.join(pluginDir, 'rules');
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({ name: 'aegis', version: '0.1.0' }, null, 2), 'utf8');

    const geminiMd = path.resolve(repoRoot, 'GEMINI.md');
    if (fs.existsSync(geminiMd)) fs.copyFileSync(geminiMd, path.join(rulesDir, 'AGENTS.md'));

    for (const sk of SKILL_NAMES) {
      const candidates = [
        path.resolve(repoRoot, 'templates', 'skills', sk),
        path.resolve(repoRoot, '.agents', 'skills', sk)
      ];
      const repoSkillDir = candidates.find(d => fs.existsSync(d));
      if (repoSkillDir) {
        this.copySkillFiles(repoSkillDir, path.join(pluginSkills, sk));
      }
    }
  }

  public static installShims(binDir: string, cliPath: string): void {
    try {
      fs.mkdirSync(binDir, { recursive: true });
      const cmd = `@echo off\r\nnode "${cliPath}" %*\r\n`;
      const ps1 = `& node "${cliPath}" @args\r\n`;
      for (const name of SHIM_COMMANDS) {
        fs.writeFileSync(path.join(binDir, `${name}.cmd`), cmd, 'utf8');
        fs.writeFileSync(path.join(binDir, `${name}.ps1`), ps1, 'utf8');
        if (process.platform !== 'win32') {
          const sh = '#!/bin/sh\nexec node "' + cliPath + '" "$@"\n';
          fs.writeFileSync(path.join(binDir, name), sh, { mode: 0o755 });
        }
      }
    } catch (err: unknown) { debugLogIgnored('AntigravityInstaller:installShims', err); }
  }

  public static writeMcpSchemas(dir: string): void {
    try {
      fs.mkdirSync(dir, { recursive: true });
      for (const [name, meta] of Object.entries(AEGIS_TOOL_SCHEMAS)) {
        const schema = {
          name,
          description: meta.desc,
          parameters: { properties: meta.props, required: meta.req, type: 'object' }
        };
        fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(schema, null, 2), 'utf8');
      }
    } catch (err: unknown) { debugLogIgnored('AntigravityInstaller:writeMcpSchemas', err); }
  }

  public static discoverHomes(userHome: string): string[] {
    const appDataParent = process.env.ANTIGRAVITY_APP_DATA_DIR
      ? path.resolve(process.env.ANTIGRAVITY_APP_DATA_DIR, '..', '..')
      : null;
    const baseHomes = [userHome, os.homedir(), process.env.USERPROFILE, process.env.HOME, appDataParent]
      .filter((x): x is string => typeof x === 'string' && x.length > 0);
    const candidates = [...baseHomes];
    for (const base of baseHomes) {
      const profilesDir = path.join(path.resolve(base), 'AntigravityProfiles');
      if (!fs.existsSync(profilesDir)) continue;
      try {
        for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
          if (entry.isDirectory()) candidates.push(path.join(profilesDir, entry.name));
        }
      } catch (err: unknown) {
        debugLogIgnored('AntigravityInstaller:discoverHomes', err);
      }
    }
    const seen = new Set<string>();
    const results: string[] = [];
    for (const h of candidates) {
      const resolved = path.resolve(h);
      if (!seen.has(resolved) && fs.existsSync(path.join(resolved, '.gemini'))) {
        seen.add(resolved);
        results.push(resolved);
      }
    }
    return results;
  }

  public static syncGlobal(userHome: string, repoRoot: string, registerMcpFn: (cfgPath: string) => void): void {
    const cliPath = path.resolve(repoRoot, 'packages', 'cli', 'dist', 'bin', 'aegis.js');
    const homes = this.discoverHomes(userHome);
    for (const h of homes) {
      this.cleanLegacy(h);
      this.installPlugin(h, repoRoot);
      this.installShims(path.resolve(h, '.gemini', 'antigravity', 'bin'), cliPath);
      this.writeMcpSchemas(path.resolve(h, '.gemini', 'antigravity', 'mcp', 'aegis'));
      registerMcpFn(path.resolve(h, '.gemini', 'config', 'mcp_config.json'));
    }
    if (process.platform === 'win32') {
      const baseHome = userHome || os.homedir();
      const npmCandidates = Array.from(new Set([
        process.env.APPDATA ? path.resolve(process.env.APPDATA, 'npm') : null,
        baseHome ? path.resolve(baseHome, 'AppData', 'Roaming', 'npm') : null
      ].filter((x): x is string => typeof x === 'string')));
      for (const npmDir of npmCandidates) {
        if (fs.existsSync(npmDir)) {
          this.installShims(npmDir, cliPath);
        }
      }
    }
  }
}
