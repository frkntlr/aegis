import { test } from 'node:test';
import * as assert from 'node:assert';
import { CuratedIngestionPipeline } from './curated-ingestion-pipeline.js';
import type { DiscoveredSource, NotebookSourceSummary } from './types.js';

test('CuratedIngestionPipeline: normalizeUrl strips tracking parameters and trailing slashes', () => {
  const raw = 'HTTPS://Docs.GodotEngine.org/en/stable/tutorials/2d/?utm_source=google&ref=chat&utm_campaign=winter#intro/';
  const normalized = CuratedIngestionPipeline.normalizeUrl(raw);
  assert.ok(!normalized.includes('utm_source'));
  assert.ok(!normalized.includes('ref=chat'));
  assert.ok(normalized.startsWith('https://docs.godotengine.org'));
});

test('CuratedIngestionPipeline: skips duplicate URLs already present in notebook or batch', async () => {
  const pipeline = new CuratedIngestionPipeline();
  const existingSources: NotebookSourceSummary[] = [
    { id: 'src-1', title: 'https://filiph.net/text/ai-and-git-worktree.html', type: 'document' }
  ];

  const candidates: DiscoveredSource[] = [
    { title: 'Doc 1', url: 'https://filiph.net/text/ai-and-git-worktree.html?utm_source=twitter' },
    { title: 'Doc 2', url: 'https://developer.mozilla.org/en-US/docs/Web/API' },
    { title: 'Doc 2 Dup', url: 'https://developer.mozilla.org/en-US/docs/Web/API?ref=blog' },
    { title: 'Doc 3', url: 'https://nodejs.org/api/fs.html' }
  ];

  const res = await pipeline.filterAndRank(candidates, {
    existingSources,
    maxCuratedCount: 5
  });

  assert.strictEqual(res.selectedSources.length, 2);
  assert.strictEqual(res.selectedSources[0].title, 'Doc 2');
  assert.strictEqual(res.selectedSources[1].title, 'Doc 3');
  assert.strictEqual(res.skippedDuplicates.length, 2);
});

test('CuratedIngestionPipeline: skips unhealthy 404/broken URLs via headChecker', async () => {
  const mockHeadChecker = async (url: string) => !url.includes('broken.com');
  const pipeline = new CuratedIngestionPipeline(mockHeadChecker);

  const candidates: DiscoveredSource[] = [
    { title: 'Broken Link', url: 'https://broken.com/404' },
    { title: 'Healthy Link', url: 'https://healthy.com/guide' }
  ];

  const res = await pipeline.filterAndRank(candidates, { maxCuratedCount: 3 });
  assert.strictEqual(res.selectedSources.length, 1);
  assert.strictEqual(res.selectedSources[0].title, 'Healthy Link');
  assert.strictEqual(res.skippedUnhealthy.length, 1);
  assert.strictEqual(res.skippedUnhealthy[0], 'https://broken.com/404');
});

test('CuratedIngestionPipeline: respects maxCuratedCount limit', async () => {
  const pipeline = new CuratedIngestionPipeline();
  const candidates: DiscoveredSource[] = [
    { title: 'D1', url: 'https://site1.com' },
    { title: 'D2', url: 'https://site2.com' },
    { title: 'D3', url: 'https://site3.com' },
    { title: 'D4', url: 'https://site4.com' },
    { title: 'D5', url: 'https://site5.com' }
  ];

  const res = await pipeline.filterAndRank(candidates, { maxCuratedCount: 3 });
  assert.strictEqual(res.selectedSources.length, 3);
  assert.strictEqual(res.selectedSources[0].title, 'D1');
  assert.strictEqual(res.selectedSources[2].title, 'D3');
});
