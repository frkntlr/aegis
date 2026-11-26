/**
 * @file teamwork-mesh-reports.ts
 * Wave dispatch, architecture doc synthesis, reflection, and iteration handlers.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { showBanner } from './banner.js';
import {
  TeamworkCoordinator,
  TeamworkDocSynthesizer,
  TeamworkReflectionEngine,
  formatAegisToolMatrix,
  ROLE_AEGIS_TOOLS,
  computeExecutionWaves,
  formatParallelDispatchBriefing,
  formatCompactWaveBriefing
} from '@aegis/orchestrator';

export function handleTeamworkWaves(objectiveArg?: string, ...filesOrFlags: string[]): void {
  const isJson = filesOrFlags.includes('--json') || filesOrFlags.includes('-j');
  const isCompact = filesOrFlags.includes('--compact') || filesOrFlags.includes('-c');
  const files = filesOrFlags.filter(f => f && !f.startsWith('-'));
  const coordinator = new TeamworkCoordinator();
  const plan = coordinator.planTeamwork(objectiveArg || 'Active Mission', files, { stage: false, acquireLocks: false });
  const waves = computeExecutionWaves(plan.tracks);

  if (isJson) { console.log(JSON.stringify(waves, null, 2)); return; }
  if (isCompact) { console.log(formatCompactWaveBriefing(waves)); return; }
  showBanner();
  console.log(formatParallelDispatchBriefing(waves));
}

export function handleTeamworkDoc(planId?: string, ...flags: string[]): void {
  const isCompact = flags.includes('--compact') || flags.includes('-c') || planId === '--compact' || planId === '-c';
  const isReadme = flags.includes('--readme') || planId === '--readme';
  const effectivePlanId = planId && !planId.startsWith('-') ? planId : undefined;
  const synthesizer = new TeamworkDocSynthesizer();
  if (isReadme) {
    const updated = TeamworkDocSynthesizer.updateReadme(effectivePlanId);
    showBanner();
    if (updated) {
      console.log(`📄 README.md successfully updated with Living Architecture report [Plan: ${effectivePlanId ?? 'latest'}].`);
    } else {
      console.log('⚠️ Could not update README.md (file not found or update failed).');
    }
    return;
  }
  if (isCompact) { console.log(synthesizer.synthesizeCompact(effectivePlanId)); return; }
  showBanner();
  console.log(synthesizer.synthesize(effectivePlanId));
}

export function handleTeamworkAdvance(planId?: string): void {
  const res = new TeamworkCoordinator().advanceWave(planId);
  showBanner();
  console.log(`🌊 Wave Advanced: Wave ${res.currentWave} -> Next Phase: ${res.nextPhase}`);
  if (res.readinessReport) {
    console.log(`📋 Wave Status: ${res.readinessReport}`);
  }
  console.log(`👥 Unlocked subagents in active batch: ${res.nextBatchPayload.length}`);
}

export function handleTeamworkTools(roleOrFlag?: string, ...flags: string[]): void {
  const isJson = roleOrFlag === '--json' || roleOrFlag === '-j' || flags.includes('--json') || flags.includes('-j');
  const role = roleOrFlag && !roleOrFlag.startsWith('-') ? roleOrFlag : undefined;
  if (isJson) {
    const tools = role ? (ROLE_AEGIS_TOOLS[role as keyof typeof ROLE_AEGIS_TOOLS] ?? []) : ROLE_AEGIS_TOOLS;
    console.log(JSON.stringify(tools, null, 2));
    return;
  }
  showBanner();
  console.log(formatAegisToolMatrix(role));
}

export function handleTeamworkReflect(planId?: string, ...flags: string[]): void {
  const isJson = flags.includes('--json') || flags.includes('-j') || planId === '--json' || planId === '-j';
  const pid = planId && !planId.startsWith('-') ? planId : undefined;
  const engine = new TeamworkReflectionEngine();
  const res = engine.evaluateCompleteness(pid);
  if (isJson) { console.log(JSON.stringify(res, null, 2)); return; }
  showBanner();
  console.log(engine.formatReflectionReport(res));
}

export function handleTeamworkIterate(planId?: string, ...flags: string[]): void {
  const isJson = flags.includes('--json') || flags.includes('-j') || planId === '--json' || planId === '-j';
  const pid = planId && !planId.startsWith('-') ? planId : undefined;
  const engine = new TeamworkReflectionEngine();
  const res = engine.runFeedbackLoop(pid);
  if (isJson) { console.log(JSON.stringify(res, null, 2)); return; }
  showBanner();
  console.log(engine.formatIterationReport(res));
}
