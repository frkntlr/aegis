import { execFileSync } from 'node:child_process';

export interface GitHubAuthContext {
  token?: string;
  owner?: string;
  repo?: string;
  source: 'env' | 'gh-cli' | 'git-credential' | 'none';
  hasCredentials: boolean;
}

export class GitHubTokenResolver {
  private static resolveFromCli(): string | undefined {
    try {
      const ghToken = execFileSync('gh', ['auth', 'token'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      }).trim();
      return ghToken || undefined;
    } catch {
      return undefined;
    }
  }

  private static resolveFromGitCredentials(): string | undefined {
    try {
      const credOutput = execFileSync('git', ['credential', 'fill'], {
        input: 'protocol=https\nhost=github.com\n\n',
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      });
      const match = credOutput.match(/password=([^\r\n]+)/);
      return match ? match[1].trim() : undefined;
    } catch {
      return undefined;
    }
  }

  public static resolve(customToken?: string, repoRoot?: string): GitHubAuthContext {
    const raw = customToken?.trim() || process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
    if (raw) {
      return { token: raw, ...this.detectRepo(repoRoot), source: 'env', hasCredentials: true };
    }

    const cliToken = this.resolveFromCli();
    if (cliToken) {
      return { token: cliToken, ...this.detectRepo(repoRoot), source: 'gh-cli', hasCredentials: true };
    }

    const gitToken = this.resolveFromGitCredentials();
    if (gitToken) {
      return { token: gitToken, ...this.detectRepo(repoRoot), source: 'git-credential', hasCredentials: true };
    }

    return { ...this.detectRepo(repoRoot), source: 'none', hasCredentials: false };
  }

  public static detectRepo(repoRoot?: string): { owner?: string; repo?: string } {
    const cwd = repoRoot || process.cwd();
    const candidateRemotes = ['remote.origin.url', 'remote.upstream.url'];

    for (const rem of candidateRemotes) {
      try {
        const remoteUrl = execFileSync('git', ['config', '--get', rem], {
          cwd,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
        }).trim();

        if (!remoteUrl) continue;

        const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);
        if (match) {
          return {
            owner: match[1],
            repo: match[2]
          };
        }
      } catch {
        // try next candidate
      }
    }

    return {};
  }
}
