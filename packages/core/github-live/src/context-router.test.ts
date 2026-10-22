import { test } from 'node:test';
import * as assert from 'node:assert';
import { GitHubContextRouter } from './context-router.js';

test('GitHubContextRouter resolves all authoritative locations across GitHub and NotebookLM', () => {
  const router = new GitHubContextRouter({ owner: 'frkntlr', repo: 'aegis', projectNumber: 4 });

  const wiki = router.getLocation('wiki');
  assert.strictEqual(wiki.domain, 'wiki');
  assert.strictEqual(wiki.url, 'https://github.com/frkntlr/aegis/wiki');
  assert.strictEqual(wiki.accessProtocol, 'git');

  const proj = router.getLocation('projects');
  assert.strictEqual(proj.domain, 'projects');
  assert.strictEqual(proj.url, 'https://github.com/users/frkntlr/projects/4');

  const issues = router.getLocation('issues');
  assert.strictEqual(issues.domain, 'issues');
  assert.strictEqual(issues.url, 'https://github.com/frkntlr/aegis/issues');

  const research = router.getLocation('research');
  assert.strictEqual(research.domain, 'research');
  assert.strictEqual(research.accessProtocol, 'mcp');

  const targetIssueUrl = router.resolveTargetUrl('issues', 42);
  assert.strictEqual(targetIssueUrl, 'https://github.com/frkntlr/aegis/issues/42');

  const description = router.describeSystemLocations();
  assert.ok(description.includes('WIKI'));
  assert.ok(description.includes('PROJECTS'));
  assert.ok(description.includes('RESEARCH'));
});
