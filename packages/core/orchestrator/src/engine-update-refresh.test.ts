import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { refreshEngineInstallations } from './engine-update-refresh.js';
import { EngineUpdater } from './engine-updater.js';

function fixture(run: (engine: string, project: string, home: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-refresh-'));
  const engine = path.join(root, 'engine'), project = path.join(root, 'project'), home = path.join(root, 'user');
  const source = path.resolve(__dirname, '../../../..');
  for (const directory of [engine, project, home, path.join(engine, 'scripts'), path.join(engine, 'templates/skills/aegis'), path.join(engine, 'packages/cli/dist/bin')]) fs.mkdirSync(directory, { recursive: true });
  fs.cpSync(path.join(source, 'templates/codex'), path.join(engine, 'templates/codex'), { recursive: true });
  for (const script of ['install-codex-commands.cjs', 'setup-aegis-config.cjs']) fs.copyFileSync(path.join(source, 'scripts', script), path.join(engine, 'scripts', script));
  fs.writeFileSync(path.join(engine, 'templates/skills/aegis/SKILL.md'), 'Updated Antigravity skill');
  fs.writeFileSync(path.join(engine, 'packages/cli/dist/bin/aegis.js'), '// fixture built CLI');
  try { run(engine, project, home); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('refresh updates existing Codex user/project setup and preserves unrelated config and tasks', () => fixture((engine, project, home) => {
  fs.mkdirSync(path.join(home, '.agents/skills/aegis'), { recursive: true });
  fs.writeFileSync(path.join(home, '.agents/skills/aegis/SKILL.md'), 'old user skill');
  fs.mkdirSync(path.join(project, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(project, '.codex/config.toml'), '[mcp_servers.aegis]\ncommand="old"\n[mcp_servers.other]\ncommand="preserve"\n');
  fs.mkdirSync(path.join(project, '.aegis'), { recursive: true });
  fs.writeFileSync(path.join(project, '.aegis/task-inbox.json'), 'preserve pending tasks');
  const result = refreshEngineInstallations(engine, project, home);
  assert.ok(result.idesSynced.some(client => client.includes('user skill')));
  assert.ok(result.idesSynced.some(client => client.includes(project)));
  assert.equal(fs.readFileSync(path.join(home, '.agents/skills/aegis/SKILL.md'), 'utf8'), fs.readFileSync(path.join(engine, 'templates/codex/skills/aegis/SKILL.md'), 'utf8'));
  assert.match(fs.readFileSync(path.join(project, '.codex/config.toml'), 'utf8'), /preserve/);
  assert.equal(fs.readFileSync(path.join(project, '.aegis/task-inbox.json'), 'utf8'), 'preserve pending tasks');
  assert.equal(result.worktreesSynced, 0);
  assert.equal(fs.existsSync(path.join(project, '.gemini')), false);
}));

test('Antigravity-only project refresh preserves peers and never creates Codex installation', () => fixture((engine, project, home) => {
  fs.mkdirSync(path.join(project, '.gemini/config/plugins/aegis/skills/aegis'), { recursive: true });
  fs.writeFileSync(path.join(project, '.gemini/config/mcp_config.json'), JSON.stringify({ mcpServers: { other: { command: 'keep' }, aegis: { command: 'old' } } }));
  fs.writeFileSync(path.join(project, '.gemini/config/plugins/aegis/skills/aegis/SKILL.md'), 'old');
  const result = refreshEngineInstallations(engine, project, home);
  assert.ok(result.idesSynced.some(client => client.includes('Antigravity') && client.includes(project)));
  assert.equal(fs.existsSync(path.join(project, '.codex')), false);
  assert.equal(fs.existsSync(path.join(home, '.agents')), false);
  assert.equal(fs.readFileSync(path.join(project, '.gemini/config/plugins/aegis/skills/aegis/SKILL.md'), 'utf8'), 'Updated Antigravity skill');
  const config = JSON.parse(fs.readFileSync(path.join(project, '.gemini/config/mcp_config.json'), 'utf8')) as { mcpServers: Record<string, { command: string; cwd?: string }> };
  assert.equal(config.mcpServers.other.command, 'keep');
  assert.equal(config.mcpServers.aegis.cwd, project);
}));

test('malformed selected integration config fails explicitly instead of reporting synchronization', () => fixture((engine, project, home) => {
  fs.mkdirSync(path.join(project, '.gemini/config/plugins/aegis'), { recursive: true });
  fs.writeFileSync(path.join(project, '.gemini/config/mcp_config.json'), '{bad');
  assert.throws(() => refreshEngineInstallations(engine, project, home));
  assert.equal(fs.readFileSync(path.join(project, '.gemini/config/mcp_config.json'), 'utf8'), '{bad');
}));

test('pull follows a configured non-master upstream without external network', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-upstream-'));
  const remote = path.join(root, 'remote.git'), work = path.join(root, 'work');
  const git = (cwd: string, ...args: string[]): void => { execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }); };
  try {
    fs.mkdirSync(work);
    git(root, 'init', '--bare', remote); git(work, 'init', '-b', 'release');
    git(work, 'config', 'user.name', 'Fixture'); git(work, 'config', 'user.email', 'fixture@example.test');
    fs.writeFileSync(path.join(work, 'source.txt'), 'local fixture');
    git(work, 'add', 'source.txt'); git(work, 'commit', '-m', 'fixture');
    git(work, 'remote', 'add', 'origin', remote); git(work, 'push', '-u', 'origin', 'release');
    assert.equal(EngineUpdater.pullLatest(work).pulled, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
