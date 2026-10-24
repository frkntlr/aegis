export interface AegisToolchainConfig {
  $schema?: string;
  project_name: string;
  engine: 'web' | 'godot' | 'python' | 'custom';
  language: string;
  runtime: string;
  test: {
    unit: string;
    e2e?: string;
  };
  linters: string[];
  strict_typing: boolean;
  git_provider: 'github' | 'gitlab' | 'gitea';
  ide: 'antigravity' | 'cursor' | 'vscode';
  agents: {
    count: number;
    names: string[];
    worktree_prefix: string;
    isolated_environments: Record<string, {
      port_range: [number, number];
      test_db: string;
      env_overrides: Record<string, string>;
    }>;
  };
  watchdog: {
    adaptive_timeout: boolean;
    base_timeout_seconds: number;
    max_ceiling_seconds: number;
    stagnation_threshold_seconds: number;
    max_retries: number;
    issue_token_cap: number;
  };
  iron_cage: {
    max_function_lines: number;
    max_file_lines: number;
    max_cyclomatic_complexity: number;
    forbid_full_file_rewrites: boolean;
    require_tdd: boolean;
  };
  godot?: AegisGodotConfig;
}

export type GodotAspectRatio = '16:9' | '21:9' | '16:10' | '9:16';

export interface AegisGodotConfig {
  bridgePort?: number;
  binaryPath?: string;
  cacheDir?: string;
  aspectRatios?: GodotAspectRatio[];
  rpcTimeoutMs?: number;
}
