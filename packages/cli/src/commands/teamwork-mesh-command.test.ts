import { test, before, after } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  handleTeamworkMesh,
  handleTeamworkPeers,
  handleTeamworkPost,
  handleTeamworkBroadcast,
  handleTeamworkWaves,
  handleTeamworkConflicts,
  handleTeamworkScale,
  handleTeamworkBatch,
  handleTeamworkDoc,
  handleTeamworkAdvance,
  handleTeamworkReflect,
  handleTeamworkIterate,
  mcpTeamworkMeshRead,
  mcpTeamworkMeshPost,
  mcpTeamworkBroadcast,
  mcpTeamworkPeers,
  mcpTeamworkWaves,
  mcpTeamworkConflicts,
  mcpTeamworkScale,
  mcpTeamworkDocSynthesize
} from './teamwork-mesh-command.js';

let workspace: string;
const previousWorkspace = process.env.AEGIS_WORKSPACE;
before(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-teamwork-mesh-test-'));
  process.env.AEGIS_WORKSPACE = workspace;
});
after(() => {
  if (previousWorkspace === undefined) delete process.env.AEGIS_WORKSPACE;
  else process.env.AEGIS_WORKSPACE = previousWorkspace;
  fs.rmSync(workspace, { recursive: true, force: true });
});

test('mcpTeamworkMeshRead returns valid mesh state JSON and compact format', () => {
  const resStr = mcpTeamworkMeshRead();
  const res = JSON.parse(resStr) as { planId?: string; activeWave?: number };
  assert.ok(typeof res.planId === 'string');

  const compactStr = mcpTeamworkMeshRead({ compact: true });
  assert.ok(typeof compactStr === 'string');
  assert.ok(compactStr.startsWith('[MESH:'));
});

test('mcpTeamworkMeshPost and mcpTeamworkPeers record peer activity and compact view', () => {
  const postResStr = mcpTeamworkMeshPost({
    agentId: 'test-solver',
    status: 'working',
    activity: 'Writing unit tests',
    modifiedFiles: ['test.ts'],
    publishedContracts: ['testFn']
  });
  const postRes = JSON.parse(postResStr) as { agentId: string; status: string };
  assert.strictEqual(postRes.agentId, 'test-solver');
  assert.strictEqual(postRes.status, 'working');

  const peersResStr = mcpTeamworkPeers();
  const peers = JSON.parse(peersResStr) as Array<{ agentId: string }>;
  assert.ok(Array.isArray(peers));
  assert.ok(peers.some(p => p.agentId === 'test-solver'));

  const compactPeers = mcpTeamworkPeers({ compact: true });
  assert.ok(compactPeers.includes('@test-solver [working]'));
});

test('mcpTeamworkBroadcast appends and returns valid event', () => {
  const evStr = mcpTeamworkBroadcast({
    fromAgent: 'test-qa',
    message: 'Wave 1 QA tests passed',
    type: 'milestone'
  });
  const ev = JSON.parse(evStr) as { fromAgent: string; message: string; type: string };
  assert.strictEqual(ev.fromAgent, 'test-qa');
  assert.strictEqual(ev.message, 'Wave 1 QA tests passed');
  assert.strictEqual(ev.type, 'milestone');
});

test('mcpTeamworkWaves generates wave briefing and compact breakdown', () => {
  const wavesStr = mcpTeamworkWaves({
    objective: 'Implement lexer and parser'
  });
  const wavesRes = JSON.parse(wavesStr) as { waves: unknown[]; briefing: string };
  assert.ok(Array.isArray(wavesRes.waves));
  assert.ok(typeof wavesRes.briefing === 'string');
  assert.ok(wavesRes.briefing.includes('PARALLEL WAVES DISPATCH BRIEFING'));

  const compactWaves = mcpTeamworkWaves({
    objective: 'Implement lexer and parser',
    compact: true
  });
  assert.ok(compactWaves.includes('[PARALLEL WAVES:'));
});

