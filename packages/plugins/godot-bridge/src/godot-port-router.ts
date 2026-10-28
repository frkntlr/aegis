/**
 * @file godot-port-router.ts
 * Deterministic Worktree Port Scoping & CLI Argument Routing for Multi-Agent Godot Workflows.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

export interface GodotLaunchOptions {
  worktreeOrRole?: string;
  port?: number;
  token?: string;
  headless?: boolean;
  scene?: string;
  fixedFps?: number;
  timeScale?: number;
}

export class GodotPortRouter {
  public static readonly BASE_PORT = 6850;

  public static resolvePort(worktreeOrRole?: string): number {
    if (!worktreeOrRole) return this.BASE_PORT;
    const lower = worktreeOrRole.toLowerCase();

    if (lower.includes('solver')) return this.BASE_PORT + 1; // 6851
    if (lower.includes('qa')) return this.BASE_PORT + 2;     // 6852
    if (lower.includes('ui')) return this.BASE_PORT + 3;     // 6853

    // Hash fallback for arbitrary worktree names
    let hash = 0;
    for (let i = 0; i < lower.length; i++) {
      hash = (hash << 5) - hash + lower.charCodeAt(i);
      hash |= 0;
    }
    return this.BASE_PORT + (Math.abs(hash) % 50) + 10;
  }

  public static buildCliArgs(options: GodotLaunchOptions = {}): string[] {
    const args: string[] = [];
    const isHeadless = options.headless !== false;

    if (isHeadless) {
      args.push(
        '--headless',
        '--display-driver', 'headless',
        '--rendering-driver', 'dummy',
        '--audio-driver', 'Dummy'
      );
    }

    if (options.fixedFps) {
      args.push('--fixed-fps', String(options.fixedFps));
    }
    if (options.timeScale) {
      args.push('--time-scale', String(options.timeScale));
    }
    if (options.scene) {
      args.push(options.scene);
    }

    const port = options.port ?? this.resolvePort(options.worktreeOrRole);
    const token = options.token;

    // Godot user arguments delimiter
    args.push('--', `--aegis-port=${port}`);
    if (token) {
      args.push(`--aegis-token=${token}`);
    }

    return args;
  }
}
