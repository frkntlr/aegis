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
