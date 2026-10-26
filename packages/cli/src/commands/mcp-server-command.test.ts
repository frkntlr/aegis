import test from 'node:test';
import * as assert from 'node:assert';
import { handleJsonRpc } from './mcp-server-command.js';

test('handleJsonRpc handles initialize request', () => {
  const res = handleJsonRpc({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  assert.ok(res);
  assert.strictEqual(res.id, 1);
  const result = res.result as Record<string, unknown>;
  assert.strictEqual(result.protocolVersion, '2024-11-05');
  assert.ok((result.serverInfo as Record<string, unknown>).name === 'aegis');
});

test('handleJsonRpc handles tools/list request', () => {
  const res = handleJsonRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.ok(res);
  const result = res.result as { tools: Array<{ name: string }> };
  assert.ok(result.tools.length >= 11);
  const names = result.tools.map(t => t.name);
  assert.ok(names.includes('memory_query'));
  assert.ok(names.includes('memory_stats'));
  assert.ok(names.includes('context7_query'));
  assert.ok(names.includes('rtk_compress'));
  assert.ok(names.includes('socratic_diagnose'));
});

test('handleJsonRpc handles tools/call and executes tools', () => {
  const res = handleJsonRpc({
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

test('handleJsonRpc returns error for unknown method', () => {
  const res = handleJsonRpc({ jsonrpc: '2.0', id: 4, method: 'unknown_method' });
  assert.ok(res);
  assert.ok(res.error);
});

test('handleJsonRpc executes triage tool', () => {
  const res = handleJsonRpc({
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

test('handleJsonRpc executes find_symbol and trace_relational tools', () => {
  const symRes = handleJsonRpc({
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: { name: 'find_symbol', arguments: { symbol: 'IronCageValidator' } }
  });
  assert.ok(symRes);
  const symContent = (symRes.result as { content: Array<{ type: string; text: string }> }).content[0].text;
  assert.ok(symContent.includes('IronCageValidator') || symContent.includes('found'));

  const traceRes = handleJsonRpc({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: { name: 'trace_relational', arguments: { target: 'IronCageValidator' } }
  });
  assert.ok(traceRes);
  const traceContent = (traceRes.result as { content: Array<{ type: string; text: string }> }).content[0].text;
  assert.ok(traceContent.includes('callers'));
});

test('handleJsonRpc executes socratic_diagnose tool', () => {
  const res = handleJsonRpc({
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
