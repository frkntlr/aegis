export interface VisualDiffResult {
  totalPixels: number;
  differentPixels: number;
  diffPercentage: number;
  thresholdExceeded: boolean;
}

export class PixelmatchDiffEngine {
  public compareGrids(
    gridA: Uint8Array | number[],
    gridB: Uint8Array | number[],
    maxAllowedDiffPercent = 1.0
  ): VisualDiffResult {
    const len = Math.min(gridA.length, gridB.length);
    let differentPixels = 0;

    for (let i = 0; i < len; i++) {
      if (gridA[i] !== gridB[i]) {
        differentPixels++;
      }
    }

    // Account for size differences
    const totalPixels = Math.max(gridA.length, gridB.length);
    differentPixels += Math.abs(gridA.length - gridB.length);

    const diffPercentage = totalPixels > 0 ? (differentPixels / totalPixels) * 100 : 0;
    const thresholdExceeded = diffPercentage > maxAllowedDiffPercent;

    return {
      totalPixels,
      differentPixels,
      diffPercentage: parseFloat(diffPercentage.toFixed(2)),
      thresholdExceeded
    };
  }
}
