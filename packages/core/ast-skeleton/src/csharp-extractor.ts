import type { SkeletonResult } from './ts-extractor.js';
import type { LanguageExtractor } from './extractor-registry.js';

export class CSharpSkeletonExtractor implements LanguageExtractor {
  public readonly languageId = 'csharp';
  public readonly supportedExtensions = ['.cs'];

  public extract(_filePath: string, sourceCode: string): SkeletonResult {
    const sanitized = this.maskCommentsAndStrings(sourceCode);
    const lines = sanitized.split(/\r?\n/);
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

  private maskCommentsAndStrings(sourceCode: string): string {
    return sourceCode
      .replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\r\n]/g, ' '))
      .replace(/@"(?:[^"]|"")*"/g, match => match.replace(/[^\r\n]/g, ' '));
  }

  private processLines(lines: string[]): string[] {
    const output: string[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
        i++;
        continue;
      }
      i = this.handleDeclaration(lines, i, line, trimmed, output);
    }
    return output;
  }

  private isDirectiveOrNamespace(trimmed: string): boolean {
    return (
      trimmed.startsWith('#') ||
      trimmed.startsWith('using ') ||
      trimmed.startsWith('global using ') ||
      trimmed.startsWith('namespace ')
    );
  }

  private isTypeDeclaration(trimmed: string): boolean {
    const typeKeywords = ['class ', 'struct ', 'interface ', 'record ', 'enum '];
    return typeKeywords.some(kw => trimmed.includes(kw));
  }

  private isMethodDefinition(trimmed: string, line: string): boolean {
    if (trimmed.endsWith(';') || trimmed.startsWith('[')) return false;
    return line.includes('(') && (line.includes(')') || line.includes('{'));
  }

  private consumeUntilBrace(lines: string[], startIndex: number): string {
    const parts: string[] = [];
    let i = startIndex;
    while (i < lines.length) {
      const line = lines[i];
      if (line.includes('{')) {
        const before = line.substring(0, line.indexOf('{')).trim();
        if (before) parts.push(before);
        break;
      }
      if (line.trim()) parts.push(line.trim());
      i++;
    }
    return parts.join(' ');
  }

  private skipBlock(lines: string[], startIndex: number): number {
    let braceCount = 0;
    let foundOpen = false;
    let i = startIndex;

    while (i < lines.length) {
      const s = lines[i];
      for (let j = 0; j < s.length; j++) {
        if (s[j] === '/' && s[j + 1] === '/') break;
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

  private handleDeclaration(
    lines: string[],
    i: number,
    line: string,
    trimmed: string,
    output: string[]
  ): number {
    if (this.isDirectiveOrNamespace(trimmed)) {
      output.push(line);
      return i + 1;
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      output.push(line);
      return i + 1;
    }

    if (this.isTypeDeclaration(trimmed)) {
      output.push(line);
      return i + 1;
    }

    if (this.isMethodDefinition(trimmed, line)) {
      const signature = this.consumeUntilBrace(lines, i);
      output.push(`${signature} { /* body omitted */ }`);
      return this.skipBlock(lines, i);
    }

    output.push(line);
    return i + 1;
  }
}
