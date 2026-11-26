export interface SkeletonResult {
  originalLength: number;
  skeletonLength: number;
  tokenSavingsPercent: number;
  skeletonContent: string;
}

export interface LanguageExtractor {
  readonly languageId: string;
  readonly supportedExtensions: string[];
  extract(relativePath: string, content: string): SkeletonResult;
}
