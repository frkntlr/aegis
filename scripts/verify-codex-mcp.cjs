const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { parse } = require('smol-toml');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const config = parse(fs.readFileSync(path.join(root, '.codex/config.toml'), 'utf8'));
const server = config.mcp_servers?.aegis;
if (!server || typeof server.command !== 'string' || server.enabled === false) {
  throw new Error('Expected an enabled stdio mcp_servers.aegis command');
}
const cwd = server.cwd ? path.resolve(root, server.cwd) : root;
const started = performance.now();
const child = spawn(server.command, server.args, {
  cwd, env: { ...process.env, ...server.env }, windowsHide: true,
  stdio: ['pipe', 'pipe', 'pipe']
});
let pending = '';
let stderr = '';
let complete = false;
let expectedId = 1;
const deadline = setTimeout(() => finish(new Error('MCP verification timed out after 15s')), 15000);

function finish(error) {
  if (complete) return;
  complete = true;
  clearTimeout(deadline);
  child.kill();
  if (error) {
    console.error(error.message, stderr.slice(-1000));
    process.exitCode = 1;
  }
}

child.on('error', finish);
child.on('exit', () => { if (!complete) finish(new Error('MCP exited before verification completed')); });
child.stdin.on('error', finish);
child.stderr.setEncoding('utf8');
child.stdout.setEncoding('utf8');
child.stderr.on('data', data => { stderr = (stderr + data).slice(-1000); });

function checkLockResult(result) {
  if (result?.isError || !Array.isArray(result?.content)) throw new Error('Invalid lock_status result');
  const item = result.content.find(content => content.type === 'text' && typeof content.text === 'string');
  const value = item && JSON.parse(item.text);
  if (!value || typeof value.lockedFiles !== 'object' || value.lockedFiles === null ||
      Array.isArray(value.lockedFiles) || value.count !== Object.keys(value.lockedFiles).length) {
    throw new Error('lock_status did not return a valid lock snapshot');
  }
}

function handleResponse(response) {
  if (response?.jsonrpc !== '2.0') throw new Error('Invalid JSON-RPC response');
  if (response.error) throw new Error(JSON.stringify(response.error));
  if (response.id === undefined && typeof response.method === 'string') return;
  if (response.id !== expectedId) throw new Error(`Unexpected MCP response id: ${response.id}`);
  expectedId++;
  if (response.id === 1) {
    if (response.result?.serverInfo?.name !== 'aegis') throw new Error('Unexpected MCP server');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
  } else if (response.id === 2) {
    const tools = response.result?.tools;
    if (!Array.isArray(tools)) throw new Error('Invalid MCP tool list');
    for (const name of ['teamwork_plan', 'task_list', 'lock_status', 'memory_query']) {
      if (!tools.some(tool => tool.name === name)) throw new Error(`Missing tool: ${name}`);
    }
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'lock_status', arguments: {} } }) + '\n');
  } else {
    checkLockResult(response.result);
    console.log(`MCP initialize + tools/list + lock_status passed; cwd=${cwd}; elapsedMs=${Math.round(performance.now() - started)}`);
    finish();
  }
}

child.stdout.on('data', data => {
  if (complete) return;
  pending += data;
  if (pending.length > 4 * 1024 * 1024) return finish(new Error('MCP response exceeded 4 MiB'));
  let end;
  while (!complete && (end = pending.indexOf('\n')) !== -1) {
    const line = pending.slice(0, end).trim();
    pending = pending.slice(end + 1);
    if (!line) continue;
    try {
      handleResponse(JSON.parse(line));
    } catch (error) { finish(error); }
  }
});
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
  protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'aegis-codex-check', version: '1.0' }
} }) + '\n');
