/**
 * @file godot-port-router.ts
 * Deterministic Worktree Port Scoping & CLI Argument Routing for Multi-Agent Godot Workflows.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

import * as os from 'node:os';
import * as path from 'node:path';

export interface GodotLaunchOptions {
  worktreeOrRole?: string;
  trackId?: string;
  port?: number;
  token?: string;
  headless?: boolean;
  scene?: string;
  fixedFps?: number;
  timeScale?: number;
  userDataDir?: string;
}

export interface TrackPortAllocation {
  port: number;
  debugPort: number;
  userDataDir: string;
}

export class GodotPortRouter {
  public static readonly BASE_PORT = 6850;
  public static readonly DEBUG_BASE_PORT = 6200;

  public static resolvePort(worktreeOrRole?: string): number {
    return this.BASE_PORT + this.computePortOffset(worktreeOrRole);
  }

  public static computePortOffset(trackOrRole?: string): number {
    if (!trackOrRole) return 0;
    const lower = trackOrRole.toLowerCase();

    if (lower.includes('solver')) return 1; // 6851
    if (lower.includes('qa')) return 2;     // 6852
    if (lower.includes('ui')) return 3;     // 6853

    // Hash fallback for arbitrary worktree names
    let hash = 0;
    for (let i = 0; i < lower.length; i++) {
      hash = (hash << 5) - hash + lower.charCodeAt(i);
      hash |= 0;
    }
    return (Math.abs(hash) % 50) + 10;
  }

  public static allocateTrackPort(
    trackId?: string,
    basePort: number = this.BASE_PORT
  ): TrackPortAllocation {
    const offset = this.computePortOffset(trackId);
    const port = basePort + offset;
    const debugPort = this.DEBUG_BASE_PORT + offset;
    const sanitized = trackId
      ? trackId.replace(/[/\\?%*:|"<>]/g, '-')
      : 'default';
    const userDataDir = path.join(os.tmpdir(), `aegis-godot-${sanitized}`);

    return {
      port,
      debugPort,
      userDataDir
    };
  }

  private static appendEngineArgs(args: string[], options: GodotLaunchOptions): void {
    if (options.headless !== false) {
      args.push(
        '--headless',
        '--display-driver', 'headless',
        '--rendering-driver', 'dummy',
        '--audio-driver', 'Dummy'
      );
    }
    if (options.fixedFps) args.push('--fixed-fps', String(options.fixedFps));
    if (options.timeScale) args.push('--time-scale', String(options.timeScale));

    const userDataDir = options.userDataDir ?? (
      options.trackId ? this.allocateTrackPort(options.trackId).userDataDir : undefined
    );
    if (userDataDir) args.push('--user-data-dir', userDataDir);
    if (options.scene) args.push(options.scene);
  }

  public static buildCliArgs(options: GodotLaunchOptions = {}): string[] {
    const args: string[] = [];
    this.appendEngineArgs(args, options);

    const port = options.port ?? (
      options.trackId
        ? this.allocateTrackPort(options.trackId, options.port ?? this.BASE_PORT).port
        : this.resolvePort(options.worktreeOrRole)
    );

    // Godot user arguments delimiter
    args.push('--', `--aegis-port=${port}`);
    if (options.token) {
      args.push(`--aegis-token=${options.token}`);
    }

    return args;
  }
}
