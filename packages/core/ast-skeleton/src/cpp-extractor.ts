import type { SkeletonResult } from './ts-extractor.js';
import type { LanguageExtractor } from './extractor-registry.js';

export class CppSkeletonExtractor implements LanguageExtractor {
  public readonly languageId = 'cpp';
  public readonly supportedExtensions = ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx'];

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

      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
        i++;
        continue;
      }

      i = this.handleDeclaration(lines, i, line, trimmed, output);
    }

    return output;
  }

  private isPreprocessorOrNamespace(trimmed: string): boolean {
    return (
      trimmed.startsWith('#') ||
      trimmed.startsWith('namespace ') ||
      trimmed.startsWith('using ') ||
      trimmed.startsWith('typedef ')
    );
  }

  private isTypeDeclaration(trimmed: string): boolean {
    if (trimmed.startsWith('template')) {
      return trimmed.includes('class ') || trimmed.includes('struct ') || !trimmed.includes('(');
    }
    const prefixes = ['class ', 'struct ', 'enum ', 'union '];
    return prefixes.some(p => trimmed.startsWith(p));
  }

  private isFunctionDefinition(trimmed: string, line: string): boolean {
    if (trimmed.endsWith(';')) return false;
    return (line.includes('(') && (line.includes(')') || line.includes('{')));
  }

  private consumeUntilBrace(lines: string[], startIndex: number): string {
    const parts: string[] = [];
    let i = startIndex;
    while (i < lines.length) {
      const line = lines[i];
      if (line.includes('{')) {
        parts.push(line.substring(0, line.indexOf('{')).trimEnd());
        break;
      }
      parts.push(line);
      i++;
    }
    return parts.join('\n');
  }

  private skipString(chars: string, j: number): number {
    const q = chars[j++];
    while (j < chars.length && chars[j] !== q) {
      if (chars[j] === '\\') j += 2;
      else j++;
    }
    return j + 1;
  }

  private skipBlock(lines: string[], startIndex: number): number {
    let braceCount = 0;
    let foundOpen = false;
    let inComment = false;
    let i = startIndex;

    while (i < lines.length) {
      const s = lines[i];
      let j = 0;
      while (j < s.length) {
        if (inComment) {
          if (s[j] === '*' && s[j + 1] === '/') { inComment = false; j += 2; }
          else j++;
          continue;
        }
        if (s[j] === '/' && s[j + 1] === '/') break;
        if (s[j] === '/' && s[j + 1] === '*') { inComment = true; j += 2; continue; }
        if (s[j] === '"' || s[j] === "'") { j = this.skipString(s, j); continue; }
        if (s[j] === '{') { braceCount++; foundOpen = true; }
        else if (s[j] === '}') braceCount--;
        j++;
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
    if (this.isPreprocessorOrNamespace(trimmed)) {
      output.push(line);
      return i + 1;
    }

    if (this.isTypeDeclaration(trimmed)) {
      output.push(line);
      return i + 1;
    }

    if (this.isFunctionDefinition(trimmed, line)) {
      const signature = this.consumeUntilBrace(lines, i);
      output.push(`${signature} { /* body omitted */ }`);
      return this.skipBlock(lines, i);
    }

    output.push(line);
    return i + 1;
  }
}
