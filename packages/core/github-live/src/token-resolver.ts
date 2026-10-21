import { execSync } from 'node:child_process';

export interface GitHubAuthContext {
  token?: string;
  owner?: string;
  repo?: string;
  source: 'env' | 'gh-cli' | 'none';
  hasCredentials: boolean;
}

export class GitHubTokenResolver {
  public static resolve(customToken?: string): GitHubAuthContext {
    // 1. Direct custom token
    if (customToken && customToken.trim()) {
      return {
        token: customToken.trim(),
        ...this.detectRepo(),
        source: 'env',
        hasCredentials: true
      };
    }

    // 2. Environment variables GITHUB_TOKEN or GH_TOKEN
    const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (envToken && envToken.trim()) {
      return {
        token: envToken.trim(),
        ...this.detectRepo(),
        source: 'env',
        hasCredentials: true
      };
    }

    // 3. GitHub CLI fallback
    try {
      const ghToken = execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (ghToken) {
        return {
          token: ghToken,
          ...this.detectRepo(),
          source: 'gh-cli',
          hasCredentials: true
        };
      }
    } catch {
      // gh CLI not installed or not logged in
    }

    return {
      ...this.detectRepo(),
      source: 'none',
      hasCredentials: false
    };
  }

  public static detectRepo(): { owner?: string; repo?: string } {
    try {
      const remoteUrl = execSync('git config --get remote.origin.url', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();

      if (!remoteUrl) return {};

      // Match git@github.com:owner/repo.git or https://github.com/owner/repo.git
      const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);
      if (match) {
        return {
          owner: match[1],
          repo: match[2]
        };
      }
    } catch {
      // git remote not configured
    }

    return {};
  }
}
