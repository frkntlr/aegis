import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  REPO_ROOT,
  CLI_BIN,
  buildCleanEnv,
  createTempWorkspace,
  readPackageJson,
  runAegisCli
} from './helpers/cli-runner.mjs';

const ORCHESTRATOR_URL = pathToFileURL(
  path.join(REPO_ROOT, 'packages/core/orchestrator/dist/index.js')
).href;

function assertNoBrokenOrStaticMachinePaths(obj, label) {
  const serialized = typeof obj === 'string' ? obj : JSON.stringify(obj);
  assert.equal(/AntigravityProfiles|client-a|Program Files/i.test(serialized), false, `${label} contains machine/profile path`);
  assert.equal(/packages\/plugins\/notebooklm|godot-mcp\.js|godot-mcp-runtime/i.test(serialized), false, `${label} contains broken MCP plugin path`);
}

function assertPortableConfigValues(obj, label) {
  const serialized = JSON.stringify(obj);
  assert.equal(/Lenovo/i.test(serialized), false, `${label} contains hardcoded user path`);
  assertNoBrokenOrStaticMachinePaths(serialized, label);
}

function assertLocalEntrypointArgsExist(servers, label) {
  for (const [name, cfg] of Object.entries(servers)) {
    assert.ok(cfg && typeof cfg === 'object', `${label}.${name} must be an object`);
    if (cfg.command !== 'node' || !Array.isArray(cfg.args) || cfg.args.length === 0) continue;
    const rawArg = String(cfg.args[0]);
    const match = rawArg.match(/^\$\{[^:]+:-([^}]+)\}$/);
    const relOrAbs = (match ? match[1] : rawArg).replace(/^\.\//, '');
    if (relOrAbs.endsWith('.js')) {
      const target = path.isAbsolute(relOrAbs) ? relOrAbs : path.resolve(REPO_ROOT, relOrAbs);
      assert.ok(fs.existsSync(target), `${label}.${name} entrypoint missing: ${target}`);
    }
  }
}

function testVscodeMcpConfig() {
  const cfg = readPackageJson('.vscode/mcp.json');
  assert.ok(cfg.servers && typeof cfg.servers === 'object', '.vscode/mcp.json must declare "servers"');
  assertPortableConfigValues(cfg, '.vscode/mcp.json');
  assertLocalEntrypointArgsExist(cfg.servers, '.vscode/mcp.json');
}

function testCursorMcpExample() {
  const cfg = readPackageJson('.cursor/mcp.example.json');
  assert.ok(cfg.mcpServers && typeof cfg.mcpServers === 'object', '.cursor/mcp.example.json must declare "mcpServers"');
  assertPortableConfigValues(cfg, '.cursor/mcp.example.json');
  assertLocalEntrypointArgsExist(cfg.mcpServers, '.cursor/mcp.example.json');
}

function testCopilotMcpConfig() {
  const cfg = readPackageJson('plugins/aegis-copilot/mcp.json');
  assert.ok(cfg.servers && typeof cfg.servers === 'object', 'plugins/aegis-copilot/mcp.json must declare "servers"');
  assertPortableConfigValues(cfg, 'plugins/aegis-copilot/mcp.json');
  assertLocalEntrypointArgsExist(cfg.servers, 'plugins/aegis-copilot/mcp.json');
}

function testCompletionCommandNoHardcodedProfiles() {
  const compPath = path.join(REPO_ROOT, 'packages/cli/src/commands/completion-command.ts');
  const compSrc = fs.readFileSync(compPath, 'utf8');
  assert.equal(/Lenovo/i.test(compSrc), false, 'completion-command.ts must not contain Lenovo');
  assert.equal(compSrc.includes('client-a'), false, 'completion-command.ts must not hardcode client-a profile');
  const instPath = path.join(REPO_ROOT, 'packages/core/orchestrator/src/antigravity-installer.ts');
  const instSrc = fs.readFileSync(instPath, 'utf8');
  assert.equal(/Lenovo|client-a/i.test(instSrc), false, 'antigravity-installer.ts must not hardcode user profiles');
}

function testIdeCommandsNoBrokenPlugins() {
  const idePath = path.join(REPO_ROOT, 'packages/cli/src/commands/ide-commands.ts');
  const ideSrc = fs.readFileSync(idePath, 'utf8');
  assert.equal(ideSrc.includes('packages/plugins/notebooklm'), false, 'ide-commands.ts must not reference non-existent notebooklm plugin');
  assert.equal(ideSrc.includes('godot-mcp.js'), false, 'ide-commands.ts must not reference non-existent godot-mcp.js');
}

