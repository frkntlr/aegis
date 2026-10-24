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

export class RTKTokenKiller {
  public static stripAnsi(text: string): string {
    // eslint-disable-next-line no-control-regex
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

  private static processLines(rawLines: string[], options: TokenKillerOptions) {
    const collapsePass = options.collapsePassedTests ?? true;
    const pruneFrames = options.preserveUserFramesOnly ?? true;
    const filterNoise = options.filterCompilerNoise ?? true;
    const filtered: string[] = [];
    let passCount = 0;
    let failCount = 0;
    let errorCount = 0;

    for (const line of rawLines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (filtered.length > 0 && filtered[filtered.length - 1] !== '') filtered.push('');
        continue;
      }
      if (pruneFrames && RTKTokenKiller.isInternalStackFrame(line)) continue;
      if (filterNoise && RTKTokenKiller.isProgressNoise(line)) continue;
      if (/^[✔√]\s+|:\s+[✔√]\s+/.test(trimmed)) {
        passCount++;
        if (!collapsePass) filtered.push(line);
        continue;
      }
      if (/^[✖x]\s+|:\s+[✖x]\s+|AssertionError|FAILED|ERROR:/.test(trimmed)) {
        failCount++;
      } else if (/\berror\s+TS\d+:|\bERROR\b/i.test(trimmed)) {
        errorCount++;
      }
      const maxLen = options.maxLineLength ?? 200;
      filtered.push(line.length > maxLen ? line.slice(0, maxLen) + '…' : line);
    }

    if (collapsePass && passCount > 0) {
      filtered.unshift(`[RTK Summary] ✔ ${passCount} passing test(s) collapsed cleanly.`);
    }
    return { filtered, passCount, failCount, errorCount };
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
