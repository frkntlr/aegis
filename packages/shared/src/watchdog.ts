export interface EstimationFactors {
  blastRadiusFiles: number;
  affectedTestCount: number;
  dependencyDepth: number;
  historicalAverageSeconds?: number;
}

export interface TimeoutEstimation {
  calculatedTimeoutSeconds: number;
  confidence: 'high' | 'medium' | 'low';
  factors: EstimationFactors;
  reasoning: string;
}

export interface ExecutionHistoryRecord {
  modulePath: string;
  avgDurationMs: number;
  p95DurationMs: number;
  runCount: number;
  lastUpdated: string;
  recentDurationsMs?: number[];
}

export interface ProcessRunMetrics {
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
  exitCode: number | null;
  timedOut: boolean;
  stagnated: boolean;
  stdoutLinesCount: number;
  stderrLinesCount: number;
}
