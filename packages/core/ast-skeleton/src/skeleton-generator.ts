import * as fs from 'node:fs';
import * as path from 'node:path';
import { ExtractorRegistry, type LanguageExtractor } from './extractor-registry.js';
import { TypeScriptSkeletonExtractor, type SkeletonResult } from './ts-extractor.js';
import { PythonSkeletonExtractor } from './python-extractor.js';
import { GDScriptSkeletonExtractor } from './gdscript-extractor.js';
import { TscnSkeletonExtractor } from './tscn-extractor.js';
import { RustSkeletonExtractor } from './rust-extractor.js';
import { GoSkeletonExtractor } from './go-extractor.js';
import { CppSkeletonExtractor } from './cpp-extractor.js';

export interface ProjectSkeletonMap {
  filesScanned: number;
  totalOriginalBytes: number;
  totalSkeletonBytes: number;
  overallSavingsPercent: number;
  entries: Map<string, SkeletonResult>;
  combinedMap: string;
}

export class SkeletonGenerator {
  private registry: ExtractorRegistry;

  constructor(customRegistry?: ExtractorRegistry) {
    if (customRegistry) {
      this.registry = customRegistry;
    } else {
      this.registry = new ExtractorRegistry();
      this.registry.register(new TypeScriptSkeletonExtractor());
      this.registry.register(new PythonSkeletonExtractor());
      this.registry.register(new GDScriptSkeletonExtractor());
      this.registry.register(new TscnSkeletonExtractor());
      this.registry.register(new RustSkeletonExtractor());
      this.registry.register(new GoSkeletonExtractor());
      this.registry.register(new CppSkeletonExtractor());
    }
  }

  public registerExtractor(extractor: LanguageExtractor): void {
    this.registry.register(extractor);
  }

  public getRegistry(): ExtractorRegistry {
    return this.registry;
  }

  public extractFile(relativePath: string, content: string): SkeletonResult {
    const extractor = this.registry.getExtractor(relativePath);
    if (extractor) {
      return extractor.extract(relativePath, content);
    }

    return {
      originalLength: content.length,
      skeletonLength: content.length,
      tokenSavingsPercent: 0,
      skeletonContent: `// Non-parsed file: ${relativePath} (${content.split('\n').length} lines)`
    };
  }

  public generateForFiles(filePaths: string[], baseDir = process.cwd()): ProjectSkeletonMap {
    const entries = new Map<string, SkeletonResult>();
    let totalOriginalBytes = 0;
    let totalSkeletonBytes = 0;
    const combinedParts: string[] = [];

    for (const relativePath of filePaths) {
      const fullPath = path.isAbsolute(relativePath) ? relativePath : path.join(baseDir, relativePath);
      if (!fs.existsSync(fullPath)) continue;

      const content = fs.readFileSync(fullPath, 'utf8');
      const result = this.extractFile(relativePath, content);

      entries.set(relativePath, result);
      totalOriginalBytes += result.originalLength;
      totalSkeletonBytes += result.skeletonLength;

      combinedParts.push(`--- ${relativePath} ---\n${result.skeletonContent}\n`);
    }

    const overallSavingsPercent =
      totalOriginalBytes > 0
        ? Math.round(((totalOriginalBytes - totalSkeletonBytes) / totalOriginalBytes) * 100)
        : 0;

    return {
      filesScanned: entries.size,
      totalOriginalBytes,
      totalSkeletonBytes,
      overallSavingsPercent,
      entries,
      combinedMap: combinedParts.join('\n')
    };
  }
}