async function testInstallerAndToolchainDefaults(t) {
  const ws = createTempWorkspace('aegis-f07-def-');
  t.after(ws.cleanup);
  const { AntigravityInstaller, UniversalToolchainSync } = await import(ORCHESTRATOR_URL);
  const binDir = path.join(ws.dir, 'bin');
  AntigravityInstaller.installShims(binDir, CLI_BIN);
  assert.ok(fs.existsSync(path.join(binDir, 'aegis.cmd')), 'Expected aegis.cmd shim');
  assert.equal(fs.existsSync(path.join(binDir, 'tr.cmd')), false, 'installShims must not emit colliding tr.cmd');
  const sync = new UniversalToolchainSync(ws.dir);
  const discovered = sync.discoverMcpServers();
  const aegisSrv = discovered.find((s) => s.name === 'aegis-engine');
  assert.ok(aegisSrv, 'Expected default aegis-engine MCP server');
  assert.equal(aegisSrv.args?.[0], 'packages/cli/dist/bin/aegis.js');
}

function testCliIdeList(t) {
  const ws = createTempWorkspace('aegis-f07-list-');
  t.after(ws.cleanup);
  const res = runAegisCli(['ide:list'], { cwd: ws.dir, env: { AEGIS_WORKSPACE: ws.dir } });
  assert.equal(res.status, 0, `ide:list failed: ${res.stderr}`);
  assert.match(res.stdout, /cursor/i);
  assert.match(res.stdout, /vscode/i);
}

function testCliIdeSyncPortableConfigs(t) {
  const ws = createTempWorkspace('aegis-f07-sync-');
  const fakeHome = createTempWorkspace('aegis-f07-home-');
  t.after(() => {
    ws.cleanup();
    fakeHome.cleanup();
  });
  const res = runAegisCli(['ide:sync'], {
    cwd: ws.dir,
    env: { USERPROFILE: fakeHome.dir, HOME: fakeHome.dir, AEGIS_WORKSPACE: ws.dir }
  });
  assert.equal(res.status, 0, `ide:sync failed: ${res.stderr}`);
  const vsCfg = JSON.parse(fs.readFileSync(path.join(ws.dir, '.vscode/mcp.json'), 'utf8'));
  const curCfg = JSON.parse(fs.readFileSync(path.join(ws.dir, '.cursor/mcp.json'), 'utf8'));
  assert.ok(vsCfg.servers, 'ide:sync must write .vscode/mcp.json with servers');
  assert.ok(curCfg.mcpServers, 'ide:sync must write .cursor/mcp.json with mcpServers');
  assertNoBrokenOrStaticMachinePaths(vsCfg, 'synced .vscode/mcp.json');
  assertNoBrokenOrStaticMachinePaths(curCfg, 'synced .cursor/mcp.json');
  const entry = vsCfg.servers['aegis-engine'] ?? vsCfg.servers.aegis;
  assert.ok(entry && fs.existsSync(entry.args[0]), 'synced aegis entrypoint must exist on disk');
}

async function testUniversalToolchainSyncOutputs(t) {
  const ws = createTempWorkspace('aegis-f07-uts-');
  t.after(ws.cleanup);
  const { UniversalToolchainSync } = await import(ORCHESTRATOR_URL);
  const report = new UniversalToolchainSync(ws.dir).syncAll();
  assert.equal(report.success, true, `syncAll failed: ${report.warnings.join('; ')}`);
  for (const rel of ['.cursor/mcp.json', '.vscode/mcp.json', '.gemini/config/mcp_config.json']) {
    const abs = path.join(ws.dir, rel);
    assert.ok(fs.existsSync(abs), `Missing synced config: ${rel}`);
    assertNoBrokenOrStaticMachinePaths(fs.readFileSync(abs, 'utf8'), rel);
  }
  const codexToml = fs.readFileSync(path.join(ws.dir, '.codex/config.toml'), 'utf8');
  assert.match(codexToml, /\[mcp_servers\.aegis\]/);
  assert.equal(
    /AntigravityProfiles|client-a|packages\/plugins\/notebooklm|godot-mcp\.js|godot-mcp-runtime/i.test(codexToml),
    false,
    '.codex/config.toml contains profile or broken plugin path'
  );
}

