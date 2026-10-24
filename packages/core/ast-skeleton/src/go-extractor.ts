import type { SkeletonResult } from './ts-extractor.js';
import type { LanguageExtractor } from './extractor-registry.js';

export class GoSkeletonExtractor implements LanguageExtractor {
  public readonly languageId = 'go';
  public readonly supportedExtensions = ['.go'];

  public extract(_filePath: string, sourceCode: string): SkeletonResult {
    const sanitized = this.maskMultiLineTokens(sourceCode);
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

  private maskMultiLineTokens(sourceCode: string): string {
    return sourceCode
      .replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\r\n]/g, ' '))
      .replace(/`[\s\S]*?`/g, match => (match.includes('\n') ? match.replace(/[^\r\n]/g, ' ') : match));
  }

  private processLines(lines: string[]): string[] {
    const output: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('//')) {
        i++;
        continue;
      }

      i = this.handleDeclaration(lines, i, line, trimmed, output);
    }

    return output;
  }

  private isFunctionStart(trimmed: string): boolean {
    return trimmed.startsWith('func ') || trimmed.startsWith('func(');
  }

  private isTypeDeclaration(trimmed: string): boolean {
    return trimmed.startsWith('type ') || trimmed.startsWith('package ') || trimmed.startsWith('import ') || trimmed.startsWith('var ') || trimmed.startsWith('const ');
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
    let inRaw = false;
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
        if (inRaw) {
          if (s[j++] === '`') inRaw = false;
          continue;
        }
        if (s[j] === '/' && s[j + 1] === '/') break;
        if (s[j] === '/' && s[j + 1] === '*') { inComment = true; j += 2; continue; }
        if (s[j] === '`') { inRaw = true; j++; continue; }
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

  private handleCompositeType(
    lines: string[],
    i: number,
    line: string,
    trimmed: string,
    output: string[]
  ): number {
    if (trimmed.includes('{') && trimmed.includes('}')) {
      output.push(line);
      return i + 1;
    }
    const header = this.consumeUntilBrace(lines, i);
    const members: string[] = [];
    let j = i + 1;
    let depth = 1;
    while (j < lines.length && depth > 0) {
      const raw = lines[j];
      for (const ch of raw) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      if (depth === 0) break;
      const memberTrimmed = raw.trim();
      if (memberTrimmed && !memberTrimmed.startsWith('//')) {
        members.push(`\t${memberTrimmed}`);
      }
      j++;
    }
    output.push(`${header} {\n${members.join('\n')}\n}`);
    return j + 1;
  }

  private handleDeclaration(
    lines: string[],
    i: number,
    line: string,
    trimmed: string,
    output: string[]
  ): number {
    if (this.isFunctionStart(trimmed)) {
      const signature = this.consumeUntilBrace(lines, i);
      output.push(`${signature} { /* body omitted */ }`);
      return this.skipBlock(lines, i);
    }

    if (this.isTypeDeclaration(trimmed)) {
      if (trimmed.includes('struct') || trimmed.includes('interface')) {
        return this.handleCompositeType(lines, i, line, trimmed, output);
      }
      output.push(line);
      return i + 1;
    }

    output.push(line);
    return i + 1;
  }
}
