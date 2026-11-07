/**
 * @file teamwork-report-formatter.ts
 * Markdown and Compact Report formatters for Aegis Teamwork Reporting.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type { GroundTruthFacts, QualityGateAuditSummary } from './teamwork-report-types.js';

export function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return `${min}m ${remSec}s`;
}

export function buildRecommendations(
  counts: { done: number; total: number; blocked: number },
  qg: QualityGateAuditSummary
): string[] {
  const recs: string[] = [];
  if (counts.blocked > 0) {
    recs.push(`Unblock ${counts.blocked} stalled subagent(s) via targeted feedback or dependency unlock.`);
  }
  if (!qg.demirKafesCompliant) {
    recs.push(`Deconstruct files >300L or functions >40L; eliminate ${qg.anyCount} any type(s).`);
  }
  if (counts.done === counts.total && counts.total > 0) {
    recs.push('All wave tracks completed. Advance wave or execute final autonomous verification & push.');
  } else if (counts.blocked === 0) {
    recs.push(`Maintain parallel momentum across remaining ${counts.total - counts.done} active subagent track(s).`);
  }
  return recs;
}

export function buildAdrDecisions(activeWave: number, agentCount: number): string[] {
  return [
    `ADR-01 [Enforced]: Micro-Sharded execution across ${agentCount} parallel subagent track(s).`,
    `ADR-02 [Active]: Wave ${activeWave} barrier synchronization with zero cross-track file collisions.`,
    'ADR-03 [Active]: Sub-millisecond atomic mesh blackboard persistence & heartbeat deduplication.',
    'ADR-04 [Strict]: Demir Kafes (<300L/file, <40L/fn, 0 any) deterministic verification gate.'
  ];
}

function buildExecutiveCard(facts: GroundTruthFacts): string[] {
  const qg = facts.qualityGate;
  return [
    '## 🎯 Executive Card',
    '| Metric | Value | Status / Details |',
    '| :--- | :--- | :--- |',
    `| **Mission Objective** | "${facts.objective || 'Active Mission'}" | Wave ${facts.activeWave} |`,
    `| **Duration** | **${facts.formattedDuration}** | Started: ${facts.startedAt} |`,
    `| **Concurrency Factor** | **${facts.concurrencyFactor}x** | ${facts.subagentCounts.done}/${facts.subagentCounts.total} tracks completed |`,
    `| **Modified Files** | **${facts.modifiedFiles.length} files** | ${facts.publishedContracts.length} published contracts |`,
    `| **Quality Gate Verdict** | **${qg.verdict}** | ${qg.demirKafesCompliant ? '100% Demir Kafes Compliant' : 'Demir Kafes Violations'} |`,
    `| **Git Context** | \`${facts.git.commit}\` (\`${facts.git.branch}\`) | ${facts.git.isClean ? 'Clean tree' : 'Uncommitted changes'} |`
  ];
}

function buildQualityGateSection(qg: QualityGateAuditSummary): string[] {
  const passVerdict = qg.demirKafesCompliant ? '100% Pass' : 'FAIL';
  return [
    '## 🛡️ Demir Kafes Compliance & Quality Gate',
    `- **Demir Kafes Compliance**: **${passVerdict}** (${qg.filesChecked} files audited)`,
    `  - Max Lines / File: **${qg.observedMaxFileLines}L** (Limit: ${qg.maxLinesPerFile}L)`,
    `  - Max Lines / Function: **${qg.observedMaxFuncLines}L** (Limit: ${qg.maxLinesPerFunction}L)`,
    `  - Any Annotations: **${qg.anyCount}** (Limit: 0)`,
    `- **Automated Tests Oracle**: **${qg.testPassRatePercent}% Green**`
  ];
}

export function buildFullReport(facts: GroundTruthFacts): string {
  const statusRows = facts.peers.map(p => {
    const fStr = p.modifiedFiles.length > 0 ? p.modifiedFiles.slice(0, 2).join(', ') : '-';
    const cStr = p.publishedContracts.length > 0 ? p.publishedContracts.join(', ') : '-';
    return `| @${p.subagentName} | \`${p.role}\` | **${p.status.toUpperCase()}** | ${fStr} | ${cStr} | ${p.currentActivity.slice(0, 45)} |`;
  }).join('\n');

  return [
    `# 📊 Aegis Teamwork Mission Report: ${facts.planId}`,
    '',
    ...buildExecutiveCard(facts),
    '',
    '## 👥 Subagent Performance Matrix',
    '| Subagent | Role | Status | Files | Contracts | Current Activity |',
    '| :--- | :--- | :--- | :--- | :--- | :--- |',
    statusRows || '| _none_ | - | - | 0 | 0 | No active peers |',
    '',
    ...buildQualityGateSection(facts.qualityGate),
    '',
    '## 📝 Real-Time ADRs & Recommendations',
    '### Architectural Decisions',
    ...facts.adrs.map(a => `- ${a}`),
    '',
    '### Next Action Recommendations',
    ...facts.recommendations.map(r => `- ${r}`)
  ].join('\n');
}

export function buildCompactReport(facts: GroundTruthFacts): string {
  const qg = facts.qualityGate;
  const peerSummary = facts.peers.map(p => `@${p.subagentName}:${p.status}`).join(', ') || 'none';
  const nextAction = facts.recommendations[0] ?? 'Advance execution';
  const qgVerdict = qg.demirKafesCompliant ? '100% Pass' : 'FAIL';

  return [
    `[TW-REPORT: ${facts.planId}] (Wave ${facts.activeWave} | ${facts.concurrencyFactor}x)`,
    `• Objective: "${facts.objective || 'Active Mission'}"`,
    `• Status: ${facts.subagentCounts.done}/${facts.subagentCounts.total} Done | Duration: ${facts.formattedDuration} | Git: ${facts.git.commit}`,
    `• Blast Radius: ${facts.modifiedFiles.length} files modified | ${facts.publishedContracts.length} contracts`,
    `• Quality Gate: DemirKafes: ${qgVerdict} (${qg.observedMaxFileLines}L/file, ${qg.observedMaxFuncLines}L/fn, ${qg.anyCount} any) | Tests: ${qg.testPassRatePercent}% Green`,
    `• Swarm: ${peerSummary}`,
    `• Next: ${nextAction}`
  ].join('\n');
}
