/**
 * @file teamwork-report-command.ts
 * Instant high-signal report generation CLI command for Antigravity Teamwork.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { showBanner } from './banner.js';
import {
  TeamworkReportGenerator,
  type SaveReportResult
} from '@aegis/orchestrator';

export interface ParsedReportArgs {
  targetPlanId?: string;
  isCompact: boolean;
  isJson: boolean;
  isSave: boolean;
}

export function parseReportArgs(planId?: string, ...flags: string[]): ParsedReportArgs {
  const allTokens = [planId, ...flags].filter((a): a is string => Boolean(a));
  const isCompact = allTokens.some(t => t === '--compact' || t === '-c');
  const isJson = allTokens.some(t => t === '--json' || t === '-j');
  const isSave = allTokens.some(t => t === '--save' || t === '-s');
  const targetPlanId = allTokens.find(t => !t.startsWith('-'));
  return { targetPlanId, isCompact, isJson, isSave };
}

function renderJsonOutput(
  generator: TeamworkReportGenerator,
  targetPlanId?: string,
  saveResult?: SaveReportResult
): void {
  const data = generator.generate(targetPlanId);
  if (saveResult) {
    data.savedPath = saveResult.relativePath;
  }
  console.log(JSON.stringify(data, null, 2));
}

function renderCompactOutput(
  generator: TeamworkReportGenerator,
  targetPlanId?: string,
  saveResult?: SaveReportResult
): void {
  const compactText = generator.generateCompact(targetPlanId);
  console.log(compactText);
  if (saveResult) {
    console.log(`📄 Report saved to: ${saveResult.relativePath}`);
  }
}

function renderStandardOutput(
  generator: TeamworkReportGenerator,
  targetPlanId?: string,
  saveResult?: SaveReportResult
): void {
  showBanner();
  console.log(generator.generateMarkdown(targetPlanId));
  if (saveResult) {
    console.log(`\n📄 Report saved to: ${saveResult.relativePath}`);
  }
}

export function handleTeamworkReport(planId?: string, ...flags: string[]): void {
  const { targetPlanId, isCompact, isJson, isSave } = parseReportArgs(planId, ...flags);
  const generator = new TeamworkReportGenerator();
  const saveResult = isSave ? generator.saveReport(targetPlanId) : undefined;

  if (isJson) {
    renderJsonOutput(generator, targetPlanId, saveResult);
    return;
  }
  if (isCompact) {
    renderCompactOutput(generator, targetPlanId, saveResult);
    return;
  }
  renderStandardOutput(generator, targetPlanId, saveResult);
}