async function testAntigravityDynamicProfileDiscovery(t) {
  const fakeHome = createTempWorkspace('aegis-f07-prof-');
  t.after(fakeHome.cleanup);
  const customGemini = path.join(fakeHome.dir, 'AntigravityProfiles', 'custom-e2e-99', '.gemini');
  fs.mkdirSync(customGemini, { recursive: true });
  fs.mkdirSync(path.join(fakeHome.dir, '.gemini'), { recursive: true });
  const { AntigravityInstaller } = await import(ORCHESTRATOR_URL);
  const homes = AntigravityInstaller.discoverHomes(fakeHome.dir);
  const expectedCustom = path.resolve(fakeHome.dir, 'AntigravityProfiles', 'custom-e2e-99');
  assert.ok(homes.includes(expectedCustom), `Expected dynamic profile ${expectedCustom} in ${JSON.stringify(homes)}`);
  assert.ok(homes.includes(path.resolve(fakeHome.dir)), 'Expected root fakeHome in discovered homes');
}

function queryMcpStdio(requests) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_BIN, 'mcp'], {
      cwd: REPO_ROOT,
      env: buildCleanEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });
    const responses = [];
    let buf = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`MCP stdio timeout; received=${responses.length}, buf=${buf}`));
    }, 8000);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.stdout.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) responses.push(JSON.parse(line));
      }
      if (responses.length >= requests.length) {
        clearTimeout(timer);
        child.stdin.end();
        child.kill();
        resolve(responses);
      }
    });
    for (const r of requests) child.stdin.write(`${JSON.stringify(r)}\n`);
  });
}

async function testCompletionAndMcpStdio() {
  const ps = runAegisCli(['completion', 'powershell']);
  assert.equal(ps.status, 0, `completion powershell failed: ${ps.stderr}`);
  assert.match(ps.stdout, /Register-ArgumentCompleter/);
  assert.equal(/Lenovo|client-a/i.test(ps.stdout), false);
  const bash = runAegisCli(['completion', 'bash']);
  assert.equal(bash.status, 0, `completion bash failed: ${bash.stderr}`);
  assert.match(bash.stdout, /_aegis_completions/);
  const replies = await queryMcpStdio([
    { jsonrpc: '2.0', id: 1, method: 'initialize' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' }
  ]);
  assert.equal(replies[0].result?.serverInfo?.name, 'aegis');
  const tools = replies[1].result?.tools ?? [];
  assert.ok(tools.some((item) => item.name === 'aegis_godot_inspect_ui'), 'Expected aegis_godot_inspect_ui MCP tool');
}

function registerTier1() {
  test('T1.1 .vscode/mcp.json uses servers and valid portable paths', testVscodeMcpConfig);
  test('T1.2 .cursor/mcp.example.json uses mcpServers and valid fallbacks', testCursorMcpExample);
  test('T1.3 plugins/aegis-copilot/mcp.json uses portable servers entry', testCopilotMcpConfig);
  test('T1.4 completion-command & antigravity-installer have zero Lenovo/client-a paths', testCompletionCommandNoHardcodedProfiles);
  test('T1.5 ide-commands.ts has zero broken notebooklm/godot-mcp plugin paths', testIdeCommandsNoBrokenPlugins);
  test('T1.6 AntigravityInstaller & UniversalToolchainSync defaults are portable', testInstallerAndToolchainDefaults);
}

function registerTier2() {
  test('T2.1 CLI ide:list exits 0 and lists supported IDEs', testCliIdeList);
  test('T2.2 CLI ide:sync writes portable .vscode & .cursor MCP configs in temp repo', testCliIdeSyncPortableConfigs);
  test('T2.3 UniversalToolchainSync.syncAll writes all 4 portable IDE configs', testUniversalToolchainSyncOutputs);
  test('T2.4 AntigravityInstaller.discoverHomes scans arbitrary profile directories', testAntigravityDynamicProfileDiscovery);
  test('T2.5 CLI completion powershell/bash & aegis mcp stdio respond cleanly', testCompletionAndMcpStdio);
}

describe('Tier 1: F07 MCP Configs & Path Portability Contracts', registerTier1);
describe('Tier 2: F07 IDE Sync, Dynamic Profiles & MCP Stdio Integration', registerTier2);
