export interface TokenKillerOptions {
  preserveUserFramesOnly?: boolean;
  collapsePassedTests?: boolean;
  filterCompilerNoise?: boolean;
  maxLineLength?: number;
}

export interface TokenKillerResult {
  compressedText: string;
  originalLines: number;
  compressedLines: number;
  originalTokensEst: number;
  compressedTokensEst: number;
  tokenSavingsPercent: number;
  passCount: number;
  failCount: number;
  errorCount: number;
}

interface LineProcessState {
  filtered: string[];
  passCount: number;
  failCount: number;
  errorCount: number;
  collapsePass: boolean;
  pruneFrames: boolean;
  filterNoise: boolean;
  maxLen: number;
}

export class RTKTokenKiller {
  public static stripAnsi(text: string): string {
    return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
  }

  private static isInternalStackFrame(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed.startsWith('at ')) return false;
    const internalPatterns = [
      'at node:internal',
      'at Module.',
      'at async Module.',
      'at runInAsyncScope',
      'at processTicksAndRejections',
      'at Test.run',
      'at Test.start',
      'at Test.postRun',
      'at startSubtestAfterBootstrap',
      'at node:async_hooks',
      'at node_modules'
    ];
    return internalPatterns.some(p => trimmed.includes(p));
  }

  private static isProgressNoise(line: string): boolean {
    const trimmed = line.trim();
    const noisePrefixes = [
      '• Packages in scope:',
      '• Running build in',
      '• Running test in',
      '• Remote caching disabled',
      'cache hit, replaying logs',
      'cache miss, executing',
      'Tasks: ',
      '> tsc',
      '> node --version'
    ];
    return noisePrefixes.some(p => trimmed.includes(p));
  }

  private static createLineState(options: TokenKillerOptions): LineProcessState {
    return {
      filtered: [],
      passCount: 0,
      failCount: 0,
      errorCount: 0,
      collapsePass: options.collapsePassedTests ?? true,
      pruneFrames: options.preserveUserFramesOnly ?? true,
      filterNoise: options.filterCompilerNoise ?? true,
      maxLen: options.maxLineLength ?? 200
    };
  }

  private static shouldSkipLine(line: string, state: LineProcessState): boolean {
    if (state.pruneFrames && RTKTokenKiller.isInternalStackFrame(line)) return true;
    return state.filterNoise && RTKTokenKiller.isProgressNoise(line);
  }

  private static processNonEmptyLine(line: string, trimmed: string, state: LineProcessState): void {
    if (RTKTokenKiller.shouldSkipLine(line, state)) return;
    if (/^[✔√]\s+|:\s+[✔√]\s+/.test(trimmed)) {
      state.passCount++;
      if (!state.collapsePass) state.filtered.push(line);
      return;
    }
    if (/^[✖x]\s+|:\s+[✖x]\s+|AssertionError|FAILED|ERROR:/.test(trimmed)) {
      state.failCount++;
    } else if (/\berror\s+TS\d+:|\bERROR\b/i.test(trimmed)) {
      state.errorCount++;
    }
    state.filtered.push(line.length > state.maxLen ? line.slice(0, state.maxLen) + '…' : line);
  }

  private static processLines(rawLines: string[], options: TokenKillerOptions) {
    const state = RTKTokenKiller.createLineState(options);
    for (const line of rawLines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (state.filtered.length > 0 && state.filtered[state.filtered.length - 1] !== '') state.filtered.push('');
        continue;
      }
      RTKTokenKiller.processNonEmptyLine(line, trimmed, state);
    }
    if (state.collapsePass && state.passCount > 0) {
      state.filtered.unshift(`[RTK Summary] ✔ ${state.passCount} passing test(s) collapsed cleanly.`);
    }
    return { filtered: state.filtered, passCount: state.passCount, failCount: state.failCount, errorCount: state.errorCount };
  }

  public static compress(raw: string, options: TokenKillerOptions = {}): TokenKillerResult {
    const clean = RTKTokenKiller.stripAnsi(raw);
    const rawLines = clean.split(/\r?\n/);
    const originalLines = rawLines.length;
    const originalTokensEst = Math.max(1, Math.round(clean.length / 4));

    const { filtered, passCount, failCount, errorCount } = RTKTokenKiller.processLines(rawLines, options);
    const compressedText = filtered.join('\n').trim();
    const compressedLines = filtered.length;
    const compressedTokensEst = Math.max(1, Math.round(compressedText.length / 4));
    const tokenSavingsPercent = Math.max(0, Math.round((1 - compressedTokensEst / originalTokensEst) * 100));

    return {
      compressedText,
      originalLines,
      compressedLines,
      originalTokensEst,
      compressedTokensEst,
      tokenSavingsPercent,
      passCount,
      failCount,
      errorCount
    };
  }

  public static formatSummary(result: TokenKillerResult): string {
    return [
      `🛡️ RTK Token Compression:`,
      ` • Original Lines:    ${result.originalLines} (~${result.originalTokensEst} tokens)`,
      ` • Compressed Lines:  ${result.compressedLines} (~${result.compressedTokensEst} tokens)`,
      ` • Token Savings:     ${result.tokenSavingsPercent}% 🔥`,
      ` • Tests / Errors:    ${result.passCount} pass, ${result.failCount} fail, ${result.errorCount} compiler error(s)`
    ].join('\n');
  }
}
