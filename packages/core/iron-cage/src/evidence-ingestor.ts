import * as fs from 'node:fs';
import * as path from 'node:path';

export interface EvidenceIngestOptions {
  testsPath?: string;
  godotLogPath?: string;
  cwd?: string;
}

export interface IngestedTestEvidence {
  testFailures: string[];
  failingCount: number;
  sourcePath?: string;
}

export interface IngestedEngineEvidence {
  engineErrors: string[];
  sourcePath?: string;
}

export interface IngestedEvidence {
  testFailures: string[];
  engineErrors: string[];
  failingTestsCount: number;
  sources: string[];
}

export class EvidenceIngestor {
  private static readonly TEST_CANDIDATES = [
    'last-test-run.json',
    '.aegis/cache/last-test-run.json',
    'test-results.json'
  ];

  private static readonly GODOT_CANDIDATES = [
    'godot_debug.log',
    'logs/godot.log',
    '.aegis/logs/godot_debug.log'
  ];

  public static ingest(options: EvidenceIngestOptions = {}): IngestedEvidence {
    const cwd = options.cwd ?? process.cwd();
    const sources: string[] = [];
    let testFailures: string[] = [];
    let failingCount = 0;
    let engineErrors: string[] = [];

    if (options.testsPath !== undefined) {
      const tRes = this.ingestTestResults(options.testsPath, cwd);
      testFailures = tRes.testFailures;
      failingCount = tRes.failingCount;
      if (tRes.sourcePath) sources.push(tRes.sourcePath);
    }

    if (options.godotLogPath !== undefined) {
      const gRes = this.ingestGodotLogs(options.godotLogPath, cwd);
      engineErrors = gRes.engineErrors;
      if (gRes.sourcePath) sources.push(gRes.sourcePath);
    }

    return {
      testFailures,
      engineErrors,
      failingTestsCount: failingCount,
      sources
    };
  }

  public static ingestTestResults(customPath?: string, cwd = process.cwd()): IngestedTestEvidence {
    const resolvedPath = this.resolveFilePath(customPath, this.TEST_CANDIDATES, cwd);
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      return { testFailures: [], failingCount: 0 };
    }

    try {
      const raw = fs.readFileSync(resolvedPath, 'utf8').trim();
      if (!raw) return { testFailures: [], failingCount: 0, sourcePath: resolvedPath };

      if (raw.startsWith('{') || raw.startsWith('[')) {
        return this.parseJsonTestResults(raw, resolvedPath);
      }
      return this.parseTextTestResults(raw, resolvedPath);
    } catch {
      return { testFailures: [], failingCount: 0, sourcePath: resolvedPath };
    }
  }

  public static ingestGodotLogs(customPath?: string, cwd = process.cwd()): IngestedEngineEvidence {
    const resolvedPath = this.resolveFilePath(customPath, this.GODOT_CANDIDATES, cwd);
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      return { engineErrors: [] };
    }

    try {
      const raw = fs.readFileSync(resolvedPath, 'utf8');
      const engineErrors = this.parseGodotLogContent(raw);
      return { engineErrors, sourcePath: resolvedPath };
    } catch {
      return { engineErrors: [], sourcePath: resolvedPath };
    }
  }

  private static resolveFilePath(custom: string | undefined, defaults: string[], cwd: string): string | undefined {
    if (custom && custom.trim() !== '') {
      return path.isAbsolute(custom) ? custom : path.resolve(cwd, custom);
    }
    for (const rel of defaults) {
      const candidate = path.resolve(cwd, rel);
      if (fs.existsSync(candidate)) return candidate;
    }
    return undefined;
  }

  private static parseJsonTestResults(content: string, sourcePath: string): IngestedTestEvidence {
    try {
      const data = JSON.parse(content) as Record<string, unknown>;
      const failures: string[] = [];
      let count = 0;

      if (typeof data.numFailedTests === 'number') {
        count = data.numFailedTests;
      }

      this.extractFailuresFromJson(data, failures);
      if (count === 0 && failures.length > 0) count = failures.length;

      return { testFailures: failures, failingCount: count, sourcePath };
    } catch {
      return this.parseTextTestResults(content, sourcePath);
    }
  }

  private static extractFailuresFromJson(data: Record<string, unknown>, out: string[]): void {
    if (Array.isArray(data.testResults)) {
      for (const item of data.testResults) {
        if (typeof item === 'object' && item !== null) {
          this.extractFromTestResultItem(item as Record<string, unknown>, out);
        }
      }
    }
    if (Array.isArray(data.failures)) {
      for (const fail of data.failures) {
        if (typeof fail === 'string') out.push(fail);
        else if (typeof fail === 'object' && fail !== null) {
          out.push(JSON.stringify(fail));
        }
      }
    }
  }

  private static extractFromTestResultItem(item: Record<string, unknown>, out: string[]): void {
    const filePath = typeof item.name === 'string' ? item.name : '';
    if (Array.isArray(item.assertionResults)) {
      for (const ass of item.assertionResults) {
        if (typeof ass === 'object' && ass !== null) {
          const assObj = ass as Record<string, unknown>;
          if (assObj.status === 'failed') {
            const title = typeof assObj.title === 'string' ? assObj.title : 'Assertion Failed';
            const msgs = Array.isArray(assObj.failureMessages) ? assObj.failureMessages.join('\n') : '';
            out.push(`${filePath ? filePath + ': ' : ''}${title}\n${msgs}`.trim());
          }
        }
      }
    } else if (typeof item.message === 'string' && item.message) {
      out.push(item.message);
    }
  }

  private static parseTextTestResults(content: string, sourcePath: string): IngestedTestEvidence {
    const lines = content.split('\n');
    const failures: string[] = [];
    let currentBlock: string[] = [];
    let currentSuite = '';

    for (const line of lines) {
      if (/^FAIL\s+(.*)/i.test(line)) {
        currentSuite = line.trim();
      } else if (/^(?:\s*●|\s*✕|FAIL:)\s+/i.test(line)) {
        if (currentBlock.length > 0) failures.push(currentBlock.join('\n').trim());
        currentBlock = currentSuite ? [currentSuite, line] : [line];
      } else if (currentBlock.length > 0) {
        if (currentBlock.length < 25) currentBlock.push(line);
      }
    }
    if (currentBlock.length > 0) failures.push(currentBlock.join('\n').trim());
    if (failures.length === 0 && currentSuite) failures.push(currentSuite);

    return {
      testFailures: failures,
      failingCount: failures.length,
      sourcePath
    };
  }

  private static parseGodotLogContent(content: string): string[] {
    const lines = content.split('\n');
    const errors: string[] = [];
    let currentError: string[] = [];

    const isHeader = (line: string): boolean =>
      /^(?:ERROR|SCRIPT ERROR|CRASH|FATAL|USER ERROR):|Assertion failed|Condition "!.*" is true/i.test(line.trim());

    for (const line of lines) {
      if (isHeader(line)) {
        if (currentError.length > 0) errors.push(currentError.join('\n').trim());
        currentError = [line.trim()];
      } else if (currentError.length > 0) {
        if (/^\s*(?:at:|res:\/\/|<stack:)/i.test(line) && currentError.length < 10) {
          currentError.push(line.trim());
        } else {
          errors.push(currentError.join('\n').trim());
          currentError = [];
        }
      }
    }
    if (currentError.length > 0) errors.push(currentError.join('\n').trim());

    return errors;
  }
}
