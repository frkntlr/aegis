import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AutonomousPruningEngine } from './autonomous-pruning-engine.js';
import type { NotebookSourceSummary } from './types.js';

test('AutonomousPruningEngine: Immutability Shield gives Score = 0 and vetoes pruning', async () => {
  const engine = new AutonomousPruningEngine();
  const protectedSources: NotebookSourceSummary[] = [
    { id: 'src-1', title: 'Anayasa & Temel Kurallar', type: 'document' },
    { id: 'src-2', title: 'Demir-Kafes Mimarisi', type: 'document' },
    { id: 'src-3', title: 'Living Architecture Index', type: 'document' }
  ];

  for (const s of protectedSources) {
    const res = await engine.evaluateSource(s);
    assert.strictEqual(res.score.immutabilityShield, true);
    assert.strictEqual(res.score.totalScore, 0);
    assert.strictEqual(res.score.verdict, 'PROTECTED');
    assert.ok(res.score.reasons[0].includes('Immutability Shield'));
  }
});

test('AutonomousPruningEngine: Superseded RFC + Zero Citation achieves >= 60 threshold', async () => {
  const tmpRfcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-rfc-test-'));
  fs.writeFileSync(
    path.join(tmpRfcDir, 'RFC-001-legacy.md'),
    '# RFC-001\nStatus: Superseded by RFC-016\nSome text'
  );

  const engine = new AutonomousPruningEngine({ rfcDir: tmpRfcDir, autonomousThreshold: 60 });
  const source: NotebookSourceSummary = {
    id: 'src-legacy-rfc',
    title: 'RFC-001 Legacy Architecture Blueprint',
    type: 'document'
  };

  const res = await engine.evaluateSource(source, { turnCitationsCount: 0 });
  assert.strictEqual(res.score.immutabilityShield, false);
  assert.strictEqual(res.score.supersessionScore, 40);
  assert.strictEqual(res.score.citationRecencyScore, 25);
  assert.strictEqual(res.score.totalScore, 65);
  assert.strictEqual(res.score.verdict, 'AUTONOMOUS_PRUNE_APPROVED');
});

test('AutonomousPruningEngine: Dead Link (+35) + Obsolete tag (+35) qualifies for autonomous pruning', async () => {
  const mockHeadChecker = async (url: string) => url.includes('valid.com');
  const engine = new AutonomousPruningEngine({
    httpHeadChecker: mockHeadChecker,
    autonomousThreshold: 60
  });

  const brokenSource: NotebookSourceSummary = {
    id: 'src-broken',
    title: '[Obsolete] Outdated Blog Post',
    type: 'document'
  };

  const res = await engine.evaluateSource(brokenSource, { url: 'https://deadlink.com/404' });
  assert.strictEqual(res.score.driftScore, 35);
  assert.strictEqual(res.score.verdict, 'RETAINED'); // 35 < 60 without zero citations

  // With zero citations: 35 + 25 = 60 -> Approved!
  const resWithCitations = await engine.evaluateSource(brokenSource, {
    url: 'https://deadlink.com/404',
    turnCitationsCount: 0
  });
  assert.strictEqual(resWithCitations.score.totalScore, 60);
  assert.strictEqual(resWithCitations.score.verdict, 'AUTONOMOUS_PRUNE_APPROVED');
});

test('AutonomousPruningEngine: filterAutonomousApproved filters candidates correctly', async () => {
  const engine = new AutonomousPruningEngine({ autonomousThreshold: 60 });
  const sources: NotebookSourceSummary[] = [
    { id: 'src-a', title: 'Anayasa', type: 'document' },
    { id: 'src-b', title: '[Deprecated] Legacy Module', type: 'document' },
    { id: 'src-c', title: 'Active Core Guide', type: 'document' }
  ];

  const approved = await engine.filterAutonomousApproved(sources, {
    'src-b': { turnCitationsCount: 0 } // 35 + 25 = 60
  });

  assert.strictEqual(approved.length, 1);
  assert.strictEqual(approved[0].sourceId, 'src-b');
  assert.strictEqual(approved[0].score.verdict, 'AUTONOMOUS_PRUNE_APPROVED');
});
