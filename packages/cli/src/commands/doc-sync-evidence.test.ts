import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { WikiMemoryManager } from '@aegis/github-live';
import { syncRfcToWikiAndReadme } from './doc-sync-command.js';

test('RFC sync reports actual page/count evidence and keeps source statuses without inferred approval', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-doc-evidence-'));
  const previous = process.env.AEGIS_WORKSPACE;
  process.env.AEGIS_WORKSPACE = root;
  try {
    fs.mkdirSync(path.join(root, 'docs/rfc'), { recursive: true });
    const proposed = '# RFC-099: Proposal\n**Status:** Proposed\n- [ ] Implement';
    fs.writeFileSync(path.join(root, 'docs/rfc/RFC-099-proposal.md'), proposed);
    fs.writeFileSync(path.join(root, 'docs/rfc/RFC-001-unknown.md'), '# RFC-001: Undeclared');
    fs.writeFileSync(path.join(root, 'README.md'), 'RFC (99 Adet)\nMCP-77 Native Tools\nRFC-001 - RFC-099');
    const setPage = t.mock.method(WikiMemoryManager.prototype, 'setPage', () => {});
    const push = t.mock.method(WikiMemoryManager.prototype, 'pushAllToRemote', () => { throw new Error('Unexpected push'); });
    const result = await syncRfcToWikiAndReadme(99, 'Proposal', 'RFC-099-proposal.md', proposed);
    assert.equal(result.totalRfcs, 2);
    assert.equal(result.wikiPagesSynced, 1);
    assert.equal(result.wikiPushed, false);
    assert.equal(push.mock.callCount(), 0);
    const index = setPage.mock.calls.find(call => call.arguments[0] === 'RFC-Index')?.arguments[3] ?? '';
    assert.match(index, /Unspecified/);
    assert.match(index, /Proposed/);
    assert.doesNotMatch(index, /Approved/);
    assert.equal(setPage.mock.calls[0].arguments[3], proposed);
    assert.match(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), /RFC \(2 Adet\)\nMCP-77 Native Tools/);
    const second = await syncRfcToWikiAndReadme(99, 'Proposal', 'RFC-099-proposal.md', proposed);
    assert.equal(second.readmeUpdated, false);
  } finally {
    if (previous === undefined) delete process.env.AEGIS_WORKSPACE; else process.env.AEGIS_WORKSPACE = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
