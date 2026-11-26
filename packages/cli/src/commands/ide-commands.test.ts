import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { buildIdeMcpServers } from './ide-commands.js';

test('buildIdeMcpServers uses relative CLI path when engineRoot matches repoRoot', () => {
  const repoRoot = path.resolve('C:', 'work', 'aegis');
  const servers = buildIdeMcpServers(repoRoot, repoRoot);
  assert.deepEqual(Object.keys(servers), ['aegis-engine']);
  assert.deepEqual(servers['aegis-engine'], {
    command: 'node',
    args: ['packages/cli/dist/bin/aegis.js', 'mcp']
  });
});

test('buildIdeMcpServers omits nonexistent notebooklm/godot-mcp servers and resolves external engineRoot', () => {
  const repoRoot = path.resolve('C:', 'work', 'my-game');
  const engineRoot = path.resolve('C:', 'tools', 'aegis-engine');
  const servers = buildIdeMcpServers(repoRoot, engineRoot);
  assert.equal(servers.notebooklm, undefined);
  assert.equal(servers.godot, undefined);
  assert.deepEqual(servers['aegis-engine'], {
    command: 'node',
    args: [path.join(engineRoot, 'packages', 'cli', 'dist', 'bin', 'aegis.js'), 'mcp']
  });
});

test('buildIdeMcpServers matches Windows case-variant roots case-insensitively', () => {
  const lowerRoot = process.platform === 'win32' ? 'c:\\repo\\aegis' : '/repo/aegis';
  const upperRoot = process.platform === 'win32' ? 'C:\\Repo\\Aegis' : '/Repo/Aegis';
  const winServers = buildIdeMcpServers(lowerRoot, upperRoot, 'win32');
  assert.deepEqual(winServers['aegis-engine'], {
    command: 'node',
    args: ['packages/cli/dist/bin/aegis.js', 'mcp']
  });
  if (process.platform === 'win32') {
    const defaultServers = buildIdeMcpServers(lowerRoot, upperRoot);
    assert.deepEqual(defaultServers['aegis-engine'], {
      command: 'node',
      args: ['packages/cli/dist/bin/aegis.js', 'mcp']
    });
  }
});
