import type { SkeletonResult } from './ts-extractor.js';
import type { LanguageExtractor } from './extractor-registry.js';

export class BashSkeletonExtractor implements LanguageExtractor {
  public readonly languageId = 'bash';
  public readonly supportedExtensions = ['.sh', '.bash'];

  public extract(_filePath: string, sourceCode: string): SkeletonResult {
    const lines = sourceCode.split(/\r?\n/);
    const skeletonLines = this.processLines(lines);
    const skeletonContent = skeletonLines.join('\n');
    const originalLength = sourceCode.length;
    const skeletonLength = skeletonContent.length;
    const savings = originalLength > 0 ? ((originalLength - skeletonLength) / originalLength) * 100 : 0;

    return {
      originalLength,
      skeletonLength,
      tokenSavingsPercent: Math.max(0, Math.round(savings)),
      skeletonContent
    };
  }

  private processLines(lines: string[]): string[] {
    const output: string[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (i === 0 && line.startsWith('#!')) {
        output.push(line);
        i++;
        continue;
      }

      if (!trimmed || trimmed.startsWith('#')) {
        i++;
        continue;
      }

      i = this.handleLine(lines, i, line, trimmed, output);
    }
    return output;
  }

  private isFunctionDeclaration(trimmed: string): boolean {
    return (
      /^function\s+[a-zA-Z_0-9\-]+\s*(\(\))?/.test(trimmed) ||
      /^[a-zA-Z_0-9\-]+\s*\(\)\s*\{?/.test(trimmed)
    );
  }

  private skipBlock(lines: string[], startIndex: number): number {
    let braceCount = 0;
    let foundOpen = false;
    let i = startIndex;

    while (i < lines.length) {
      const s = lines[i];
      for (let j = 0; j < s.length; j++) {
        if (s[j] === '#') break;
        if (s[j] === '{') {
          braceCount++;
          foundOpen = true;
        } else if (s[j] === '}') {
          braceCount--;
        }
      }
      if (foundOpen && braceCount <= 0) return i + 1;
      i++;
    }
    return i + 1;
  }

  private handleLine(
    lines: string[],
    i: number,
    line: string,
    trimmed: string,
    output: string[]
  ): number {
    if (trimmed.startsWith('export ') || trimmed.startsWith('readonly ') || trimmed.startsWith('set ')) {
      output.push(line);
      return i + 1;
    }

    if (this.isFunctionDeclaration(trimmed)) {
      const rawSig = trimmed.replace(/\{.*$/, '').trim();
      const cleanSig = rawSig.replace(/\s*\(\s*\)$/, '').trim();
      output.push(`${cleanSig}() { /* body omitted */ }`);
      return this.skipBlock(lines, i);
    }

    return i + 1;
  }
}
