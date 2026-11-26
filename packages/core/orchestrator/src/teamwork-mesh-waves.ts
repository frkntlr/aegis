import type { TeamworkMeshState } from './teamwork-types.js';
import type { TeamworkMeshStore } from './teamwork-mesh-store.js';

export interface WaveStatus {
  wave: number;
  total: number;
  done: number;
  blocked: number;
  pending: number;
  readyForNextWave: boolean;
  needsCorrection: boolean;
}

export interface WaveAdvanceResult {
  advanced: boolean;
  currentWave: number;
  nextWave: number;
  message: string;
  status: WaveStatus;
  blockedAgents: string[];
  pendingAgents: string[];
  readinessReport: string;
}

export function inspectWaveReadinessHelper(state: TeamworkMeshState, wave: number): {
  status: WaveStatus;
  blockedAgents: string[];
  pendingAgents: string[];
  readinessReport: string;
} {
  const peers = Object.values(state.agents).filter(p =>
    (p.phase ?? (p.currentActivity.includes(`Wave ${wave}`) ? wave : undefined)) === wave
  );
  const blockedAgents = peers.filter(p => p.status === 'blocked').map(p => p.subagentName);
  const pendingAgents = peers.filter(p => p.status !== 'done' && p.status !== 'blocked').map(p => p.subagentName);
  const done = peers.filter(p => p.status === 'done').length;
  const total = peers.length;
  const status: WaveStatus = {
    wave,
    total,
    done,
    blocked: blockedAgents.length,
    pending: pendingAgents.length,
    readyForNextWave: total === 0 || done === total,
    needsCorrection: blockedAgents.length > 0
  };

  let readinessReport = '';
  if (blockedAgents.length > 0) {
    readinessReport = `Wave ${wave} blocked: ${blockedAgents.length} agent(s) [${blockedAgents.join(', ')}]. Remediation required.`;
  } else if (pendingAgents.length > 0) {
    readinessReport = `Wave ${wave} in progress: ${pendingAgents.length} pending agent(s) [${pendingAgents.join(', ')}] (${done}/${total} done).`;
  } else {
    readinessReport = `Wave ${wave} verified: all ${total} tasks complete. Ready for next wave.`;
  }
  return { status, blockedAgents, pendingAgents, readinessReport };
}

export function advanceWaveWithStore(store: TeamworkMeshStore, planId?: string): WaveAdvanceResult {
  return store.withLock(() => {
    const state = store.loadState();
    const oldWave = state.activeWave;
    const inspection = inspectWaveReadinessHelper(state, oldWave);

    state.activeWave += 1;
    state.lastUpdated = new Date().toISOString();
    const phaseNames: Record<number, string> = { 2: 'QA Hunter Verification', 3: 'Living Architecture Synthesis' };
    const nextPhase = phaseNames[state.activeWave] ?? 'Final Delivery';
    const msg = `🌊 Wave ${oldWave} completed! Wave ${state.activeWave} (${nextPhase}) unlocked. [${inspection.readinessReport}]`;

    store.appendEvent(state, 'coordinator', 'milestone', msg, {
      eventName: 'WAVE_COMPLETED',
      fromWave: oldWave,
      toWave: state.activeWave,
      nextPhase,
      triggerReflection: true,
      planId: planId ?? state.planId,
      waveStatus: inspection.status,
      blockedAgents: inspection.blockedAgents,
      pendingAgents: inspection.pendingAgents,
      readinessReport: inspection.readinessReport
    });
    store.saveState(state);

    return {
      advanced: true,
      currentWave: oldWave,
      nextWave: state.activeWave,
      message: msg,
      status: inspection.status,
      blockedAgents: inspection.blockedAgents,
      pendingAgents: inspection.pendingAgents,
      readinessReport: inspection.readinessReport
    };
  });
}

export function checkWaveProgressionHelper(store: TeamworkMeshStore, state: TeamworkMeshState): void {
  const currentWave = state.activeWave;
  const peers = Object.values(state.agents).filter(p =>
    (p.phase ?? (p.currentActivity.includes(`Wave ${currentWave}`) ? currentWave : undefined)) === currentWave
  );
  if (peers.length > 0 && peers.every(p => p.status === 'done')) {
    const oldWave = state.activeWave;
    state.activeWave += 1;
    const phaseNames: Record<number, string> = { 2: 'QA Hunter Verification', 3: 'Living Architecture Synthesis' };
    const nextPhase = phaseNames[state.activeWave] ?? 'Final Delivery';
    store.appendEvent(state, 'coordinator', 'milestone', `🌊 Wave ${oldWave} completed! Wave ${state.activeWave} unlocked.`, {
      eventName: 'WAVE_COMPLETED',
      fromWave: oldWave,
      toWave: state.activeWave,
      nextPhase,
      triggerReflection: true
    });
  }
}
