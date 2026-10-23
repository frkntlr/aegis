import type { SkeletonResult } from './ts-extractor.js';
import type { LanguageExtractor } from './extractor-registry.js';

export class RustSkeletonExtractor implements LanguageExtractor {
  public readonly languageId = 'rust';
  public readonly supportedExtensions = ['.rs'];

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
    const pendingAttributes: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('//')) {
        i++;
        continue;
      }

      if (trimmed.startsWith('#[')) {
        pendingAttributes.push(line);
        i++;
        continue;
      }

      i = this.handleDeclaration(lines, i, line, trimmed, pendingAttributes, output);
    }

    return output;
  }

  private isItemDeclaration(trimmed: string): boolean {
    const prefixes = ['use ', 'pub use ', 'mod ', 'pub mod ', 'type ', 'pub type ', 'const ', 'pub const '];
    return prefixes.some(p => trimmed.startsWith(p));
  }

  private isTypeDefOrImpl(trimmed: string): boolean {
    const prefixes = ['struct ', 'pub struct ', 'enum ', 'pub enum ', 'trait ', 'pub trait ', 'impl ', 'pub impl '];
    return prefixes.some(p => trimmed.startsWith(p));
  }

  private handleDeclaration(
    lines: string[],
    i: number,
    line: string,
    trimmed: string,
    pendingAttributes: string[],
    output: string[]
  ): number {
    if (this.isFunctionStart(trimmed)) {
      this.flushAttributes(pendingAttributes, output);
      const signature = this.consumeUntilBrace(lines, i);
      output.push(`${signature} { /* body omitted */ }`);
      return this.skipBlock(lines, i);
    }

    if (this.isItemDeclaration(trimmed) || this.isTypeDefOrImpl(trimmed)) {
      this.flushAttributes(pendingAttributes, output);
      output.push(line);
      return i + 1;
    }

    pendingAttributes.length = 0;
    return i + 1;
  }

  private isFunctionStart(trimmed: string): boolean {
    return (
      trimmed.startsWith('fn ') ||
      trimmed.startsWith('pub fn ') ||
      trimmed.startsWith('pub(crate) fn ') ||
      trimmed.startsWith('async fn ') ||
      trimmed.startsWith('pub async fn ')
    );
  }

  private flushAttributes(pending: string[], output: string[]): void {
    if (pending.length > 0) {
      output.push(...pending);
      pending.length = 0;
    }
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
          if (s[j] === '"' && s[j + 1] === '#') { inRaw = false; j += 2; }
          else j++;
          continue;
        }
        if (s[j] === '/' && s[j + 1] === '/') break;
        if (s[j] === '/' && s[j + 1] === '*') { inComment = true; j += 2; continue; }
        if (s[j] === 'r' && s[j + 1] === '#' && s[j + 2] === '"') { inRaw = true; j += 3; continue; }
        if (s[j] === '"') { j = this.skipString(s, j); continue; }
        if (s[j] === "'" && s[j + 2] === "'") { j += 3; continue; }
        if (s[j] === "'" && s[j + 1] === '\\' && s[j + 3] === "'") { j += 4; continue; }
        if (s[j] === '{') { braceCount++; foundOpen = true; }
        else if (s[j] === '}') braceCount--;
        j++;
      }
      if (foundOpen && braceCount <= 0) return i + 1;
      i++;
    }
    return i + 1;
  }
}
