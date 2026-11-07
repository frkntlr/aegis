import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TeamworkReportGenerator } from './teamwork-report-generator.js';
import { TeamworkCoordinator } from './teamwork-coordinator.js';

test('TeamworkReportGenerator generates valid report data in under 10ms', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-report-test-'));
  try {
    const generator = new TeamworkReportGenerator(tmpDir);
    const start = performance.now();
    const report = generator.generate('tw-test-plan');
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 10, `Generation time ${elapsed}ms exceeded 10ms target`);
    assert.strictEqual(report.planId, 'tw-test-plan');
    assert.strictEqual(report.qualityGate.demirKafesCompliant, true);
    assert.strictEqual(report.qualityGate.anyCount, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TeamworkReportGenerator produces compact, json, and markdown formats', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-report-test-'));
  try {
    const generator = new TeamworkReportGenerator(tmpDir);
    const compact = generator.generateCompact('tw-compact-1');
    assert.ok(compact.startsWith('[TW-REPORT: tw-compact-1]'));
    assert.ok(compact.includes('DemirKafes: 100% Pass'));

    const jsonStr = generator.generateJson('tw-json-1');
    const parsed = JSON.parse(jsonStr) as { planId: string; qualityGate: { demirKafesCompliant: boolean } };
    assert.strictEqual(parsed.planId, 'tw-json-1');
    assert.strictEqual(parsed.qualityGate.demirKafesCompliant, true);

    const markdown = generator.generateMarkdown('tw-md-1');
    assert.ok(markdown.includes('# 📊 Aegis Teamwork Mission Report: tw-md-1'));
    assert.ok(markdown.includes('Demir Kafes Compliance'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TeamworkReportGenerator saves report to .aegis/reports/ correctly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-report-test-'));
  try {
    const generator = new TeamworkReportGenerator(tmpDir);
    const saveRes = generator.saveReport('tw-save-1');
    assert.ok(fs.existsSync(saveRes.filePath));
    const content = fs.readFileSync(saveRes.filePath, 'utf8');
    assert.ok(content.includes('tw-save-1'));
    assert.ok(saveRes.relativePath.includes('.aegis/reports/report-tw-save-1.md'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

function setupLiveMeshEnvironment(tmpDir: string) {
  const coordinator = new TeamworkCoordinator(tmpDir);
  const plan = coordinator.planTeamwork('Build micro-shard cache layer', ['src/cache.ts', 'src/store.ts']);
  coordinator.mesh.initializeMesh(plan.planId, plan.objective, plan.tracks);

  coordinator.mesh.postActivity(plan.tracks[0].subagentName, {
    status: 'done',
    activity: 'Implemented LRU eviction cache',
    modifiedFiles: ['src/cache.ts'],
    publishedContracts: ['LruCache', 'EvictionPolicy']
  });

  coordinator.mesh.postActivity(plan.tracks[3].subagentName, {
    status: 'working',
    activity: 'Running cache latency benchmarks',
    modifiedFiles: [],
    publishedContracts: []
  });
  return { coordinator, plan, generator: new TeamworkReportGenerator(tmpDir, coordinator.mesh) };
}

test('TeamworkReportGenerator reflects live mesh facts across subagent tracks', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-report-mesh-test-'));
  try {
    const { plan, generator } = setupLiveMeshEnvironment(tmpDir);
    const fullReport = generator.generateFullReport(plan.planId);

    assert.ok(fullReport.includes('## 🎯 Executive Card'));
    assert.ok(fullReport.includes('## 👥 Subagent Performance Matrix'));
    assert.ok(fullReport.includes('## 🛡️ Demir Kafes Compliance & Quality Gate'));
    assert.ok(fullReport.includes('## 📝 Real-Time ADRs & Recommendations'));
    assert.ok(fullReport.includes(plan.tracks[0].subagentName));
    assert.ok(fullReport.includes(plan.tracks[3].subagentName));
    assert.ok(fullReport.includes('LruCache'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TeamworkReportGenerator produces compact and json mesh reports', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-report-compact-test-'));
  try {
    const { plan, generator } = setupLiveMeshEnvironment(tmpDir);
    const compactReport = generator.generateCompactReport(plan.planId);
    assert.ok(compactReport.startsWith(`[TW-REPORT: ${plan.planId}]`));
    const tokenCountEstimate = compactReport.split(/\s+/).length;
    assert.ok(tokenCountEstimate < 120, `Token count ${tokenCountEstimate} must be <120`);

    const jsonReport = generator.generateJsonReport(plan.planId);
    assert.strictEqual(jsonReport.planId, plan.planId);
    assert.strictEqual(jsonReport.concurrency.totalAgents, plan.tracks.length);
    assert.strictEqual(jsonReport.concurrency.doneAgents, 1);
    assert.strictEqual(jsonReport.concurrency.activeAgents, 1);
    assert.deepStrictEqual(jsonReport.blastRadius.modifiedFiles, ['src/cache.ts']);
    assert.deepStrictEqual(jsonReport.blastRadius.publishedContracts, ['LruCache', 'EvictionPolicy']);

    const customDir = path.join(tmpDir, 'custom-reports');
    const customSave = generator.saveReport(plan.planId, customDir);
    assert.ok(fs.existsSync(customSave.filePath));
    assert.ok(customSave.bytes > 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
