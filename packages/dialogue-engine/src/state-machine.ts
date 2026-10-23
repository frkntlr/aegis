import { TurnPhase } from './types.js';

export class DialogueStateMachine {
  private static readonly VALID_TRANSITIONS: Record<TurnPhase, TurnPhase[]> = {
    [TurnPhase.IDLE]: [TurnPhase.TURN_1_SYMPTOM],
    [TurnPhase.TURN_1_SYMPTOM]: [TurnPhase.TURN_2_CLARIFICATION],
    [TurnPhase.TURN_2_CLARIFICATION]: [TurnPhase.TURN_3_PRESCRIPTION],
    [TurnPhase.TURN_3_PRESCRIPTION]: [TurnPhase.COMPLETED],
    [TurnPhase.COMPLETED]: []
  };

  public static canTransition(current: TurnPhase, next: TurnPhase): boolean {
    const allowed = this.VALID_TRANSITIONS[current];
    return allowed ? allowed.includes(next) : false;
  }

  public static getNextPhase(current: TurnPhase): TurnPhase {
    const allowed = this.VALID_TRANSITIONS[current];
    if (!allowed || allowed.length === 0) {
      throw new Error(`Cannot transition from terminal state ${current}`);
    }
    return allowed[0];
  }

  public static isTerminal(phase: TurnPhase): boolean {
    return phase === TurnPhase.COMPLETED;
  }
}
