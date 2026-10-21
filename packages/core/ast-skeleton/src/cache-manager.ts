export interface CachedPromptBlock {
  type: 'text';
  text: string;
  cache_control?: {
    type: 'ephemeral';
  };
}

export interface LayeredPromptContext {
  constitutionBlock: CachedPromptBlock;
  skeletonMapBlock: CachedPromptBlock;
  taskBlock: CachedPromptBlock;
  totalCharacters: number;
  cachedCharacters: number;
  cacheRatioPercent: number;
}

export class PromptCacheManager {
  private constitutionText: string;

  constructor(constitutionText?: string) {
    this.constitutionText = constitutionText ?? 'AEGIS AGENT CONSTITUTION: Zero hallucination, strictly unified diffs, zero dead code.';
  }

  public assembleContext(skeletonMap: string, taskDescription: string): LayeredPromptContext {
    // Layer 1: Constitution (Cached)
    const constitutionBlock: CachedPromptBlock = {
      type: 'text',
      text: `# 🛡️ AEGIS CONSTITUTION & RUNTIME RULES\n${this.constitutionText}`,
      cache_control: { type: 'ephemeral' }
    };

    // Layer 2: AST Skeleton Map (Cached)
    const skeletonMapBlock: CachedPromptBlock = {
      type: 'text',
      text: `# 🗺️ SURGICAL CONTEXT (AST SKELETON MAP)\n${skeletonMap}`,
      cache_control: { type: 'ephemeral' }
    };

    // Layer 3: Task & Issue specifics (Dynamic, un-cached)
    const taskBlock: CachedPromptBlock = {
      type: 'text',
      text: `# 🎯 CURRENT TASK SPECIFICATIONS\n${taskDescription}`
    };

    const cachedChars = constitutionBlock.text.length + skeletonMapBlock.text.length;
    const totalChars = cachedChars + taskBlock.text.length;
    const cacheRatio = totalChars > 0 ? Math.round((cachedChars / totalChars) * 100) : 0;

    return {
      constitutionBlock,
      skeletonMapBlock,
      taskBlock,
      totalCharacters: totalChars,
      cachedCharacters: cachedChars,
      cacheRatioPercent: cacheRatio
    };
  }
}
