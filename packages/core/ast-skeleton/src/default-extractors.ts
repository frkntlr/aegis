import { ExtractorRegistry } from './extractor-registry.js';
import { TypeScriptSkeletonExtractor } from './ts-extractor.js';
import { PythonSkeletonExtractor } from './python-extractor.js';
import { GDScriptSkeletonExtractor } from './gdscript-extractor.js';
import { TscnSkeletonExtractor } from './tscn-extractor.js';
import { RustSkeletonExtractor } from './rust-extractor.js';
import { GoSkeletonExtractor } from './go-extractor.js';
import { CppSkeletonExtractor } from './cpp-extractor.js';
import { CSharpSkeletonExtractor } from './csharp-extractor.js';
import { BashSkeletonExtractor } from './bash-extractor.js';

export function registerDefaultExtractors(registry: ExtractorRegistry): void {
  registry.register(new TypeScriptSkeletonExtractor());
  registry.register(new PythonSkeletonExtractor());
  registry.register(new GDScriptSkeletonExtractor());
  registry.register(new TscnSkeletonExtractor());
  registry.register(new RustSkeletonExtractor());
  registry.register(new GoSkeletonExtractor());
  registry.register(new CppSkeletonExtractor());
  registry.register(new CSharpSkeletonExtractor());
  registry.register(new BashSkeletonExtractor());
}
