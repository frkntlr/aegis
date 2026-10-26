import {
  ParsedEvidence,
  MemorySymbolSlice,
  LineBudgetReport,
  IEvidenceProvider,
  IMemorySliceResolver,
  ILineBudgetInspector,
  ITaskDispatcher
} from './ports/index.js';

export * from './ports/index.js';

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
  GODOT_ENGINE = 'GODOT_ENGINE',
  MUTATION_GAP = 'MUTATION_GAP',
  MCP_SECURITY = 'MCP_SECURITY',
  UNKNOWN = 'UNKNOWN'
}

export interface ClarificationOption {
  id: string;
  label: string;
  hypothesisKey: string;
  microProbeCommand?: string;
  confidenceScore?: number;
}

export interface PrescriptionPlan {
  title: string;
  rootCause: string;
  steps: string[];
  acceptanceCriteria: string[];
  targetWorktree: string;
  lockLabels: string[];
  mustDecompose?: boolean;
  microProbeCommand?: string;
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
  evidence?: ParsedEvidence;
  memorySlice?: MemorySymbolSlice;
  budgetReport?: LineBudgetReport;
}

export interface DialogueEnginePorts {
  evidenceProvider?: IEvidenceProvider;
  memoryResolver?: IMemorySliceResolver;
  budgetInspector?: ILineBudgetInspector;
  taskDispatcher?: ITaskDispatcher;
}
