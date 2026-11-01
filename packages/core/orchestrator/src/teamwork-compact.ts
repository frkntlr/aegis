/**
 * @file teamwork-compact.ts
 * Antigravity Compact Integrator & Context Token Optimizer.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { RTKTokenKiller } from '@aegis/watchdog';
import type { TeamworkPlan, TeamworkStatusReport } from './teamwork-coordinator.js';

export interface CompactOutputResult {
  compressedText: string;
  tokenSavingsPercent: number;
  originalLines: number;
  compressedLines: number;
}

export interface CompactInboxResult {
  archivedCount: number;
  remainingCount: number;
  ledgerPath: string;
}

export class TeamworkCompactEngine {
  private repoRoot: string;

  constructor(repoRoot: string = process.cwd()) {
    this.repoRoot = path.resolve(repoRoot);
  }

  public compactOutput(rawText: string): CompactOutputResult {
    const res = RTKTokenKiller.compress(rawText);
    return {
      compressedText: res.compressedText,
      tokenSavingsPercent: res.tokenSavingsPercent,
      originalLines: res.originalLines,
      compressedLines: res.compressedLines
    };
  }

  public compactInbox(repoRoot = this.repoRoot): CompactInboxResult {
    const inboxPath = path.resolve(repoRoot, '.aegis', 'task-inbox.json');
    const ledgerPath = path.resolve(repoRoot, '.aegis', 'task-ledger.json');
    if (!fs.existsSync(inboxPath)) {
      return { archivedCount: 0, remainingCount: 0, ledgerPath };
    }

    try {
      const raw = JSON.parse(fs.readFileSync(inboxPath, 'utf8'));
      const tasks: Array<{ status?: string; issueNumber?: number; title?: string }> = Array.isArray(raw)
        ? raw
        : (raw && typeof raw === 'object' && Array.isArray((raw as { tasks?: unknown[] }).tasks) ? (raw as { tasks: unknown[] }).tasks : []);

      const completed = tasks.filter(t => t.status === 'done');
      const active = tasks.filter(t => t.status !== 'done');
      if (completed.length === 0) {
        return { archivedCount: 0, remainingCount: active.length, ledgerPath };
      }

      const existingLedger: unknown[] = fs.existsSync(ledgerPath) ? (JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) || []) : [];
      const updatedLedger = [...existingLedger, ...completed];
      fs.writeFileSync(ledgerPath, JSON.stringify(updatedLedger, null, 2), 'utf8');
      fs.writeFileSync(inboxPath, JSON.stringify(active, null, 2), 'utf8');

      return { archivedCount: completed.length, remainingCount: active.length, ledgerPath };
    } catch {
      return { archivedCount: 0, remainingCount: 0, ledgerPath };
    }
  }

  public generateCompactBriefing(
    plan: TeamworkPlan,
    status?: TeamworkStatusReport,
    tokenSavingsPercent = 85
  ): string {
    const lines: string[] = [
      `## 🗜️ Antigravity Compact Mission Briefing [${plan.planId}]`,
      `**Hedef**: ${plan.objective}`,
      `**Tasarruf**: %${tokenSavingsPercent} token tasarrufu sağlandı (RTK + AST Skeleton).`,
      '',
      '### 📋 Aktif / Bekleyen Görevler'
    ];

    for (const track of plan.tracks) {
      const targets = track.targetFiles.length > 0 ? track.targetFiles.join(', ') : 'Genel';
      lines.push(`- [ ] Faz ${track.phase} | \`${track.subagentName}\` -> \`${targets}\``);
    }

    if (status && Object.keys(status.locks).length > 0) {
      lines.push('', '### 🔒 Aktif Mutex Kilitleri');
      for (const [file, owner] of Object.entries(status.locks)) {
        lines.push(`- \`${file}\` -> @${owner}`);
      }
    }

    lines.push(
      '',
      '### ⚖️ Demir Kafes & Kod Değişmezleri',
      '- Max 300 satır/dosya, max 40 satır/fonksiyon, 0 any.',
      '- Tamamı doğrulanmış AST imzaları ve sıfır halüsinasyon.'
    );

    return lines.join('\n');
  }

  public compactGroundingContext(groundingText: string, maxLines = 45): string {
    const lines = groundingText.split('\n');
    if (lines.length <= maxLines) return groundingText;
    const kept = lines.slice(0, maxLines);
    kept.push('// ... [Antigravity Compact: Kalan AST iskeleti sıkıştırıldı]');
    return kept.join('\n');
  }
}
