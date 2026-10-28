import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { UniversalToolchainSync } from './toolchain-sync.js';
import { AEGIS_TOOL_SCHEMAS } from './mcp-tool-schemas.js';

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

test('UniversalToolchainSync updates .cursorrules dynamically when skills change', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-cursor-update-'));
  try {
    const rulesFile = path.join(tmpDir, '.cursorrules');
    fs.writeFileSync(rulesFile, '# Existing Rules\nSome custom rule.\n', 'utf8');

    const skillsDir = path.join(tmpDir, '.agents', 'skills', 'new-skill');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'SKILL.md'), '---\nname: new-skill\ndescription: Dynamic new skill\n---\n# Doc', 'utf8');

    const sync = new UniversalToolchainSync(tmpDir);
    sync.syncAll();

    const content1 = fs.readFileSync(rulesFile, 'utf8');
    assert.ok(content1.includes('new-skill'));
    assert.ok(content1.includes('Some custom rule.'));

    const skill2Dir = path.join(tmpDir, '.agents', 'skills', 'second-skill');
    fs.mkdirSync(skill2Dir, { recursive: true });
    fs.writeFileSync(path.join(skill2Dir, 'SKILL.md'), '---\nname: second-skill\ndescription: Second dynamic skill\n---\n# Doc', 'utf8');

    sync.syncAll();
    const content2 = fs.readFileSync(rulesFile, 'utf8');
    assert.ok(content2.includes('new-skill'));
    assert.ok(content2.includes('second-skill'));
    assert.ok(content2.includes('Some custom rule.'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('UniversalToolchainSync preserves existing custom MCP servers in Cursor and VS Code configs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-mcp-merge-'));
  try {
    const cursorDir = path.join(tmpDir, '.cursor');
    fs.mkdirSync(cursorDir, { recursive: true });
    fs.writeFileSync(
      path.join(cursorDir, 'mcp.json'),
      JSON.stringify({ mcpServers: { 'custom-db': { command: 'db-tool', args: ['run'] } } }),
      'utf8'
    );

    const vscodeDir = path.join(tmpDir, '.vscode');
    fs.mkdirSync(vscodeDir, { recursive: true });
    fs.writeFileSync(
      path.join(vscodeDir, 'mcp.json'),
      JSON.stringify({ servers: { 'custom-api': { url: 'http://localhost:9000/sse' } } }),
      'utf8'
    );

    const sync = new UniversalToolchainSync(tmpDir);
    sync.syncAll();

    const cursorMcp = JSON.parse(fs.readFileSync(path.join(cursorDir, 'mcp.json'), 'utf8'));
    assert.ok(cursorMcp.mcpServers['custom-db']);
    assert.ok(cursorMcp.mcpServers['aegis-engine']);

    const vscodeMcp = JSON.parse(fs.readFileSync(path.join(vscodeDir, 'mcp.json'), 'utf8'));
    assert.ok(vscodeMcp.servers['custom-api']);
    assert.ok(vscodeMcp.servers['aegis-engine']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('UniversalToolchainSync includes Godot Engine when project.godot is present', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-godot-sync-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'project.godot'), 'config_version=5\n', 'utf8');
    const sync = new UniversalToolchainSync(tmpDir);
    const report = sync.syncAll();
    assert.strictEqual(report.success, true);
    assert.ok(report.syncedIdes.includes('Godot Engine (Aegis Bridge)'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('UniversalToolchainSync automatically registers ast-grep and context7 MCP servers', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-mcp-defaults-'));
  try {
    const sync = new UniversalToolchainSync(tmpDir);
    const mcps = sync.discoverMcpServers();
    const names = mcps.map(m => m.name);
    assert.ok(names.includes('ast-grep'));
    assert.ok(names.includes('context7'));
    assert.ok(names.includes('aegis-engine'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('AEGIS_TOOL_SCHEMAS contains exactly 27 authoritative tools including Godot Substrate 3.0', () => {
  const toolNames = Object.keys(AEGIS_TOOL_SCHEMAS);
  assert.strictEqual(toolNames.length, 27);
  assert.ok(toolNames.includes('aegis_godot_status'));
  assert.ok(toolNames.includes('aegis_godot_playtest'));
  assert.ok(toolNames.includes('aegis_godot_inspect_ui'));
  assert.ok(toolNames.includes('aegis_godot_tree'));
  assert.ok(toolNames.includes('aegis_godot_signals'));
  assert.ok(toolNames.includes('aegis_godot_screenshot'));
  assert.ok(toolNames.includes('aegis_godot_validate'));
  assert.ok(toolNames.includes('aegis_godot_eval'));
});
