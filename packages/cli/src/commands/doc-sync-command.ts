/**
 * @file doc-sync-command.ts
 * Living Memory Synchronization Engine for GitHub Wiki, RFCs & README.md.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { WikiMemoryManager } from '@aegis/github-live';
import { resolveSafeRepoRoot } from '@aegis/shared';
import { showBanner } from './banner.js';
import { cleanseExistingRfcForWiki } from './rfc-templates.js';
import { rfcStatus } from './rfc-source-evidence.js';

export interface DocSyncReport {
  wikiPagesSynced: number;
  wikiPushed: boolean;
  readmeUpdated: boolean;
  totalRfcs: number;
}

interface RfcFileInfo {
  num: number;
  slug: string;
  fileName: string;
  filePath: string;
}

function resolveRfcFiles(root: string): RfcFileInfo[] {
  const rfcDir = path.resolve(root, 'docs', 'rfc');
  if (!fs.existsSync(rfcDir)) return [];
  const files = fs.readdirSync(rfcDir).filter(f => f.startsWith('RFC-') && f.endsWith('.md'));
  const parsed = files.map(f => {
    const m = f.match(/^RFC-(\d+)/i);
    const num = m ? parseInt(m[1], 10) : 0;
    return {
      num,
      slug: f.replace(/\.md$/, ''),
      fileName: f,
      filePath: path.join(rfcDir, f)
    };
  });
  return parsed.sort((a, b) => a.num - b.num);
}

function buildDynamicRfcIndex(rfcs: RfcFileInfo[]): string {
  const maxNum = rfcs.length > 0 ? String(rfcs[rfcs.length - 1].num).padStart(3, '0') : '043';
  const lines: string[] = [
    `# 🏛️ Aegis Mimari Karar Kayıtları & RFC Dizini (RFC-001 - RFC-${maxNum})`,
    '',
    'Aegis ekosistemindeki tüm mimari evrimler ve köklü yapısal kararlar, **RFC (Request for Comments)** protokolü üzerinden tasarlanır, tartışılır, kabul kriterlerine bölünür ve yaşayan GitHub Wiki spesifikasyonlarına dönüştürülür.',
    '',
    '| RFC No | Başlık ve Mimari Kapsam | Durum | Canlı Wiki Spesifikasyonu |',
    '| :--- | :--- | :--- | :--- |'
  ];

  for (const rfc of rfcs) {
    let title = rfc.slug;
    let status = 'Unspecified';
    try {
      const content = fs.readFileSync(rfc.filePath, 'utf8');
      const tm = content.match(/^#\s+(.+)$/m);
      if (tm) title = tm[1].replace(/^[^\w]+/, '').trim();
      status = rfcStatus(content);
      status = rfcStatus(content);
    } catch { /* use default */ }
    const pad = String(rfc.num).padStart(3, '0');
    lines.push(`| **RFC-${pad}** | **${title}** | \`${status}\` | [[${rfc.slug}]] |`);
  }
  return lines.join('\n');
}

function updateWikiSuite(rfcs: RfcFileInfo[]): { count: number; pushed: boolean; failures: string[] } {
  const wiki = new WikiMemoryManager();
  let count = 0;
  const failures: string[] = [];

  for (const rfc of rfcs) {
    try {
      const content = fs.readFileSync(rfc.filePath, 'utf8');
      const cleanDoc = cleanseExistingRfcForWiki(rfc.slug, content);
      wiki.setPage(rfc.slug, cleanDoc.title, cleanDoc.threeBullets, cleanDoc.cleanContent);
      count++;
    } catch (error) { failures.push(`${rfc.fileName}: ${error instanceof Error ? error.message : String(error)}`); }
  }

  const indexMd = buildDynamicRfcIndex(rfcs);
  const maxPad = rfcs.length > 0 ? String(rfcs[rfcs.length - 1].num).padStart(3, '0') : '043';
  wiki.setPage(
    'RFC-Index',
    `Aegis Mimari Karar Kayıtları & RFC Dizini (RFC-001 - RFC-${maxPad})`,
    [
      `${count} RFC source snapshots cached locally.`,
      'Remote publication is reported separately from local caching.',
      'Approval and verification outcomes are not inferred from synchronization.'
    ],
    indexMd
  );

  const pushRes = failures.length ? { success: false } : wiki.pushAllToRemote();
  return { count, pushed: pushRes.success, failures };
}

