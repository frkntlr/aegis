/**
 * @file teamwork-waves.ts
 * Concurrent Multi-Agent Parallel Waves and Dispatch Grouping Engine.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type { TeamworkTrack, ExecutionWave } from './teamwork-types.js';

const PHASE_NAMES: Record<number, string> = {
  1: 'Parallel Core & UI Execution Wave',
  2: 'Autonomous QA Verification & Quality Gate Wave',
  3: 'Living Documentation & Architecture Wave'
};

export function computeExecutionWaves(tracks: TeamworkTrack[]): ExecutionWave[] {
  if (tracks.length === 0) return [];

  // Group tracks by phase
  const phaseMap = new Map<number, TeamworkTrack[]>();
  for (const t of tracks) {
    const phaseNum = t.phase > 0 ? t.phase : 1;
    const existing = phaseMap.get(phaseNum) ?? [];
    existing.push(t);
    phaseMap.set(phaseNum, existing);
  }

  const sortedPhases = Array.from(phaseMap.keys()).sort((a, b) => a - b);
  const waves: ExecutionWave[] = [];

  for (let i = 0; i < sortedPhases.length; i++) {
    const phase = sortedPhases[i];
    const phaseTracks = phaseMap.get(phase) ?? [];
    const waveNumber = i + 1;
    const requiredPriorWaves = [];
    for (let p = 1; p < waveNumber; p++) {
      requiredPriorWaves.push(p);
    }

    waves.push({
      waveNumber,
      phaseName: PHASE_NAMES[phase] ?? `Execution Phase ${phase} Wave`,
      tracks: phaseTracks,
      canRunConcurrently: phaseTracks.length > 1,
      requiredPriorWaves
    });
  }

  return waves;
}

export function formatParallelDispatchBriefing(waves: ExecutionWave[]): string {
  if (waves.length === 0) {
    return 'ℹ️ No execution waves defined.';
  }

  const lines: string[] = [
    '🌊 ===================================================',
    '🌊 AEGIS PARALLEL WAVES DISPATCH BRIEFING',
    '🌊 ==================================================='
  ];

  for (const wave of waves) {
    lines.push('');
    const conc = wave.canRunConcurrently ? '⚡ [CONCURRENT RUN]' : '🔒 [SEQUENTIAL RUN]';
    const depStr = wave.requiredPriorWaves.length > 0
      ? ` (Prerequisite Waves: ${wave.requiredPriorWaves.map(w => `Wave ${w}`).join(', ')})`
      : ' (Start Immediately)';
    lines.push(`🌊 WAVE ${wave.waveNumber}: ${wave.phaseName} ${conc}${depStr}`);
    lines.push(`   Agents ready for simultaneous dispatch: ${wave.tracks.length}`);

    for (const track of wave.tracks) {
      const payload = track.invocationPayload;
      lines.push(`   ▶ Subagent: @${track.subagentName} [${track.roleType.toUpperCase()}]`);
      lines.push(`     Title: "${track.title}"`);
      lines.push(`     Files: ${track.targetFiles.join(', ') || 'General'}`);
      lines.push(`     invoke_subagent payload:`);
      lines.push(`       TypeName: "${payload.TypeName}" | Role: "${payload.Role}" | Model: "${payload.Model}"`);
    }
  }

  lines.push('');
  lines.push('💡 Tip: Dispatch all subagents in Wave 1 simultaneously via parallel invoke_subagent calls.');
  lines.push('   Subagents communicate live via aegis tw:mesh / tw:peers and MCP teamwork_mesh_*.');
  lines.push('===================================================');

  return lines.join('\n');
}

export function formatCompactWaveBriefing(waves: ExecutionWave[]): string {
  if (waves.length === 0) return '[WAVES: 0]';
  const parts = waves.map(w => {
    const agents = w.tracks.map(t => `@${t.subagentName}[${t.targetFiles.join(',') || 'gen'}]`).join(' + ');
    const mode = w.canRunConcurrently ? 'PARALLEL' : 'SEQ';
    return `W${w.waveNumber}(${mode}): ${agents}`;
  });
  return `[PARALLEL WAVES:${waves.length}]\n` + parts.join('\n');
}

export function getConcurrentExecutionBatches(tracks: TeamworkTrack[]): TeamworkTrack[][] {
  const waves = computeExecutionWaves(tracks);
  return waves.map(w => w.tracks);
}


