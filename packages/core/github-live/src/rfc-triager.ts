import type { GitHubIssue } from './types.js';

export interface ParsedRfc {
  discussionNumber?: number;
  title: string;
  category: 'language' | 'ide' | 'tool';
  targetName: string;
  rationale: string;
  proposedFiles: string[];
}

export class RfcTriager {
  private detectCategory(text: string): 'language' | 'ide' | 'tool' {
    const lower = text.toLowerCase();
    if (lower.includes('ide') || lower.includes('editor') || lower.includes('workspace')) {
      return 'ide';
    }
    if (lower.includes('security') || lower.includes('gate') || lower.includes('tool')) {
      return 'tool';
    }
    return 'language';
  }

  private deriveTargetFiles(category: 'language' | 'ide' | 'tool', targetName: string): string[] {
    const slug = targetName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (category === 'language') {
      return [
        `packages/core/ast-skeleton/src/${slug}-extractor.ts`,
        `packages/core/ast-skeleton/src/${slug}-extractor.test.ts`
      ];
    }
    if (category === 'ide') {
      return [
        `packages/core/orchestrator/src/${slug}-adapter.ts`,
        `packages/core/orchestrator/src/${slug}-adapter.test.ts`
      ];
    }
    return [`packages/core/tools/src/${slug}-plugin.ts`];
  }

  private extractTargetName(title: string): string {
    const clean = title.replace(/^RFC:\s*(\[[^\]]+\]\s*)?/i, '').trim();
    const m = clean.match(/^(?:Add|Implement|Support|Integrate|Create|Feature|New)?\s*([A-Za-z0-9#+.-]+(?:\s+[A-Za-z0-9#+.-]+)?)/i);
    if (!m || !m[1]) return 'Extension';
    const stripped = m[1].replace(/\b(support|ast|skeleton|extractor|adapter|integration)\b/gi, '').trim();
    return stripped || m[1].trim();
  }

  public parseRfc(title: string, body: string, discussionNumber?: number): ParsedRfc {
    const category = this.detectCategory(`${title}\n${body}`);
    const targetName = this.extractTargetName(title);

    const fileMatches = body.match(/packages\/[a-zA-Z0-9_\-\/.]+\.ts/g);
    const proposedFiles = fileMatches && fileMatches.length > 0
      ? Array.from(new Set(fileMatches))
      : this.deriveTargetFiles(category, targetName);

    return {
      discussionNumber,
      title,
      category,
      targetName,
      rationale: body.slice(0, 500).trim(),
      proposedFiles
    };
  }

  public generateAcceptanceCriteria(rfc: ParsedRfc): string[] {
    const criteria: string[] = [];
    if (rfc.category === 'language') {
      criteria.push(`Implement LanguageExtractor interface for ${rfc.targetName}`);
      criteria.push(`Register ${rfc.targetName} in ExtractorRegistry`);
      criteria.push('Verify token savings >= 50% on standard sample file');
    } else if (rfc.category === 'ide') {
      criteria.push(`Implement IdeAdapter interface for ${rfc.targetName}`);
      criteria.push('Configure worktree exclusions (.vscode, .cursor, etc.)');
    } else {
      criteria.push(`Implement tool/gate interface for ${rfc.targetName}`);
    }

    criteria.push('Pass all unit tests in monorepo');
    criteria.push('Demir Kafes 100% compliance (max 40 lines/fn, max 300 lines/file)');
    return criteria;
  }

  public convertToIssue(rfc: ParsedRfc, issueNumber: number): GitHubIssue {
    const acceptanceCriteria = this.generateAcceptanceCriteria(rfc);
    const lockLabels = rfc.proposedFiles.map(f => `lock:${f}`);

    return {
      id: issueNumber,
      number: issueNumber,
      title: `[RFC #${rfc.discussionNumber || issueNumber}] Add ${rfc.targetName} ${rfc.category.toUpperCase()} Support`,
      body: `Automated issue generated from RFC Discussion:\n\n${rfc.rationale}\n\nTarget: ${rfc.targetName}`,
      labels: ['status:ready', 'rfc:approved', ...lockLabels],
      status: 'ready',
      targetFiles: rfc.proposedFiles,
      acceptanceCriteria
    };
  }
}
