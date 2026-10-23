export enum TurnPhase {
  IDLE = 'IDLE',
  TURN_1_SYMPTOM = 'TURN_1_SYMPTOM',
  TURN_2_CLARIFICATION = 'TURN_2_CLARIFICATION',
  TURN_3_PRESCRIPTION = 'TURN_3_PRESCRIPTION',
  COMPLETED = 'COMPLETED'
}

export enum DiagnosticCategory {
  PERFORMANCE = 'PERFORMANCE',
  GIT_COLLISION = 'GIT_COLLISION',
  CAGE_VIOLATION = 'CAGE_VIOLATION',
  UNKNOWN = 'UNKNOWN'
}

export interface ClarificationOption {
  id: string;
  label: string;
  hypothesisKey: string;
}

export interface PrescriptionPlan {
  title: string;
  rootCause: string;
  steps: string[];
  acceptanceCriteria: string[];
  targetWorktree: string;
  lockLabels: string[];
}

export interface DialogueTurnRecord {
  turn: number;
  phase: TurnPhase;
  userInput: string;
  systemResponse: string;
  timestamp: string;
}

export interface DialogueSession {
  sessionId: string;
  phase: TurnPhase;
  turnCount: number;
  category: DiagnosticCategory;
  selectedOption?: ClarificationOption;
  availableOptions: ClarificationOption[];
  prescription?: PrescriptionPlan;
  history: DialogueTurnRecord[];
  isResolved: boolean;
}
