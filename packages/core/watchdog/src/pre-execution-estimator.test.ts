import { test } from 'node:test';
import * as assert from 'node:assert';
import { PreExecutionEstimator } from './pre-execution-estimator.js';

test('PreExecutionEstimator calculates base timeout for 0 changes', () => {
  const estimator = new PreExecutionEstimator({ baseTimeoutSeconds: 30 });
  const result = estimator.estimate({
    blastRadiusFiles: 0,
    affectedTestCount: 0,
    dependencyDepth: 0
  });

  assert.strictEqual(result.calculatedTimeoutSeconds, 30);
  assert.strictEqual(result.confidence, 'medium');
});

test('PreExecutionEstimator scales dynamically with blast radius and test count', () => {
  const estimator = new PreExecutionEstimator({
    baseTimeoutSeconds: 30,
    alphaFileWeight: 15,
    betaTestWeight: 5,
    gammaDepthWeight: 10
  });

  // 3 files changed, 4 tests, depth 1 => 30 + (3*15) + (4*5) + (1*10) = 30 + 45 + 20 + 10 = 105s
  const result = estimator.estimate({
    blastRadiusFiles: 3,
    affectedTestCount: 4,
    dependencyDepth: 1
  });

  assert.strictEqual(result.calculatedTimeoutSeconds, 105);
});

test('PreExecutionEstimator calibrates with historical data when available', () => {
  const estimator = new PreExecutionEstimator({ baseTimeoutSeconds: 30 });
  
  // Historical average was 80s -> with 1.5x buffer = 120s
  const result = estimator.estimate({
    blastRadiusFiles: 1,
    affectedTestCount: 1,
    dependencyDepth: 0,
    historicalAverageSeconds: 80
  });

  assert.ok(result.calculatedTimeoutSeconds >= 120);
  assert.strictEqual(result.confidence, 'high');
});

test('PreExecutionEstimator respects max ceiling', () => {
  const estimator = new PreExecutionEstimator({
    baseTimeoutSeconds: 30,
    maxCeilingSeconds: 300
  });

  // Huge change that would compute > 300s
  const result = estimator.estimate({
    blastRadiusFiles: 50,
    affectedTestCount: 100,
    dependencyDepth: 5
  });

  assert.strictEqual(result.calculatedTimeoutSeconds, 300);
});
