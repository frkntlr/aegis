import type { EstimationFactors, TimeoutEstimation } from '@aegis/shared';

export interface EstimatorOptions {
  baseTimeoutSeconds?: number;
  maxCeilingSeconds?: number;
  alphaFileWeight?: number;
  betaTestWeight?: number;
  gammaDepthWeight?: number;
}

export class PreExecutionEstimator {
  private baseTimeout: number;
  private maxCeiling: number;
  private alpha: number;
  private beta: number;
  private gamma: number;

  constructor(options: EstimatorOptions = {}) {
    this.baseTimeout = options.baseTimeoutSeconds ?? 30;
    this.maxCeiling = options.maxCeilingSeconds ?? 600;
    this.alpha = options.alphaFileWeight ?? 15;
    this.beta = options.betaTestWeight ?? 5;
    this.gamma = options.gammaDepthWeight ?? 10;
  }

  public estimate(factors: EstimationFactors): TimeoutEstimation {
    const rawCalculated = this.baseTimeout
      + (this.alpha * Math.max(0, factors.blastRadiusFiles))
      + (this.beta * Math.max(0, factors.affectedTestCount))
      + (this.gamma * Math.max(0, factors.dependencyDepth));

    let finalTimeout = rawCalculated;
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    let reasoning = `Base ${this.baseTimeout}s + (${factors.blastRadiusFiles} files × ${this.alpha}s) + (${factors.affectedTestCount} tests × ${this.beta}s) + (depth ${factors.dependencyDepth} × ${this.gamma}s)`;

    if (factors.historicalAverageSeconds && factors.historicalAverageSeconds > 0) {
      // Historical safety factor of 1.5x
      const historicalTarget = factors.historicalAverageSeconds * 1.5;
      finalTimeout = Math.max(rawCalculated, historicalTarget);
      confidence = 'high';
      reasoning += ` | Calibrated with historical average ${factors.historicalAverageSeconds.toFixed(1)}s (1.5x buffer)`;
    } else {
      confidence = factors.blastRadiusFiles <= 2 ? 'medium' : 'low';
    }

    finalTimeout = Math.min(finalTimeout, this.maxCeiling);

    return {
      calculatedTimeoutSeconds: Math.ceil(finalTimeout),
      confidence,
      factors,
      reasoning
    };
  }
}
