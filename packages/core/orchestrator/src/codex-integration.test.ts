import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parse } from 'smol-toml';
import { CodexAdapter, IdeAdapterRegistry } from './ide-adapter.js';
import { CodexInstaller } from './codex-installer.js';
import { syncCodexMcp } from './codex-config.js';
import { McpSkillsSyncEngine } from './mcp-skills-sync.js';
import { TeamworkTrackBuilder } from './teamwork-track-builder.js';
import { getSubagentProfiles } from './teamwork-prompts.js';

function fixture(run: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-codex-'));
  try { run(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('Codex MCP writes valid TOML and preserves unrelated settings, servers and tool policy', () => fixture(root => {
  fs.mkdirSync(path.join(root, '.codex'));
  const target = path.join(root, '.codex/config.toml');
  fs.writeFileSync(target, 'model = "keep-model"\n[mcp_servers.custom]\nurl = "https://example.com/mcp"\n' +
    '[mcp_servers.aegis]\nenabled_tools = ["triage"]\n');
  const engine = new McpSkillsSyncEngine({ aegis: {
    command: 'node', args: ['C:\\engine with spaces\\aegis.js', 'mcp'],
    env: { AEGIS_MODE: 'test' }, disabled: true
  } });
  engine.syncToIde(new CodexAdapter(), root);
  const before = fs.readFileSync(target, 'utf8');
  const config = parse(before);
  assert.equal(config.model, 'keep-model');
  const servers = config.mcp_servers as Record<string, Record<string, unknown>>;
  assert.equal(servers.custom.url, 'https://example.com/mcp');
  assert.deepEqual(servers.aegis.enabled_tools, ['triage']);
  assert.equal(servers.aegis.enabled, false);
  assert.deepEqual(servers.aegis.args, ['C:\\engine with spaces\\aegis.js', 'mcp']);
  assert.deepEqual({ ...(servers.aegis.env as Record<string, string>) }, { AEGIS_MODE: 'test' });
  engine.syncToIde(new CodexAdapter(), root);
  assert.equal(fs.readFileSync(target, 'utf8'), before);
}));

test('invalid Codex TOML remains untouched', () => fixture(root => {
  fs.mkdirSync(path.join(root, '.codex'));
  const target = path.join(root, '.codex/config.toml');
  fs.writeFileSync(target, 'model = [broken');
  assert.throws(() => syncCodexMcp(root, { aegis: { command: 'node' } }));
  assert.equal(fs.readFileSync(target, 'utf8'), 'model = [broken');
}));

test('invalid existing Codex server entries remain untouched', () => fixture(root => {
  fs.mkdirSync(path.join(root, '.codex'));
  const target = path.join(root, '.codex/config.toml');
  for (const value of ['"keep-this"', '["keep-this"]', '2026-11-11T00:00:00Z']) {
    const original = `[mcp_servers]\naegis = ${value}\n`;
    fs.writeFileSync(target, original);
    assert.throws(() => syncCodexMcp(root, { aegis: { command: 'node' } }), /must be a TOML table/);
    assert.equal(fs.readFileSync(target, 'utf8'), original);
  }
}));

test('Codex transport changes remove obsolete credentials and preserve tool restrictions', () => fixture(root => {
  fs.mkdirSync(path.join(root, '.codex'));
  const target = path.join(root, '.codex/config.toml');
  fs.writeFileSync(target, '[mcp_servers.aegis]\ncommand = "node"\nargs = ["old.js"]\n' +
    'enabled_tools = ["triage"]\nenv = { OLD_SECRET = "keep-local" }\ncwd = "."\n');
  syncCodexMcp(root, { aegis: { url: 'https://example.com/mcp' } });
  let server = (parse(fs.readFileSync(target, 'utf8')).mcp_servers as Record<string, Record<string, unknown>>).aegis;
  for (const key of ['command', 'args', 'env', 'cwd']) assert.equal(server[key], undefined);
  assert.deepEqual(server.enabled_tools, ['triage']);
  fs.appendFileSync(target, 'bearer_token_env_var = "REMOTE_TOKEN"\nhttp_headers = { Authorization = "old" }\n');
  syncCodexMcp(root, { aegis: { command: 'node', args: ['new.js', 'mcp'], cwd: root } });
  server = (parse(fs.readFileSync(target, 'utf8')).mcp_servers as Record<string, Record<string, unknown>>).aegis;
  for (const key of ['url', 'bearer_token_env_var', 'http_headers']) assert.equal(server[key], undefined);
  assert.deepEqual(server.enabled_tools, ['triage']);
  assert.deepEqual(server.args, ['new.js', 'mcp']);
}));

test('Codex resolves engine root for an external project and installs invocation policy metadata', () => fixture(root => {
  const engine = CodexInstaller.resolveEngineRoot(root);
  assert.notEqual(engine, root);
  assert.ok(fs.existsSync(path.join(engine, 'packages/cli/dist/bin/aegis.js')));
  CodexInstaller.install(root, engine);
  const source = fs.readFileSync(path.join(engine, 'templates/codex/skills/aegis/agents/openai.yaml'), 'utf8');
  assert.equal(fs.readFileSync(path.join(root, '.agents/skills/aegis/agents/openai.yaml'), 'utf8'), source);
  assert.match(source, /allow_implicit_invocation: true/);
  const skill = fs.readFileSync(path.join(root, '.agents/skills/aegis/SKILL.md'), 'utf8');
  assert.match(skill, /aegis tw/);
}));

test('Codex install rejects incomplete engine templates before changing project files', () => fixture(root => {
  fs.mkdirSync(path.join(root, 'packages/cli/dist/bin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'packages/cli/dist/bin/aegis.js'), '');
  fs.mkdirSync(path.join(root, 'templates/codex'), { recursive: true });
  fs.writeFileSync(path.join(root, 'templates/codex/AGENTS.md'), 'Native rules');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Keep project instructions');
  assert.throws(() => CodexInstaller.install(root), /Missing Codex setup template/);
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), 'Keep project instructions');
  assert.equal(fs.existsSync(path.join(root, '.codex/config.toml')), false);
  assert.equal(fs.existsSync(path.join(root, '.agents')), false);
}));

test('Codex install keeps custom instructions and is idempotent after isolation setup', () => fixture(root => {
  fs.mkdirSync(path.join(root, 'packages/cli/dist/bin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'packages/cli/dist/bin/aegis.js'), '');
  fs.mkdirSync(path.join(root, 'templates/codex/skills/aegis'), { recursive: true });
  fs.writeFileSync(path.join(root, 'templates/codex/AGENTS.md'), 'Native Codex rules');
  fs.writeFileSync(path.join(root, 'templates/codex/skills/aegis/SKILL.md'), 'Native skill');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'User rules\n');
  new CodexAdapter().setupExclusions(root);
  CodexInstaller.install(root);
  const first = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  CodexInstaller.install(root);
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), first);
  assert.ok(first.includes('User rules') && first.includes('Native Codex rules'));
  const servers = parse(fs.readFileSync(path.join(root, '.codex/config.toml'), 'utf8')).mcp_servers as Record<string, Record<string, unknown>>;
  assert.deepEqual(servers.aegis.args, [path.join(root, 'packages/cli/dist/bin/aegis.js'), 'mcp']);
  assert.equal(servers.aegis.cwd, root);
  assert.equal(fs.readFileSync(path.join(root, '.agents/skills/aegis/SKILL.md'), 'utf8'), 'Native skill');
}));

test('teamwork emits native Codex payload while keeping Antigravity payload intact', () => {
  const profile = getSubagentProfiles().find(p => p.roleType === 'docs');
  assert.ok(profile);
  const track = TeamworkTrackBuilder.buildTrack('docs', profile, 'Document contracts', ['docs/api.md'], 'Docs', true);
  assert.equal(track.invocationPayload.Model, 'flash');
  assert.ok(track.invocationPayload.Prompt.includes('invoke_subagent'));
  assert.match(track.codexInvocationPayload?.task_name ?? '', /^[a-z0-9_]+$/);
  assert.ok(track.codexInvocationPayload?.message.includes('docs/api.md'));
  assert.ok(!track.codexInvocationPayload?.message.includes('invoke_subagent'));
  assert.ok(new IdeAdapterRegistry().getAdapter('codex'));
});
