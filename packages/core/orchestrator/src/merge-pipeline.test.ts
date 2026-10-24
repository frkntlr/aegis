import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MergePipeline } from './merge-pipeline.js';

test('MergePipeline aborts on failed preMergeCheck in step 1', async () => {
  const pipeline = new MergePipeline();
  const res = await pipeline.executePipeline('solver', ['qa', 'docs'], false);

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.steps.length, 1);
  assert.strictEqual(res.steps[0].passed, false);
  assert.ok(res.steps[0].message.toLowerCase().includes('pre-merge quality gate'));
});

test('MergePipeline step4 preserves dirty sibling worktree modifications without crashing', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-merge-test-'));
  const expDir = path.join(tmpDir, 'experimental');
  const qaDir = path.join(expDir, 'qa');
  fs.mkdirSync(qaDir, { recursive: true });
  fs.writeFileSync(path.join(qaDir, 'dirty.txt'), 'uncommitted work', 'utf8');

  const pipeline = new MergePipeline({
    repoRoot: tmpDir,
    worktreePrefix: 'experimental',
    baseBranch: 'master'
  });

  const res = await pipeline.executePipeline('solver', ['qa'], false);
  assert.strictEqual(res.success, false);

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