function updateReadmeFile(root: string, rfcCount: number, maxRfcNum = 43): boolean {
  const readmePath = path.resolve(root, 'README.md');
  if (!fs.existsSync(readmePath)) return false;

  const original = fs.readFileSync(readmePath, 'utf8');
  let content = original;
  const countStr = String(rfcCount);
  const padStr = String(maxRfcNum).padStart(3, '0');

  content = content.replace(/RFC\s*\(\d+\s*Adet\)/gi, `RFC (${countStr} Adet)`);
  content = content.replace(/RFC-001\s*-\s*RFC-\d+/gi, `RFC-001 - RFC-${padStr}`);

  if (content === original) return false;
  fs.writeFileSync(readmePath, content, 'utf8');
  return true;
}

export async function syncRfcToWikiAndReadme(
  num: number,
  _title: string,
  fileName: string,
  content: string,
  isApproved = false
): Promise<DocSyncReport> {
  const root = resolveSafeRepoRoot();
  const rfcs = resolveRfcFiles(root);
  const totalRfcs = rfcs.some(rfc => rfc.slug === fileName.replace(/\.md$/, '')) ? rfcs.length : rfcs.length + 1;

  const slug = fileName.replace(/\.md$/, '');
  const cleanDoc = cleanseExistingRfcForWiki(slug, content);
  const wiki = new WikiMemoryManager();
  wiki.setPage(slug, cleanDoc.title, cleanDoc.threeBullets, cleanDoc.cleanContent);

  const indexMd = buildDynamicRfcIndex(rfcs);
  const padStr = String(Math.max(num, ...rfcs.map(rfc => rfc.num))).padStart(3, '0');
  wiki.setPage(
    'RFC-Index',
    `Aegis Mimari Karar Kayıtları & RFC Dizini (RFC-001 - RFC-${padStr})`,
    [
      `Aegis Çekirdek Motorunun ${totalRfcs} Mimari Tasarım Belgesi (RFC-001 - RFC-${padStr}).`,
      'Remote publication is reported separately from local caching.',
      'Approval and verification outcomes are not inferred from synchronization.'
    ],
    indexMd
  );

  const pushRes = isApproved ? wiki.pushAllToRemote() : { success: false, message: 'Local cached' };
  const maxNum = rfcs.length > 0 ? Math.max(...rfcs.map(r => r.num), num) : num;
  const readmeUpdated = updateReadmeFile(root, totalRfcs, maxNum);

  return {
    wikiPagesSynced: 1,
    wikiPushed: pushRes.success,
    readmeUpdated,
    totalRfcs
  };
}

export async function handleDocSync(): Promise<void> {
  showBanner();
  console.log('📚 Synchronizing Living Memory: GitHub Wiki, RFCs & README.md...');
  const root = resolveSafeRepoRoot();
  const rfcs = resolveRfcFiles(root);
  const { count, pushed, failures } = updateWikiSuite(rfcs);
  for (const failure of failures) console.error(`Wiki cache failed: ${failure}`);
  if (failures.length) process.exitCode = 1;
  const maxNum = rfcs.length > 0 ? Math.max(...rfcs.map(r => r.num)) : 43;
  const readmeUpdated = updateReadmeFile(root, rfcs.length, maxNum);

  console.log(`✅ GitHub Wiki: ${count} RFC pages & RFC-Index synchronized into .aegis/wiki-cache.`);
  console.log(pushed ? '🚀 Pushed directly to GitHub Wiki remote (<repo>.wiki.git)!' : 'ℹ️  Wiki cache updated locally (run `aegis wiki:sync` to push remote).');
  console.log(readmeUpdated ? `README RFC metadata updated (${rfcs.length} source files).` : 'README unchanged or absent.');
}