test('mcpTeamworkConflicts returns array of conflicts', () => {
  const confStr = mcpTeamworkConflicts();
  const conf = JSON.parse(confStr) as unknown[];
  assert.ok(Array.isArray(conf));
});

test('mcpTeamworkScale returns JSON with subtasks and count', () => {
  const scaleStr = mcpTeamworkScale({ objective: 'Scale massive parsing engine', maxAgents: 6 });
  const res = JSON.parse(scaleStr) as { objective: string; maxAgents: number; count: number; subtasks: unknown[] };
  assert.strictEqual(res.maxAgents, 6);
  assert.ok(typeof res.count === 'number');
  assert.ok(Array.isArray(res.subtasks));
});

test('mcpTeamworkDocSynthesize returns full markdown and compact briefing', () => {
  const fullStr = mcpTeamworkDocSynthesize();
  assert.ok(fullStr.includes('Living Architecture & Synthesis Report'));
  assert.ok(fullStr.includes('Swarm & Component Topology'));

  const compactStr = mcpTeamworkDocSynthesize({ compact: true });
  assert.ok(compactStr.startsWith('[ARCH-SYNTHESIS:'));
});

test('CLI mesh handlers run without exceptions', () => {
  assert.doesNotThrow(() => handleTeamworkMesh());
  assert.doesNotThrow(() => handleTeamworkMesh('--json'));
  assert.doesNotThrow(() => handleTeamworkMesh('--compact'));
  assert.doesNotThrow(() => handleTeamworkMesh('radar'));
  assert.doesNotThrow(() => handleTeamworkPeers());
  assert.doesNotThrow(() => handleTeamworkPeers('--compact'));
  assert.doesNotThrow(() => handleTeamworkConflicts());
  assert.doesNotThrow(() => handleTeamworkPost('Testing mesh CLI', '--status=working', '--files=foo.ts'));
  assert.doesNotThrow(() => handleTeamworkBroadcast('Testing broadcast CLI', '--type=broadcast'));
  assert.doesNotThrow(() => handleTeamworkWaves('CLI objective test'));
  assert.doesNotThrow(() => handleTeamworkWaves('CLI objective test', '--compact'));
  assert.doesNotThrow(() => handleTeamworkScale('Scale CLI test', '--max-agents=4'));
  assert.doesNotThrow(() => handleTeamworkBatch('Batch CLI test'));
  assert.doesNotThrow(() => handleTeamworkBatch('Batch CLI test', '--json'));
  assert.doesNotThrow(() => handleTeamworkDoc());
  assert.doesNotThrow(() => handleTeamworkDoc('--compact'));
  assert.doesNotThrow(() => handleTeamworkAdvance());
  assert.doesNotThrow(() => handleTeamworkReflect());
  assert.doesNotThrow(() => handleTeamworkReflect('--json'));
  assert.doesNotThrow(() => handleTeamworkIterate());
  assert.doesNotThrow(() => handleTeamworkIterate('--json'));
  assert.doesNotThrow(() => handleTeamworkMesh('clear'));
  assert.ok(fs.existsSync(path.join(workspace, '.aegis/task-inbox.json')));
});

test('handleTeamworkDoc supports --readme flag in isolated workspace', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-cli-readme-test-'));
  fs.writeFileSync(path.join(tmp, 'README.md'), '# Temp Project\n<!-- AEGIS_ARCHITECTURE_START -->\n<!-- AEGIS_ARCHITECTURE_END -->\n');
  const prev = process.env.AEGIS_WORKSPACE;
  try {
    process.env.AEGIS_WORKSPACE = tmp;
    assert.doesNotThrow(() => handleTeamworkDoc('--readme'));
    assert.doesNotThrow(() => handleTeamworkDoc('tw-test-plan', '--readme'));
    const content = fs.readFileSync(path.join(tmp, 'README.md'), 'utf8');
    assert.ok(content.includes('Aegis Living Architecture'));
  } finally {
    if (prev === undefined) delete process.env.AEGIS_WORKSPACE;
    else process.env.AEGIS_WORKSPACE = prev;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
