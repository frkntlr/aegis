import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ParsedRfc } from './rfc-triager.js';

export interface ResearchNoteResult {
  filePath: string;
  markdownContent: string;
}

export class NotebookLmBridge {
  private researchDir: string;

  constructor(customDir?: string) {
    this.researchDir = customDir ?? path.resolve(process.cwd(), '.aegis', 'research');
  }

  public exportRfcResearchNote(rfc: ParsedRfc): ResearchNoteResult {
    fs.mkdirSync(this.researchDir, { recursive: true });
    const slug = rfc.targetName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const filePath = path.resolve(this.researchDir, `rfc-${slug}-research.md`);

    const lines = [
      `# 📚 NotebookLM Research Note: ${rfc.targetName} (${rfc.category.toUpperCase()})`,
      '',
      `## 1. RFC Overview`,
      `* **Title:** ${rfc.title}`,
      `* **Category:** ${rfc.category}`,
      `* **Target Files:** ${rfc.proposedFiles.join(', ')}`,
      '',
      `## 2. Architectural Rationale`,
      rfc.rationale,
      '',
      `## 3. Implementation Guidelines & Demir Kafes Constraints`,
      `- Extensibility: Implement standard ${rfc.category === 'language' ? 'LanguageExtractor' : 'IdeAdapter'} interface.`,
      '- Modularity: Standalone class and unit test only. Zero modification to core dispatcher.',
      '- Limits: Max 40 lines per function, max 300 lines per file.',
      '- Verification: Token savings >= 50%, 100% test pass.',
      '',
      `*Generated automatically by Aegis Knowledge Sync on ${new Date().toISOString()}*`
    ];

    const markdownContent = lines.join('\n');
    fs.writeFileSync(filePath, markdownContent, 'utf8');
    return { filePath, markdownContent };
  }

  public getResearchNote(targetName: string): string | undefined {
    const slug = targetName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const filePath = path.resolve(this.researchDir, `rfc-${slug}-research.md`);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8');
    }
    return undefined;
  }

  public listResearchNotes(): string[] {
    if (!fs.existsSync(this.researchDir)) return [];
    return fs.readdirSync(this.researchDir).filter(f => f.endsWith('.md'));
  }
}
