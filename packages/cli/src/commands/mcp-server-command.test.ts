import test from 'node:test';
import * as assert from 'node:assert';
import { handleJsonRpc } from './mcp-server-command.js';

test('handleJsonRpc handles initialize request', async () => {
  const res = await handleJsonRpc({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  assert.ok(res);
  assert.strictEqual(res.id, 1);
  const result = res.result as Record<string, unknown>;
  assert.strictEqual(result.protocolVersion, '2024-11-05');
  assert.ok((result.serverInfo as Record<string, unknown>).name === 'aegis');
});

test('handleJsonRpc handles tools/list request with 27 authoritative tools', async () => {
  const res = await handleJsonRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.ok(res);
  const result = res.result as { tools: Array<{ name: string }> };
  assert.strictEqual(result.tools.length, 27);
  const names = result.tools.map(t => t.name);
  assert.ok(names.includes('memory_query'));
  assert.ok(names.includes('memory_stats'));
  assert.ok(names.includes('context7_query'));
  assert.ok(names.includes('rtk_compress'));
  assert.ok(names.includes('socratic_diagnose'));
  assert.ok(names.includes('skeleton_extract'));
  assert.ok(names.includes('budget_inspect'));
  assert.ok(names.includes('worktree_status'));
  assert.ok(names.includes('task_list'));
  assert.ok(names.includes('task_claim'));
  assert.ok(names.includes('task_release'));
  assert.ok(names.includes('task_inbox_pull'));
  assert.ok(names.includes('lock_status'));
  assert.ok(names.includes('aegis_godot_status'));
  assert.ok(names.includes('aegis_godot_playtest'));
  assert.ok(names.includes('aegis_godot_inspect_ui'));
  assert.ok(names.includes('aegis_godot_tree'));
  assert.ok(names.includes('aegis_godot_signals'));
  assert.ok(names.includes('aegis_godot_screenshot'));
  assert.ok(names.includes('aegis_godot_validate'));
  assert.ok(names.includes('aegis_godot_eval'));
});

test('handleJsonRpc handles tools/call and executes tools', async () => {
  const res = await handleJsonRpc({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'context7_query', arguments: { library: 'godot4', topic: 'lifecycle' } }
  });
  assert.ok(res);
  const result = res.result as { content: Array<{ type: string; text: string }> };
  assert.strictEqual(result.content[0].type, 'text');
  assert.ok(result.content[0].text.includes('instantiate'));
});

test('handleJsonRpc returns error for unknown method', async () => {
  const res = await handleJsonRpc({ jsonrpc: '2.0', id: 4, method: 'unknown_method' });
  assert.ok(res);
  assert.ok(res.error);
});

test('handleJsonRpc executes triage tool', async () => {
  const res = await handleJsonRpc({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: { name: 'triage', arguments: { dir: 'packages/cli/src' } }
  });
  assert.ok(res);
  const result = res.result as { content: Array<{ type: string; text: string }> };
  assert.strictEqual(result.content[0].type, 'text');
  const report = JSON.parse(result.content[0].text);
  assert.strictEqual(typeof report.clean, 'boolean');
});

test('handleJsonRpc executes find_symbol and trace_relational tools', async () => {
  const symRes = await handleJsonRpc({
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: { name: 'find_symbol', arguments: { symbol: 'IronCageValidator' } }
  });
  assert.ok(symRes);
  const symContent = (symRes.result as { content: Array<{ type: string; text: string }> }).content[0].text;
  assert.ok(symContent.includes('IronCageValidator') || symContent.includes('found'));

  const traceRes = await handleJsonRpc({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: { name: 'trace_relational', arguments: { target: 'IronCageValidator' } }
  });
  assert.ok(traceRes);
  const traceContent = (traceRes.result as { content: Array<{ type: string; text: string }> }).content[0].text;
  assert.ok(traceContent.includes('callers'));
});

test('handleJsonRpc executes socratic_diagnose tool', async () => {
  const res = await handleJsonRpc({
    jsonrpc: '2.0',
    id: 8,
    method: 'tools/call',
    params: {
      name: 'socratic_diagnose',
      arguments: {
        rawLog: 'TypeError: Cannot read property "id" of undefined\n  at run (packages/cli/src/index.ts:25:5)'
      }
    }
  });
  assert.ok(res);
  const result = res.result as { content: Array<{ type: string; text: string }> };
  assert.strictEqual(result.content[0].type, 'text');
  const diag = JSON.parse(result.content[0].text);
  assert.ok(diag.category);
  assert.ok(diag.evidence);
  assert.ok(diag.clarificationOptions.length > 0);
});

test('handleJsonRpc executes skeleton_extract tool', async () => {
  const res = await handleJsonRpc({
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: {
      name: 'skeleton_extract',
      arguments: { filePath: 'packages/cli/src/commands/mcp-server-command.ts' }
    }
  });
  assert.ok(res);
  const result = res.result as { content: Array<{ type: string; text: string }> };
  assert.strictEqual(result.content[0].type, 'text');
  const parsed = JSON.parse(result.content[0].text);
  assert.strictEqual(typeof parsed.tokenSavingsPercent, 'number');
  assert.ok(parsed.skeleton.length > 0);
});

test('handleJsonRpc executes budget_inspect tool', async () => {
  const res = await handleJsonRpc({
    jsonrpc: '2.0',
    id: 10,
    method: 'tools/call',
    params: {
      name: 'budget_inspect',
      arguments: { filePath: 'packages/cli/src/commands/mcp-server-command.ts' }
    }
  });
  assert.ok(res);
  const result = res.result as { content: Array<{ type: string; text: string }> };
  assert.strictEqual(result.content[0].type, 'text');
  const parsed = JSON.parse(result.content[0].text);
  assert.strictEqual(parsed.maxFileLines, 300);
  assert.strictEqual(typeof parsed.fileQuotaRemaining, 'number');
  assert.ok(parsed.status);
});

test('handleJsonRpc executes worktree_status tool', async () => {
  const res = await handleJsonRpc({
    jsonrpc: '2.0',
    id: 11,
    method: 'tools/call',
    params: {
      name: 'worktree_status',
      arguments: {}
    }
  });
  assert.ok(res);
  const result = res.result as { content: Array<{ type: string; text: string }> };
  assert.strictEqual(result.content[0].type, 'text');
  const parsed = JSON.parse(result.content[0].text);
  assert.ok(Array.isArray(parsed.worktrees));
  assert.strictEqual(typeof parsed.activeCount, 'number');
  assert.strictEqual(typeof parsed.lockedFiles, 'object');
});

test('handleJsonRpc executes task suite tools (task_list, task_claim, lock_status)', async () => {
  const listRes = await handleJsonRpc({
    jsonrpc: '2.0',
    id: 12,
    method: 'tools/call',
    params: { name: 'task_list', arguments: {} }
  });
  assert.ok(listRes);
  const listParsed = JSON.parse((listRes.result as { content: Array<{ text: string }> }).content[0].text);
  assert.ok(typeof listParsed.count === 'number');

  const claimRes = await handleJsonRpc({
    jsonrpc: '2.0',
    id: 13,
    method: 'tools/call',
    params: { name: 'task_claim', arguments: { issueNumber: 501, agentRole: 'qa-hunter' } }
  });
  assert.ok(claimRes);
  const claimParsed = JSON.parse((claimRes.result as { content: Array<{ text: string }> }).content[0].text);
  assert.strictEqual(claimParsed.success, true);

  const lockRes = await handleJsonRpc({
    jsonrpc: '2.0',
    id: 14,
    method: 'tools/call',
    params: { name: 'lock_status', arguments: {} }
  });
  assert.ok(lockRes);
  const lockParsed = JSON.parse((lockRes.result as { content: Array<{ text: string }> }).content[0].text);
  assert.ok(typeof lockParsed.lockedFiles === 'object');
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
