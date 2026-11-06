/**
 * @file teamwork-tools-catalog.test.ts
 * Verifies intelligent Aegis tool assignment and guidance for Antigravity subagent roles.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { test } from 'node:test';
import * as assert from 'node:assert';
import {
  ROLE_AEGIS_TOOLS,
  getAssignedAegisToolNames,
  buildIntelligentToolGuidance,
  formatAegisToolMatrix
} from './teamwork-tools-catalog.js';

test('ROLE_AEGIS_TOOLS contains intelligent tool assignments for all 4 roles', () => {
  const roles = ['solver', 'qa', 'ui', 'docs'] as const;
  for (const role of roles) {
    const tools = ROLE_AEGIS_TOOLS[role];
    assert.ok(Array.isArray(tools), `Expected tools array for role ${role}`);
    assert.ok(tools.length >= 4, `Expected at least 4 tools for role ${role}`);
    for (const tool of tools) {
      assert.ok(tool.name, 'Tool must have name');
      assert.ok(tool.cliCommand, 'Tool must have cliCommand');
      assert.ok(tool.mcpTool, 'Tool must have mcpTool');
      assert.ok(tool.description, 'Tool must have description');
      assert.ok(tool.purpose, 'Tool must have purpose');
    }
  }
});

test('getAssignedAegisToolNames returns correct tool names per role', () => {
  const solverTools = getAssignedAegisToolNames('solver');
  assert.ok(solverTools.includes('ast_search'));
  assert.ok(solverTools.includes('find_symbol'));
  assert.ok(solverTools.includes('trace_relational'));
  assert.ok(solverTools.includes('socratic_diagnose'));

  const qaTools = getAssignedAegisToolNames('qa');
  assert.ok(qaTools.includes('triage'));
  assert.ok(qaTools.includes('cage_check'));
  assert.ok(qaTools.includes('rtk_compress'));
  assert.ok(qaTools.includes('aegis_godot_playtest'));

  const uiTools = getAssignedAegisToolNames('ui');
  assert.ok(uiTools.includes('godot_ui_lint'));
  assert.ok(uiTools.includes('aegis_godot_inspect_ui'));
  assert.ok(uiTools.includes('godot_ui_scaffold'));

  const docTools = getAssignedAegisToolNames('docs');
  assert.ok(docTools.includes('teamwork_doc_synthesize'));
  assert.ok(docTools.includes('notebook_query'));
  assert.ok(docTools.includes('wiki_sync'));
});

test('buildIntelligentToolGuidance formats prompt section with CLI and MCP commands', () => {
  const guidance = buildIntelligentToolGuidance('solver');
  assert.ok(guidance.includes('Akıllı Aegis Araç Cephanesi'));
  assert.ok(guidance.includes('aegis find <symbol>'));
  assert.ok(guidance.includes('ast_search'));
  assert.ok(guidance.includes('socratic_diagnose'));
});

test('formatAegisToolMatrix returns markdown table with all roles or single role filter', () => {
  const tableAll = formatAegisToolMatrix();
  assert.ok(tableAll.includes('| `solver` |'));
  assert.ok(tableAll.includes('| `qa` |'));
  assert.ok(tableAll.includes('| `ui` |'));
  assert.ok(tableAll.includes('| `docs` |'));

  const tableQa = formatAegisToolMatrix('qa');
  assert.ok(tableQa.includes('| `qa` |'));
  assert.ok(!tableQa.includes('| `solver` |'));
});
