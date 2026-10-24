import type { EstimationFactors, TimeoutEstimation } from '@aegis/shared';

export interface EstimatorOptions {
  baseTimeoutSeconds?: number;
  maxCeilingSeconds?: number;
  alphaFileWeight?: number;
  betaTestWeight?: number;
  gammaDepthWeight?: number;
}

function sanitizeFactor(val: number | undefined, fallback: number = 0): number {
  return typeof val === 'number' && Number.isFinite(val) ? Math.max(0, val) : fallback;
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
    const files = sanitizeFactor(factors.blastRadiusFiles, 0);
    const tests = sanitizeFactor(factors.affectedTestCount, 0);
    const depth = sanitizeFactor(factors.dependencyDepth, 0);
    const hist = sanitizeFactor(factors.historicalAverageSeconds, 0);

    const rawCalculated = this.baseTimeout
      + (this.alpha * files)
      + (this.beta * tests)
      + (this.gamma * depth);

    let finalTimeout = rawCalculated;
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    let reasoning = `Base ${this.baseTimeout}s + (${files} files × ${this.alpha}s) + (${tests} tests × ${this.beta}s) + (depth ${depth} × ${this.gamma}s)`;

    if (hist > 0) {
      // Historical safety factor of 1.5x
      const historicalTarget = hist * 1.5;
      finalTimeout = Math.max(rawCalculated, historicalTarget);
      confidence = 'high';
      reasoning += ` | Calibrated with historical average ${hist.toFixed(1)}s (1.5x buffer)`;
    } else {
      confidence = files <= 2 ? 'medium' : 'low';
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
