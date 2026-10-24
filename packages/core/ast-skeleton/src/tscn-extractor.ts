import type { SkeletonResult } from './ts-extractor.js';
import type { LanguageExtractor } from './extractor-registry.js';

export class TscnSkeletonExtractor implements LanguageExtractor {
  public readonly languageId = 'tscn';
  public readonly supportedExtensions = ['.tscn', '.tres', '.import'];

  public extract(_filePath: string, sourceCode: string): SkeletonResult {
    const lines = sourceCode.split(/\r?\n/);
    const skeletonLines = this.filterStructuralLines(lines);
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

  private filterStructuralLines(lines: string[]): string[] {
    const output: string[] = [];
    let insideNode = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (this.isSectionHeader(trimmed)) {
        insideNode = trimmed.startsWith('[node ');
        output.push(line);
      } else if (insideNode && this.isNodeEssentialProperty(trimmed)) {
        output.push(`  ${trimmed}`);
      } else if (trimmed.startsWith('[connection ')) {
        insideNode = false;
        output.push(line);
      }
    }

    return output;
  }

  private isSectionHeader(trimmed: string): boolean {
    return (
      trimmed.startsWith('[gd_scene') ||
      trimmed.startsWith('[gd_resource') ||
      trimmed.startsWith('[ext_resource') ||
      trimmed.startsWith('[sub_resource') ||
      trimmed.startsWith('[node ') ||
      trimmed.startsWith('[resource]')
    );
  }

  private isNodeEssentialProperty(trimmed: string): boolean {
    return (
      trimmed.startsWith('script =') ||
      trimmed.startsWith('theme =') ||
      trimmed.startsWith('text =') ||
      trimmed.startsWith('unique_name_in_owner =') ||
      trimmed.startsWith('layout_mode =') ||
      trimmed.startsWith('anchors_preset =') ||
      trimmed.startsWith('process_mode =') ||
      trimmed.startsWith('custom_minimum_size =') ||
      trimmed.startsWith('visible =') ||
      trimmed.startsWith('mouse_filter =') ||
      trimmed.startsWith('texture =')
    );
  }
}
