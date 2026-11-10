import * as fs from 'node:fs';
import * as path from 'node:path';
import { syncCodexMcp, type CodexMcpServer } from './codex-config.js';
import { AntigravityInstaller } from './antigravity-installer.js';

export class CodexInstaller {
  public static resolveEngineRoot(repoRoot: string): string {
    const candidates = [repoRoot, path.resolve(__dirname, '../../../..')];
    return candidates.find(root => fs.existsSync(path.join(root, 'packages/cli/dist/bin/aegis.js'))) ?? repoRoot;
  }

  public static install(repoRoot: string, engineRoot = repoRoot): string[] {
    const cli = path.resolve(engineRoot, 'packages/cli/dist/bin/aegis.js');
    if (!fs.existsSync(cli)) throw new Error(`Build Aegis before Codex setup: ${cli}`);
    const src = path.resolve(engineRoot, 'templates/codex');
    for (const relative of ['AGENTS.md', 'skills/aegis/SKILL.md']) {
      const template = path.join(src, relative);
      if (!fs.existsSync(template) || !fs.statSync(template).isFile()) {
        throw new Error(`Missing Codex setup template: ${template}`);
      }
      fs.accessSync(template, fs.constants.R_OK);
    }
    const config = syncCodexMcp(repoRoot, {
      aegis: { command: process.execPath, args: [cli, 'mcp'], cwd: repoRoot }
    });
    const installed = [config];
    const agents = path.resolve(repoRoot, 'AGENTS.md');
    if (fs.existsSync(path.join(src, 'AGENTS.md'))) {
      const existing = fs.existsSync(agents) ? fs.readFileSync(agents, 'utf8') : '';
      const start = '<!-- aegis:codex:start -->';
      const end = '<!-- aegis:codex:end -->';
      const block = `${start}\n${fs.readFileSync(path.join(src, 'AGENTS.md'), 'utf8')}\n${end}`;
      const pattern = /<!-- aegis:codex:start -->[\s\S]*?<!-- aegis:codex:end -->/;
      fs.writeFileSync(agents, pattern.test(existing) ? existing.replace(pattern, () => block) : `${existing}\n${block}\n`, 'utf8');
      installed.push(agents);
    }
    const skill = path.resolve(repoRoot, '.agents/skills/aegis');
    if (fs.existsSync(path.join(src, 'skills/aegis'))) {
      AntigravityInstaller.copySkillFiles(path.join(src, 'skills/aegis'), skill);
      installed.push(path.join(skill, 'SKILL.md'));
    }
    return installed;
  }

  public static sync(repoRoot: string, servers: Record<string, CodexMcpServer>): string {
    return syncCodexMcp(repoRoot, servers);
  }
}
