/**
 * @file rfc-pipeline-command.ts
 * End-to-end GitHub RFC lifecycle: Discussion <-> Issue cross-link and TIP staging.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { GitHubTokenResolver, RfcTriager } from '@aegis/github-live';
import { showBanner } from './banner.js';
import {
  createLiveIssueIfOnline,
  printPipelineSummary,
  resolveOrCreateRfcDoc,
  resolveOrPublishDiscussion,
  resolveRfcDir,
  stageTaskAndPrompt,
  updateRfcFileLinks
} from './rfc-pipeline-helpers.js';

export async function handleRfcPipeline(rfcArg?: string, descArg?: string): Promise<void> {
  showBanner();
  if (!rfcArg) {
    console.error('❌ Usage: aegis rfc:pipeline "<RFC Title or ID>" [Description]');
    process.exit(1);
  }

  const rfcDir = resolveRfcDir();
  fs.mkdirSync(rfcDir, { recursive: true });
  const doc = resolveOrCreateRfcDoc(rfcDir, rfcArg, descArg);
  const padNum = String(doc.num).padStart(3, '0');
  const auth = GitHubTokenResolver.resolve();
  const discInfo = await resolveOrPublishDiscussion(auth, doc.num, doc.rfcTitle, descArg, doc.content);

  const parsed = new RfcTriager().parseRfc(doc.rfcTitle, doc.content, discInfo?.number ?? doc.num);
  const baseIssue = new RfcTriager().convertToIssue(parsed, 100 + doc.num);
  const augmentedBody = [
    '### 🏛️ Aegis RFC Blueprint',
    `- **RFC Document:** \`docs/rfc/${doc.fileName}\``,
    discInfo?.url ? `- **Discussion:** ${discInfo.url}` : '',
    '',
    baseIssue.body
  ].filter(Boolean).join('\n');

  const { issueNum, issueUrl } = await createLiveIssueIfOnline(auth, padNum, baseIssue, augmentedBody, discInfo);
  stageTaskAndPrompt(issueNum, baseIssue.title, parsed.proposedFiles, baseIssue.acceptanceCriteria, augmentedBody);
  updateRfcFileLinks(path.join(rfcDir, doc.fileName), doc.content, discInfo?.url, issueNum, issueUrl);
  const { syncRfcToWikiAndReadme } = await import('./doc-sync-command.js');
  await syncRfcToWikiAndReadme(doc.num, doc.rfcTitle, doc.fileName, doc.content);
  printPipelineSummary({
    fileName: doc.fileName,
    discUrl: discInfo?.url,
    issueNum,
    issueUrl,
    title: baseIssue.title,
    proposedFiles: parsed.proposedFiles
  });
}
