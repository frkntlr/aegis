import * as path from 'node:path';
import type { SkeletonResult } from './ts-extractor.js';

export interface LanguageExtractor {
  readonly languageId: string;
  readonly supportedExtensions: string[];
  extract(relativePath: string, content: string): SkeletonResult;
}

export class ExtractorRegistry {
  private extractorsByExt: Map<string, LanguageExtractor> = new Map();
  private extractorsById: Map<string, LanguageExtractor> = new Map();

  public register(extractor: LanguageExtractor): void {
    this.extractorsById.set(extractor.languageId, extractor);
    for (const ext of extractor.supportedExtensions) {
      const normalized = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
      this.extractorsByExt.set(normalized, extractor);
    }
  }

  public getExtractor(filePath: string): LanguageExtractor | undefined {
    const ext = path.extname(filePath).toLowerCase();
    return this.extractorsByExt.get(ext);
  }

  public getExtractorById(languageId: string): LanguageExtractor | undefined {
    return this.extractorsById.get(languageId);
  }

  public listLanguages(): string[] {
    return Array.from(this.extractorsById.keys());
  }

  public getSupportedExtensions(): string[] {
    return Array.from(this.extractorsByExt.keys());
  }
}
