export interface SymbolEntry {
  name: string;
  kind: 'class' | 'function' | 'method' | 'signal' | 'interface' | 'variable' | 'type';
  filePath: string;
  startLine: number;
  endLine: number;
  signature: string;
  docstring?: string;
}

export function findIndentBlockEnd(
  lines: string[],
  startIdx: number,
  commentPrefixes: string[] = ['#']
): number {
  const baseIndent = (lines[startIdx].match(/^[\t\s]*/)?.[0] || '').length;
  for (let j = startIdx + 1; j < lines.length; j++) {
    const trimmed = lines[j].trim();
    if (!trimmed || commentPrefixes.some(p => trimmed.startsWith(p))) continue;
    const indent = (lines[j].match(/^[\t\s]*/)?.[0] || '').length;
    if (indent <= baseIndent) return j;
  }
  return lines.length;
}
