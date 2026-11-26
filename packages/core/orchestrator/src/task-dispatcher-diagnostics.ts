export type SocraticDiagnosticCategory = 'syntax' | 'runtime' | 'test failure' | 'timeout';

export interface SocraticDiagnosis {
  hint: string;
  category: SocraticDiagnosticCategory;
  location?: string;
  headline: string;
}

function isTimeoutError(lower: string): boolean {
  return (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('time out') ||
    lower.includes('etimedout') ||
    lower.includes('deadline exceeded')
  );
}

function isSyntaxError(lower: string): boolean {
  return (
    lower.includes('syntaxerror') ||
    lower.includes('unexpected token') ||
    lower.includes('parse error') ||
    lower.includes('cannot find name') ||
    /ts\d{4,5}:/.test(lower) ||
    lower.includes('compile error')
  );
}

function isRuntimeError(lower: string): boolean {
  return (
    lower.includes('typeerror') ||
    lower.includes('referenceerror') ||
    lower.includes('rangeerror') ||
    lower.includes('cannot read propert') ||
    lower.includes('is not a function') ||
    lower.includes('null pointer') ||
    lower.includes('unhandled rejection') ||
    lower.includes('uncaught exception') ||
    lower.includes('panic:') ||
    lower.includes('sigsegv') ||
    lower.includes('script error:')
  );
}

function isTestFailure(lower: string, original: string): boolean {
  return (
    lower.includes('assert') ||
    lower.includes('expect(') ||
    lower.includes('test failed') ||
    lower.includes('tests failed') ||
    lower.includes('test error') ||
    /\bfail(?:\s+\d+|\b)/i.test(original)
  );
}

export function categorizeError(error: string): SocraticDiagnosticCategory {
  const lower = error.toLowerCase();
  if (isTimeoutError(lower)) return 'timeout';
  if (isSyntaxError(lower)) return 'syntax';
  if (isRuntimeError(lower)) return 'runtime';
  if (isTestFailure(lower, error)) return 'test failure';
  return 'runtime';
}

function extractLocation(error: string): string | null {
  const v8 = error.match(
    /(?:^|\s+)at\s+(?:([a-zA-Z0-9_$.<>]+)\s+\()?(?:file:\/\/\/)?([a-zA-Z]:[\\/][^()]+|[a-zA-Z0-9_./\\-]+):(\d+):(\d+)\)?/,
  );
  if (v8) {
    const sym = v8[1] ? ` in ${v8[1].trim()}` : '';
    return `${v8[2].replace(/\\/g, '/')}:${v8[3]}:${v8[4]}${sym}`;
  }
  const godot = error.match(/At:\s+(res:\/\/[^:\s]+):(\d+)(?::([a-zA-Z0-9_]+))?/);
  if (godot) {
    const fn = godot[3] ? ` in ${godot[3]}` : '';
    return `${godot[1].replace(/^res:\/\//, '')}:${godot[2]}${fn}`;
  }
  const posix = error.match(
    /(?:^|\s)((?:[a-zA-Z]:[\\/][^\s:]+|[a-zA-Z0-9_./\\-]+)\.(?:ts|tsx|js|jsx|gd|py|rs|cs|cpp|c|h|go)):(\d+)(?::(\d+))?/,
  );
  if (posix) {
    const col = posix[3] ? `:${posix[3]}` : '';
    return `${posix[1].replace(/\\/g, '/')}:${posix[2]}${col}`;
  }
  return null;
}

function extractHeadline(error: string): string {
  const cleaned = error.replace(/\u001b\[[0-9;]*m/g, '').replace(/\r\n/g, '\n');
  const line =
    cleaned
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? error.trim();
  return line.length > 120 ? `${line.slice(0, 117)}...` : line;
}

export function formatSocraticDiagnosis(error: string): SocraticDiagnosis | null {
  if (!error || !error.trim()) return null;
  const category = categorizeError(error);
  const headline = extractHeadline(error);
  const location = extractLocation(error) ?? undefined;
  const locSuffix = location && !headline.includes(location) ? ` at ${location}` : '';
  const hint = `[Socratic Diagnosis] (${category}): ${headline}${locSuffix}`;
  return { hint, category, location, headline };
}
