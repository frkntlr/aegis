import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  IdeAdapterRegistry,
  AntigravityAdapter,
  VSCodeAdapter,
  CopilotAdapter,
  CursorAdapter,
  WindsurfAdapter,
  ZedAdapter,
  type IdeAdapter
} from './ide-adapter.js';
import { McpSkillsSyncEngine } from './mcp-skills-sync.js';

test('IdeAdapterRegistry lists default adapters and registers community adapters', () => {
  const registry = new IdeAdapterRegistry();
  const ids = registry.listAdapterIds();
  assert.ok(ids.includes('antigravity'));
  assert.ok(ids.includes('vscode'));
  assert.ok(ids.includes('copilot'));
  assert.ok(ids.includes('cursor'));
  assert.ok(ids.includes('windsurf'));
  assert.ok(ids.includes('zed'));
  assert.ok(ids.includes('godot'));

  const mockCustom: IdeAdapter = {
    ideId: 'custom-ide',
    name: 'Custom IDE',
    capabilities: { supportsMcp: true, supportsSkills: false, supportsSubagents: false },
    setupExclusions: (root) => ({ ideId: 'custom-ide', success: true, configuredFiles: [path.join(root, '.custom')] })
  };
  registry.register(mockCustom);

  assert.strictEqual(registry.getAdapter('custom-ide')?.name, 'Custom IDE');
  assert.ok(registry.listAdapterIds().includes('custom-ide'));
});

test('All IDE adapters configure isolation settings properly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-ide-test-'));
  try {
    const agAdapter = new AntigravityAdapter();
    const agRes = agAdapter.setupExclusions(tmpDir);
    assert.strictEqual(agRes.success, true);
    const agSettings = JSON.parse(fs.readFileSync(agRes.configuredFiles[0], 'utf8'));
    assert.strictEqual(agSettings['files.exclude']['experimental/**'], true);
    assert.strictEqual(agSettings['antigravity.multiAgent'], true);

    const vsAdapter = new VSCodeAdapter();
    const vsRes = vsAdapter.setupExclusions(tmpDir);
    assert.strictEqual(vsRes.success, true);

    const copilotAdapter = new CopilotAdapter();
    const copilotRes = copilotAdapter.setupExclusions(tmpDir);
    assert.strictEqual(copilotRes.success, true);
    const copilotSettings = JSON.parse(fs.readFileSync(copilotRes.configuredFiles[1], 'utf8'));
    assert.strictEqual(copilotSettings.plugins['aegis-copilot'].enabled, true);

    const cursorAdapter = new CursorAdapter();
    const cursorRes = cursorAdapter.setupExclusions(tmpDir);
    assert.strictEqual(cursorRes.success, true);

    const windsurfAdapter = new WindsurfAdapter();
    const wsRes = windsurfAdapter.setupExclusions(tmpDir);
    assert.strictEqual(wsRes.success, true);

    const zedAdapter = new ZedAdapter();
    const zedRes = zedAdapter.setupExclusions(tmpDir);
    assert.strictEqual(zedRes.success, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('McpSkillsSyncEngine syncs MCP server definitions across capable IDEs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-mcp-sync-'));
  try {
    const engine = new McpSkillsSyncEngine({
      notebooklm: { command: 'node', args: ['notebooklm.js'] },
      godot: { command: 'node', args: ['godot.js'] }
    });

    const registry = new IdeAdapterRegistry();
    const results = engine.syncAll(registry.listAdapters(), tmpDir);

    assert.strictEqual(results.length, 8);
    const godotResult = results.find(r => r.ideId === 'godot');
    assert.ok(godotResult?.supported);
    const agResult = results.find(r => r.ideId === 'antigravity');
    assert.ok(agResult?.supported);
    assert.strictEqual(agResult.syncedServersCount, 2);

    const targetFile = agResult?.targetFile || '';
    const writtenJson = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
    assert.ok(writtenJson.mcpServers.notebooklm);
    assert.ok(writtenJson.mcpServers.godot);

    const copilotResult = results.find(r => r.ideId === 'copilot');
    assert.ok(copilotResult?.supported);
    const copilotJson = JSON.parse(fs.readFileSync(copilotResult?.targetFile || '', 'utf8'));
    assert.ok(copilotJson.servers.notebooklm);
    assert.ok(copilotJson.servers.godot);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('McpSkillsSyncEngine preserves existing servers and custom properties in VS Code / Copilot', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-copilot-preserve-'));
  try {
    const vscodeDir = path.join(tmpDir, '.vscode');
    fs.mkdirSync(vscodeDir, { recursive: true });
    const mcpPath = path.join(vscodeDir, 'mcp.json');
    fs.writeFileSync(
      mcpPath,
      JSON.stringify({
        customField: 'preserved',
        servers: { 'existing-tool': { command: 'custom', args: ['--arg'] } }
      }),
      'utf8'
    );

    const engine = new McpSkillsSyncEngine({
      'aegis-engine': { command: 'npx', args: ['--yes', '@aegis/cli', 'mcp'] }
    });
    const result = engine.syncToIde(new CopilotAdapter(), tmpDir);
    assert.strictEqual(result.supported, true);

    const parsed = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    assert.strictEqual(parsed.customField, 'preserved');
    assert.ok(parsed.servers['existing-tool']);
    assert.ok(parsed.servers['aegis-engine']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
