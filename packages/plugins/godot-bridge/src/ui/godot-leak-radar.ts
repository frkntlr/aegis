/**
 * @file godot-leak-radar.ts
 * Memory Leak & Orphan Node Radar for Godot 4.x Substrates.
 * Audits ObjectDB inflation, orphan node accumulation, and script memory hygiene.
 * Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

export interface LeakRadarEvaluation {
  hasLeak: boolean;
  delta: number;
  initialOrphans: number;
  finalOrphans: number;
  message: string;
}

export interface ScriptMemoryHygieneReport {
  clean: boolean;
  issues: string[];
}

export class GodotLeakRadar {
  public static evaluateOrphanDelta(initialOrphans: number, finalOrphans: number): LeakRadarEvaluation {
    const delta = finalOrphans - initialOrphans;
    const hasLeak = delta > 0;
    const message = hasLeak
      ? `MEMORY LEAK DETECTED: ${delta} orphan node(s) accumulated in ObjectDB (${initialOrphans} -> ${finalOrphans}).`
      : `CLEAN: Zero orphan node leaks detected (delta: ${delta}).`;

    return { hasLeak, delta, initialOrphans, finalOrphans, message };
  }

  public static parseOrphanNodeOutput(output: string): number | null {
    const match = output.match(/(?:ORPHAN_NODES_DELTA|orphan_node_count):\s*(\d+)/i);
    return match ? parseInt(match[1], 10) : null;
  }

  public static parseObjectDbCount(output: string): { objectCount: number | null; resourceCount: number | null } {
    const objM = output.match(/(?:ObjectDB count|Objects):\s*(\d+)/i);
    const resM = output.match(/(?:Resource count|Resources):\s*(\d+)/i);
    return {
      objectCount: objM ? parseInt(objM[1], 10) : null,
      resourceCount: resM ? parseInt(resM[1], 10) : null
    };
  }

  public static auditScriptMemoryHygiene(scriptContent: string): ScriptMemoryHygieneReport {
    const issues: string[] = [];
    const lines = scriptContent.split(/\r?\n/);
    let inLoop = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('for ') || line.startsWith('while ')) {
        inLoop = true;
      } else if (line === '' || (!lines[i].startsWith('\t') && !lines[i].startsWith('  '))) {
        inLoop = false;
      }

      if (inLoop && line.includes('.connect(') && !line.includes('CONNECT_ONE_SHOT')) {
        issues.push(`Line ${i + 1}: Dynamic signal connection inside loop may cause connection leak without CONNECT_ONE_SHOT.`);
      }
      if (line.includes('Node.new()') && !scriptContent.includes('queue_free') && !scriptContent.includes('free()')) {
        if (!issues.some(iss => iss.includes('Node.new()'))) {
          issues.push(`Script instantiates nodes with Node.new() without any queue_free() lifecycle call.`);
        }
      }
    }
    return { clean: issues.length === 0, issues };
  }
}
