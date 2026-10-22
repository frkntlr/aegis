import * as fs from 'node:fs';
import * as path from 'node:path';

export interface IdeExclusionResult {
  ideId: string;
  success: boolean;
  configuredFiles: string[];
}

export interface IdeAdapter {
  readonly ideId: string;
  readonly name: string;
  setupExclusions(repoRoot: string): IdeExclusionResult;
}

export class VSCodeAdapter implements IdeAdapter {
  public readonly ideId = 'vscode';
  public readonly name = 'VS Code / Google Antigravity';

  public setupExclusions(repoRoot: string): IdeExclusionResult {
    const vscodeDir = path.resolve(repoRoot, '.vscode');
    const settingsFile = path.resolve(vscodeDir, 'settings.json');
    fs.mkdirSync(vscodeDir, { recursive: true });

    let settings: Record<string, any> = {};
    if (fs.existsSync(settingsFile)) {
      try {
        settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      } catch {
        settings = {};
      }
    }

    settings['files.exclude'] = {
      ...(settings['files.exclude'] || {}),
      'experimental/**': true
    };
    settings['search.exclude'] = {
      ...(settings['search.exclude'] || {}),
      'experimental/**': true
    };

    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
    return {
      ideId: this.ideId,
      success: true,
      configuredFiles: [settingsFile]
    };
  }
}

export class CursorAdapter implements IdeAdapter {
  public readonly ideId = 'cursor';
  public readonly name = 'Cursor AI IDE';

  public setupExclusions(repoRoot: string): IdeExclusionResult {
    const cursorDir = path.resolve(repoRoot, '.cursor');
    const settingsFile = path.resolve(cursorDir, 'settings.json');
    const rulesFile = path.resolve(repoRoot, '.cursorrules');
    fs.mkdirSync(cursorDir, { recursive: true });

    let settings: Record<string, any> = {};
    if (fs.existsSync(settingsFile)) {
      try {
        settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      } catch {
        settings = {};
      }
    }

    settings['files.exclude'] = {
      ...(settings['files.exclude'] || {}),
      'experimental/**': true
    };
    settings['search.exclude'] = {
      ...(settings['search.exclude'] || {}),
      'experimental/**': true
    };

    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');

    const ruleHeader = '# Aegis Autonomous Isolation Rule\nexperimental/**\n';
    if (!fs.existsSync(rulesFile) || !fs.readFileSync(rulesFile, 'utf8').includes('experimental/**')) {
      fs.appendFileSync(rulesFile, ruleHeader, 'utf8');
    }

    return {
      ideId: this.ideId,
      success: true,
      configuredFiles: [settingsFile, rulesFile]
    };
  }
}

export class IdeAdapterRegistry {
  private adapters: Map<string, IdeAdapter> = new Map();

  constructor() {
    this.register(new VSCodeAdapter());
    this.register(new CursorAdapter());
  }

  public register(adapter: IdeAdapter): void {
    this.adapters.set(adapter.ideId, adapter);
  }

  public getAdapter(ideId: string): IdeAdapter | undefined {
    return this.adapters.get(ideId);
  }

  public listAdapters(): string[] {
    return Array.from(this.adapters.keys());
  }

  public setupAll(repoRoot: string): IdeExclusionResult[] {
    const results: IdeExclusionResult[] = [];
    for (const adapter of this.adapters.values()) {
      results.push(adapter.setupExclusions(repoRoot));
    }
    return results;
  }
}
