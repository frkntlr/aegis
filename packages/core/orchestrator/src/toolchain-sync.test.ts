import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { UniversalToolchainSync } from './toolchain-sync.js';

test('UniversalToolchainSync discovers skills and executes cross-IDE synchronization', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-sync-test-'));
  try {
    const skillsDir = path.join(tmpDir, '.agents', 'skills', 'test-skill');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'SKILL.md'), '---\nname: test-skill\ndescription: Test sync skill\n---\n# Skill', 'utf8');

    const sync = new UniversalToolchainSync(tmpDir);
    const skills = sync.discoverSkills();
    assert.strictEqual(skills.length, 1);
    assert.strictEqual(skills[0].name, 'test-skill');

    const report = sync.syncAll();
    assert.strictEqual(report.success, true);
    assert.ok(report.syncedIdes.includes('Cursor AI'));
    assert.ok(report.syncedIdes.includes('VS Code'));

    assert.ok(fs.existsSync(path.join(tmpDir, '.cursor', 'mcp.json')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.vscode', 'mcp.json')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.cursorrules')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('UniversalToolchainSync falls back to mcp.example.json when mcp.json is missing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-mcp-example-'));
  try {
    const cursorDir = path.join(tmpDir, '.cursor');
    fs.mkdirSync(cursorDir, { recursive: true });
    fs.writeFileSync(
      path.join(cursorDir, 'mcp.example.json'),
      JSON.stringify({ mcpServers: { 'example-server': { command: 'node', args: ['example.js'] } } }),
      'utf8'
    );

    const sync = new UniversalToolchainSync(tmpDir);
    const mcps = sync.discoverMcpServers();
    assert.strictEqual(mcps.length, 1);
    assert.strictEqual(mcps[0].name, 'example-server');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
