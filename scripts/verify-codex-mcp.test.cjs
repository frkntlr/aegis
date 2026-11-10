const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { stringify } = require('smol-toml');

const fakeServer = `
const mode = process.argv[2];
const send = (id, result) => process.stdout.write(JSON.stringify({jsonrpc:'2.0', id, result})+'\\n');
if (mode === 'out-of-order') send(3, {content:[{type:'text',text:'{}'}]});
require('node:readline').createInterface({input:process.stdin}).on('line', line => {
  const request = JSON.parse(line);
  if (request.id === 1) {
    if (mode === 'invalid-envelope') process.stdout.write('{"id":1,"result":{}}\\n');
    else send(1, {serverInfo:{name:'aegis'},protocolVersion:'2024-11-05',capabilities:{tools:{}}});
  }
  if (request.id === 2) send(2, {tools:['teamwork_plan','task_list','lock_status','memory_query']
    .filter(name => mode !== 'missing-tool' || name !== 'lock_status').map(name => ({name}))});
  if (request.id === 3) send(3, {content:[{type:'text',text: mode === 'invalid-locks'
    ? 'arbitrary text' : JSON.stringify({count:0,lockedFiles:{}})}]});
});
`;

function runFixture(mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis MCP verifier '));
  try {
    fs.mkdirSync(path.join(root, '.codex'));
    fs.writeFileSync(path.join(root, 'server.cjs'), fakeServer);
    fs.writeFileSync(path.join(root, '.codex/config.toml'), stringify({mcp_servers:{aegis:{
      command:process.execPath,args:[path.join(root, 'server.cjs'),mode],cwd:'.',
      enabled:mode !== 'disabled'
    }}}));
    return spawnSync(process.execPath, [path.join(__dirname, 'verify-codex-mcp.cjs'), root], {
      cwd:__dirname,encoding:'utf8',windowsHide:true,timeout:20000
    });
  } finally { fs.rmSync(root, {recursive:true,force:true}); }
}

test('MCP verifier completes a sequential handshake and resolves project-relative cwd', () => {
  const result = runFixture('valid');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /lock_status passed; cwd=.*aegis MCP verifier/);
  assert.match(result.stdout, /elapsedMs=\d+/);
});

for (const mode of ['out-of-order', 'invalid-envelope', 'missing-tool', 'invalid-locks', 'disabled']) {
  test(`MCP verifier rejects ${mode} instead of reporting success`, () => {
    const result = runFixture(mode);
    assert.equal(result.status, 1, result.stderr);
    assert.doesNotMatch(result.stdout, /passed/);
  });
}
