/**
 * @file godot-leak-radar.ts
 * Memory Leak & Orphan Node Radar for Godot 4.x Substrates.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

export interface LeakRadarEvaluation {
  hasLeak: boolean;
  delta: number;
  initialOrphans: number;
  finalOrphans: number;
  message: string;
}

export class GodotLeakRadar {
  public static evaluateOrphanDelta(initialOrphans: number, finalOrphans: number): LeakRadarEvaluation {
    const delta = finalOrphans - initialOrphans;
    const hasLeak = delta > 0;
    const message = hasLeak
      ? `MEMORY LEAK DETECTED: ${delta} orphan node(s) accumulated in ObjectDB (${initialOrphans} -> ${finalOrphans}).`
      : `CLEAN: Zero orphan node leaks detected (delta: ${delta}).`;

    return {
      hasLeak,
      delta,
      initialOrphans,
      finalOrphans,
      message
    };
  }

  public static parseOrphanNodeOutput(output: string): number | null {
    const match = output.match(/(?:ORPHAN_NODES_DELTA|orphan_node_count):\s*(\d+)/i);
    return match ? parseInt(match[1], 10) : null;
  }
}
