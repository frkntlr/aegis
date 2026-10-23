import { TurnPhase, DialogueSession, DialogueTurnRecord } from './types.js';
import { DialogueStateMachine } from './state-machine.js';
import { SymptomClassifier } from './classifier.js';
import { PrescriptionBuilder } from './prescription-builder.js';

export class DialogueEngine {
  private sessions: Map<string, DialogueSession> = new Map();

  public startSession(symptomText: string, customId?: string): DialogueSession {
    const sessionId = customId || `dlg-${Date.now().toString(36)}`;
    const category = SymptomClassifier.classify(symptomText);
    const options = SymptomClassifier.getClarificationOptions(category);

    const initialRecord: DialogueTurnRecord = {
      turn: 1,
      phase: TurnPhase.TURN_1_SYMPTOM,
      userInput: symptomText,
      systemResponse: `Identified category: ${category}. Please select the most likely underlying condition.`,
      timestamp: new Date().toISOString()
    };

    const session: DialogueSession = {
      sessionId,
      phase: TurnPhase.TURN_1_SYMPTOM,
      turnCount: 1,
      category,
      availableOptions: options,
      history: [initialRecord],
      isResolved: false
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  public chooseClarification(sessionId: string, optionId: string): DialogueSession {
    const session = this.getOrThrow(sessionId);
    this.assertPhase(session, TurnPhase.TURN_1_SYMPTOM, TurnPhase.TURN_2_CLARIFICATION);

    const option = session.availableOptions.find(o => o.id === optionId);
    if (!option) {
      throw new Error(`Option '${optionId}' is not valid for session ${sessionId}`);
    }

    session.selectedOption = option;
    session.phase = TurnPhase.TURN_2_CLARIFICATION;
    session.turnCount = 2;
    session.prescription = PrescriptionBuilder.buildPlan(session.category, option);

    const record: DialogueTurnRecord = {
      turn: 2,
      phase: TurnPhase.TURN_2_CLARIFICATION,
      userInput: option.label,
      systemResponse: `Hypothesis confirmed: ${option.hypothesisKey}. Prescription generated: "${session.prescription.title}". Ready for final review.`,
      timestamp: new Date().toISOString()
    };
    session.history.push(record);
    return session;
  }

  public confirmAndResolve(sessionId: string, confirmed: boolean): DialogueSession {
    const session = this.getOrThrow(sessionId);
    this.assertPhase(session, TurnPhase.TURN_2_CLARIFICATION, TurnPhase.TURN_3_PRESCRIPTION);

    session.turnCount = 3;
    session.phase = TurnPhase.COMPLETED;
    session.isResolved = confirmed;

    const record: DialogueTurnRecord = {
      turn: 3,
      phase: TurnPhase.TURN_3_PRESCRIPTION,
      userInput: confirmed ? 'Confirmed prescription' : 'Rejected prescription',
      systemResponse: confirmed
        ? 'Session successfully resolved in 3 turns. Aegis task dispatched.'
        : 'Prescription rejected. Session ended without dispatch.',
      timestamp: new Date().toISOString()
    };
    session.history.push(record);
    return session;
  }

  public exportTask(sessionId: string): string {
    const session = this.getOrThrow(sessionId);
    if (!session.prescription) {
      throw new Error(`Cannot export task: session ${sessionId} has no prescription.`);
    }
    return PrescriptionBuilder.formatAegisTask(session.prescription, sessionId);
  }

  public getSession(sessionId: string): DialogueSession | undefined {
    return this.sessions.get(sessionId);
  }

  private getOrThrow(sessionId: string): DialogueSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Dialogue session not found: ${sessionId}`);
    }
    return session;
  }

  private assertPhase(session: DialogueSession, expected: TurnPhase, target: TurnPhase): void {
    if (session.phase !== expected || !DialogueStateMachine.canTransition(session.phase, target)) {
      throw new Error(`Invalid transition from ${session.phase} to ${target}`);
    }
  }
}
