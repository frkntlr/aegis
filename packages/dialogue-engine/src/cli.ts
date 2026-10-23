import { DialogueEngine } from './dialogue-engine.js';

export function runSimulatedTriage(symptom: string): string {
  const engine = new DialogueEngine();
  const session1 = engine.startSession(symptom);

  const selectedOpt = session1.availableOptions[0];
  const session2 = engine.chooseClarification(session1.sessionId, selectedOpt.id);

  const session3 = engine.confirmAndResolve(session2.sessionId, true);
  const task = engine.exportTask(session3.sessionId);

  return [
    `=== 3-Turn Dialogue Session: ${session3.sessionId} ===`,
    `Turn 1 (Symptom): ${symptom} -> Category: ${session1.category}`,
    `Turn 2 (Clarification): Selected [${selectedOpt.id}] ${selectedOpt.label}`,
    `Turn 3 (Prescription): Status -> RESOLVED: ${session3.isResolved}`,
    '---------------------------------------------------',
    task
  ].join('\n');
}

export function main(): void {
  const sample = process.argv[2] || 'System experiences timeout and high latency in watchdog';
  const output = runSimulatedTriage(sample);
  console.log(output);
}

if (process.argv[1]?.endsWith('cli.js')) {
  main();
}
