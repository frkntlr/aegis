import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { cleanseExistingRfcForWiki } from './rfc-templates.js';
import { rfcStatus } from './rfc-source-evidence.js';

test('wiki conversion preserves RFC source, proposal status and incomplete acceptance criteria', () => {
  const source = '# RFC-099: Proposal\n**Durum:** Proposed\n- [ ] Implement feature\n## Evidence\nTests not run.';
  const result = cleanseExistingRfcForWiki('RFC-099-proposal', source);
  assert.equal(result.cleanContent, source);
  assert.match(result.threeBullets.join('\n'), /Declared status: Proposed/);
  assert.doesNotMatch(result.cleanContent, /Implemented \/ Authoritative|100%|zero-hallucination/);
  assert.equal(rfcStatus('# Unknown\nNo declared status'), 'Unspecified');
  assert.equal(rfcStatus('**Status:** Rejected'), 'Rejected');
});
