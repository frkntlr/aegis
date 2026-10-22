import type { SkeletonResult } from './ts-extractor.js';
import type { LanguageExtractor } from './extractor-registry.js';

export class PythonSkeletonExtractor implements LanguageExtractor {
  public readonly languageId = 'python';
  public readonly supportedExtensions = ['.py'];

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
    const pendingDecorators: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) {
        i++;
        continue;
      }

      if (trimmed.startsWith('@')) {
        pendingDecorators.push(line);
        i++;
        continue;
      }

      i = this.handleDeclaration(lines, i, line, trimmed, pendingDecorators, output);
    }

    return output;
  }

  private handleDeclaration(
    lines: string[],
    i: number,
    line: string,
    trimmed: string,
    pendingDecorators: string[],
    output: string[]
  ): number {
    if (trimmed.startsWith('def ') || trimmed.startsWith('async def ')) {
      this.flushDecorators(pendingDecorators, output);
      const defLine = this.consumeUntilColon(lines, i);
      const indent = line.match(/^\s*/)?.[0] ?? '';
      output.push(defLine);
      output.push(`${indent}    ...`);
      return this.skipBlock(lines, i);
    }

    if (trimmed.startsWith('class ')) {
      this.flushDecorators(pendingDecorators, output);
      output.push(this.consumeUntilColon(lines, i));
      return i + 1;
    }

    if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) {
      this.flushDecorators(pendingDecorators, output);
      output.push(line);
      return i + 1;
    }

    if (trimmed.includes('=') && !trimmed.startsWith('self.')) {
      this.flushDecorators(pendingDecorators, output);
      output.push(line);
      return i + 1;
    }

    pendingDecorators.length = 0;
    return i + 1;
  }

  private flushDecorators(pending: string[], output: string[]): void {
    if (pending.length > 0) {
      output.push(...pending);
      pending.length = 0;
    }
  }

  private consumeUntilColon(lines: string[], startIndex: number): string {
    const parts: string[] = [];
    let i = startIndex;
    while (i < lines.length) {
      parts.push(lines[i]);
      if (lines[i].includes(':')) break;
      i++;
    }
    return parts.join('\n');
  }

  private skipBlock(lines: string[], startIndex: number): number {
    const baseIndent = lines[startIndex].match(/^\s*/)?.[0].length ?? 0;
    let i = startIndex + 1;

    // consume multi-line signature
    while (i < lines.length && !lines[i - 1].includes(':')) {
      i++;
    }

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        i++;
        continue;
      }
      const indent = line.match(/^\s*/)?.[0].length ?? 0;
      if (indent <= baseIndent) {
        break;
      }
      i++;
    }

    return i;
  }
}
