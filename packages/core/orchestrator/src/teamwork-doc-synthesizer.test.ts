import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TeamworkCoordinator } from './teamwork-coordinator.js';
import { TeamworkDocSynthesizer } from './teamwork-doc-synthesizer.js';

test('TeamworkDocSynthesizer generates structured architectural briefing and Mermaid topology', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-doc-synth-test-'));
  try {
    const coordinator = new TeamworkCoordinator(tmpDir);
    const plan = coordinator.planTeamwork('Develop parser and fast cache layer', ['src/parser.ts', 'src/cache.ts']);
    coordinator.mesh.initializeMesh(plan.planId, plan.objective, plan.tracks);

    coordinator.mesh.postActivity('issue-solver [parser.ts]', {
      status: 'done',
      activity: 'Implemented recursive descent AST parser',
      modifiedFiles: ['src/parser.ts'],
      publishedContracts: ['parseAst', 'AstNode']
    });

    const synthesizer = new TeamworkDocSynthesizer(tmpDir, coordinator.mesh);
    const briefing = synthesizer.generateBriefing(plan.planId);

    assert.strictEqual(briefing.planId, plan.planId);
    assert.strictEqual(briefing.objective, plan.objective);
    assert.ok(briefing.executiveSummary.includes('Executive Architectural Summary'));
    assert.ok(briefing.executiveSummary.includes('src/parser.ts') || briefing.executiveSummary.includes('1 files'));
    assert.ok(briefing.mermaidDiagram.includes('flowchart TD'));
    assert.ok(briefing.mermaidDiagram.includes('Teamwork Coordinator'));
    assert.ok(briefing.metrics.tokenSavingsPercent >= 80);
    assert.strictEqual(briefing.qualityGate.demirKafesCompliant, true);
    assert.strictEqual(briefing.qualityGate.anyCount, 0);
    assert.ok(briefing.adrDecisions.length >= 4);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TeamworkDocSynthesizer synthesize outputs full markdown report and compact format', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-doc-synth-md-test-'));
  try {
    const coordinator = new TeamworkCoordinator(tmpDir);
    const plan = coordinator.planTeamwork('Build modular authentication gateway', ['src/auth.ts']);
    coordinator.mesh.initializeMesh(plan.planId, plan.objective, plan.tracks);

    const synthesizer = new TeamworkDocSynthesizer(tmpDir, coordinator.mesh);
    const fullMarkdown = synthesizer.synthesize(plan.planId);

    assert.ok(fullMarkdown.includes('# 🏛️ Aegis Living Architecture & Synthesis Report'));
    assert.ok(fullMarkdown.includes('### 🌐 Swarm & Component Topology'));
    assert.ok(fullMarkdown.includes('### ⚡ Performance & Efficiency Metrics'));
    assert.ok(fullMarkdown.includes('### 🛡️ Iron Cage Quality Gate'));
    assert.ok(fullMarkdown.includes('### 📝 Architectural Decision Records (ADRs)'));
    assert.ok(fullMarkdown.includes('✅ 100% PASS'));

    const compactStr = synthesizer.synthesizeCompact(plan.planId);
    assert.ok(compactStr.startsWith('[ARCH-SYNTHESIS:'));
    assert.ok(compactStr.includes('Tokens: -92%'));
    assert.ok(compactStr.includes('DemirKafes: 100% Green'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
