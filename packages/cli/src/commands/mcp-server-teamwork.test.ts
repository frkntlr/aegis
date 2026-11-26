import test, { before, after } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { handleJsonRpc } from './mcp-server-command.js';
import { resetSharedMemoryEngine } from './memory-command.js';

let workspace: string;
const previousWorkspace = process.env.AEGIS_WORKSPACE;
before(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-mcp-tw-test-'));
  fs.writeFileSync(path.join(workspace, 'validator.ts'),
    'export class IronCageValidator { validate(): boolean { return true; } }\n');
  process.env.AEGIS_WORKSPACE = workspace;
  resetSharedMemoryEngine();
});
after(() => {
  resetSharedMemoryEngine();
  if (previousWorkspace === undefined) delete process.env.AEGIS_WORKSPACE;
  else process.env.AEGIS_WORKSPACE = previousWorkspace;
  fs.rmSync(workspace, { recursive: true, force: true });
});

test('handleJsonRpc executes aegis_godot_status and signals tools asynchronously', async () => {
  const statusRes = await handleJsonRpc({
    jsonrpc: '2.0',
    id: 15,
    method: 'tools/call',
    params: { name: 'aegis_godot_status', arguments: {} }
  });
  assert.ok(statusRes);
  const statusContent = (statusRes.result as { content: Array<{ type: string; text: string }> }).content[0].text;
  const statusParsed = JSON.parse(statusContent);
  assert.strictEqual(typeof statusParsed.active, 'boolean');

  const sigRes = await handleJsonRpc({
    jsonrpc: '2.0',
    id: 16,
    method: 'tools/call',
    params: { name: 'aegis_godot_signals', arguments: { className: 'Button' } }
  });
  assert.ok(sigRes);
  const sigContent = (sigRes.result as { content: Array<{ type: string; text: string }> }).content[0].text;
  const sigParsed = JSON.parse(sigContent);
  assert.strictEqual(sigParsed.className, 'Button');
  assert.ok(Array.isArray(sigParsed.signals));
});

test('handleJsonRpc executes teamwork_plan and teamwork_status tools', async () => {
  const planRes = await handleJsonRpc({
    jsonrpc: '2.0',
    id: 17,
    method: 'tools/call',
    params: { name: 'teamwork_plan', arguments: { objective: 'Test MCP Teamwork Plan' } }
  });
  assert.ok(planRes);
  const planContent = (planRes.result as { content: Array<{ type: string; text: string }> }).content[0].text;
  const planParsed = JSON.parse(planContent);
  assert.ok(planParsed.planId);
  assert.ok(planParsed.tracks.length >= 2);

  const statusRes = await handleJsonRpc({
    jsonrpc: '2.0',
    id: 18,
    method: 'tools/call',
    params: { name: 'teamwork_status', arguments: {} }
  });
  assert.ok(statusRes);
  const statusContent = (statusRes.result as { content: Array<{ type: string; text: string }> }).content[0].text;
  const statusParsed = JSON.parse(statusContent);
  assert.strictEqual(typeof statusParsed.activeTracksCount, 'number');
  assert.strictEqual(statusParsed.profiles.length, 4);
});

test('handleJsonRpc executes teamwork_doc_synthesize tool', async () => {
  const docRes = await handleJsonRpc({
    jsonrpc: '2.0',
    id: 19,
    method: 'tools/call',
    params: { name: 'teamwork_doc_synthesize', arguments: { compact: true } }
  });
  assert.ok(docRes);
  const content = (docRes.result as { content: Array<{ type: string; text: string }> }).content[0].text;
  assert.ok(content.startsWith('[ARCH-SYNTHESIS:'));
});
