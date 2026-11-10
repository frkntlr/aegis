import * as fs from 'node:fs';
import * as path from 'node:path';
import type { IdeAdapter, IdeCapabilities, IdeExclusionResult } from '@aegis/shared';

export class CodexAdapter implements IdeAdapter {
  public readonly ideId = 'codex';
  public readonly name = 'OpenAI Codex';
  public readonly capabilities: IdeCapabilities = {
    supportsMcp: true, supportsSkills: true, supportsSubagents: true,
    mcpConfigFile: '.codex/config.toml'
  };

  public setupExclusions(repoRoot: string): IdeExclusionResult {
    // Codex has no files.exclude setting. Scope worktree isolation with native instructions.
    const target = path.resolve(repoRoot, 'AGENTS.md');
    const marker = '<!-- aegis:codex:isolation -->';
    const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    if (!existing.includes(marker)) {
      fs.writeFileSync(target, `${existing}\n${marker}\n` +
        'Treat experimental/** as isolated agent worktrees. Inspect or edit them only when assigned.\n' +
        'Respect .aegis/locks.json; do not edit files locked by another agent.\n', 'utf8');
    }
    return { ideId: this.ideId, success: true, configuredFiles: [target] };
  }
}
