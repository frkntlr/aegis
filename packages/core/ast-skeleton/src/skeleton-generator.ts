import * as fs from 'node:fs';
import * as path from 'node:path';
import { TypeScriptSkeletonExtractor, type SkeletonResult } from './ts-extractor.js';

export interface ProjectSkeletonMap {
  filesScanned: number;
  totalOriginalBytes: number;
  totalSkeletonBytes: number;
  overallSavingsPercent: number;
  entries: Map<string, SkeletonResult>;
  combinedMap: string;
}

export class SkeletonGenerator {
  private tsExtractor = new TypeScriptSkeletonExtractor();

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

      let result: SkeletonResult;
      if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
        result = this.tsExtractor.extract(relativePath, content);
      } else {
        // Fallback for non-TS files
        result = {
          originalLength: content.length,
          skeletonLength: content.length,
          tokenSavingsPercent: 0,
          skeletonContent: `// Non-TS file: ${relativePath} (${content.split('\n').length} lines)`
        };
      }

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
