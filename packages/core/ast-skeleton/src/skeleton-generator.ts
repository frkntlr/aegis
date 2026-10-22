import * as fs from 'node:fs';
import * as path from 'node:path';
import { ExtractorRegistry, type LanguageExtractor } from './extractor-registry.js';
import { TypeScriptSkeletonExtractor, type SkeletonResult } from './ts-extractor.js';
import { PythonSkeletonExtractor } from './python-extractor.js';
import { GDScriptSkeletonExtractor } from './gdscript-extractor.js';
import { RustSkeletonExtractor } from './rust-extractor.js';

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
      this.registry.register(new RustSkeletonExtractor());
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
    const mapBlocks: string[] = [];

    for (const filePath of filePaths) {
      const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath);
      if (!fs.existsSync(fullPath)) continue;

      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      const content = fs.readFileSync(fullPath, 'utf8');
      const result = this.extractFile(relativePath, content);

      entries.set(relativePath, result);
      totalOriginalBytes += result.originalLength;
      totalSkeletonBytes += result.skeletonLength;

      mapBlocks.push(`// --- FILE: ${relativePath} (Savings: ${result.tokenSavingsPercent}%) ---\n${result.skeletonContent}`);
    }

    const overallSavingsPercent = totalOriginalBytes > 0
      ? Math.round(((totalOriginalBytes - totalSkeletonBytes) / totalOriginalBytes) * 100)
      : 0;

    return {
      filesScanned: entries.size,
      totalOriginalBytes,
      totalSkeletonBytes,
      overallSavingsPercent: Math.max(0, overallSavingsPercent),
      entries,
      combinedMap: mapBlocks.join('\n\n')
    };
  }
}
