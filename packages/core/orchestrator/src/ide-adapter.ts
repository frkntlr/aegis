import * as fs from 'node:fs';
import * as path from 'node:path';

export interface IdeCapabilities {
  supportsMcp: boolean;
  supportsSkills: boolean;
  supportsSubagents: boolean;
  mcpConfigFile?: string;
}

export interface IdeExclusionResult {
  ideId: string;
  success: boolean;
  configuredFiles: string[];
}

export interface IdeAdapter {
  readonly ideId: string;
  readonly name: string;
  readonly capabilities: IdeCapabilities;
  setupExclusions(repoRoot: string): IdeExclusionResult;
}

function asObj(val: unknown): Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val) ? (val as Record<string, unknown>) : {};
}

function asArr(val: unknown): unknown[] {
  return Array.isArray(val) ? val : [];
}

function updateJsonSettings(filePath: string, mutator: (s: Record<string, unknown>) => void): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let settings: Record<string, unknown> = {};
  if (fs.existsSync(filePath)) {
    try {
      settings = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      settings = {};
    }
  }
  mutator(settings);
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf8');
}

export class AntigravityAdapter implements IdeAdapter {
  public readonly ideId = 'antigravity';
  public readonly name = 'Google Antigravity IDE (MultiGravity)';
  public readonly capabilities: IdeCapabilities = {
    supportsMcp: true,
    supportsSkills: true,
    supportsSubagents: true,
    mcpConfigFile: '.gemini/config/mcp_config.json'
  };

  public setupExclusions(repoRoot: string): IdeExclusionResult {
    const settingsFile = path.resolve(repoRoot, '.gemini', 'settings.json');
    updateJsonSettings(settingsFile, (s) => {
      s['files.exclude'] = { ...asObj(s['files.exclude']), 'experimental/**': true };
      s['search.exclude'] = { ...asObj(s['search.exclude']), 'experimental/**': true };
      s['antigravity.multiAgent'] = true;
    });
    return { ideId: this.ideId, success: true, configuredFiles: [settingsFile] };
  }
}

export class VSCodeAdapter implements IdeAdapter {
  public readonly ideId = 'vscode';
  public readonly name = 'Visual Studio Code';
  public readonly capabilities: IdeCapabilities = {
    supportsMcp: true,
    supportsSkills: false,
    supportsSubagents: false,
    mcpConfigFile: '.vscode/mcp.json'
  };

  public setupExclusions(repoRoot: string): IdeExclusionResult {
    const settingsFile = path.resolve(repoRoot, '.vscode', 'settings.json');
    updateJsonSettings(settingsFile, (s) => {
      s['files.exclude'] = { ...asObj(s['files.exclude']), 'experimental/**': true };
      s['search.exclude'] = { ...asObj(s['search.exclude']), 'experimental/**': true };
    });
    return { ideId: this.ideId, success: true, configuredFiles: [settingsFile] };
  }
}

export class CursorAdapter implements IdeAdapter {
  public readonly ideId = 'cursor';
  public readonly name = 'Cursor AI IDE';
  public readonly capabilities: IdeCapabilities = {
    supportsMcp: true,
    supportsSkills: true,
    supportsSubagents: false,
    mcpConfigFile: '.cursor/mcp.json'
  };

  public setupExclusions(repoRoot: string): IdeExclusionResult {
    const settingsFile = path.resolve(repoRoot, '.cursor', 'settings.json');
    const rulesFile = path.resolve(repoRoot, '.cursorrules');
    updateJsonSettings(settingsFile, (s) => {
      s['files.exclude'] = { ...asObj(s['files.exclude']), 'experimental/**': true };
      s['search.exclude'] = { ...asObj(s['search.exclude']), 'experimental/**': true };
    });
    const ruleHeader = '# Aegis Autonomous Isolation Rule\nexperimental/**\n';
    if (!fs.existsSync(rulesFile) || !fs.readFileSync(rulesFile, 'utf8').includes('experimental/**')) {
      fs.appendFileSync(rulesFile, ruleHeader, 'utf8');
    }
    return { ideId: this.ideId, success: true, configuredFiles: [settingsFile, rulesFile] };
  }
}

export class WindsurfAdapter implements IdeAdapter {
  public readonly ideId = 'windsurf';
  public readonly name = 'Codeium Windsurf IDE';
  public readonly capabilities: IdeCapabilities = {
    supportsMcp: true,
    supportsSkills: true,
    supportsSubagents: false,
    mcpConfigFile: '.codeium/windsurf/mcp_config.json'
  };

  public setupExclusions(repoRoot: string): IdeExclusionResult {
    const settingsFile = path.resolve(repoRoot, '.windsurf', 'settings.json');
    updateJsonSettings(settingsFile, (s) => {
      s['files.exclude'] = { ...asObj(s['files.exclude']), 'experimental/**': true };
    });
    return { ideId: this.ideId, success: true, configuredFiles: [settingsFile] };
  }
}

export class ZedAdapter implements IdeAdapter {
  public readonly ideId = 'zed';
  public readonly name = 'Zed Editor';
  public readonly capabilities: IdeCapabilities = {
    supportsMcp: true,
    supportsSkills: false,
    supportsSubagents: false,
    mcpConfigFile: '.zed/settings.json'
  };

  public setupExclusions(repoRoot: string): IdeExclusionResult {
    const settingsFile = path.resolve(repoRoot, '.zed', 'settings.json');
    updateJsonSettings(settingsFile, (s) => {
      s['file_scan_exclusions'] = [...asArr(s['file_scan_exclusions']), 'experimental/**'];
    });
    return { ideId: this.ideId, success: true, configuredFiles: [settingsFile] };
  }
}

export class IdeAdapterRegistry {
  private adapters: Map<string, IdeAdapter> = new Map();

  constructor() {
    this.register(new AntigravityAdapter());
    this.register(new VSCodeAdapter());
    this.register(new CursorAdapter());
    this.register(new WindsurfAdapter());
    this.register(new ZedAdapter());
  }

  public register(adapter: IdeAdapter): void {
    this.adapters.set(adapter.ideId, adapter);
  }

  public getAdapter(ideId: string): IdeAdapter | undefined {
    return this.adapters.get(ideId);
  }

  public listAdapters(): IdeAdapter[] {
    return Array.from(this.adapters.values());
  }

  public listAdapterIds(): string[] {
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
