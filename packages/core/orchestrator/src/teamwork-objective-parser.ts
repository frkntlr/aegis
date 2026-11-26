import type { RoleType } from './role-classifier.js';
import type { DecomposedSubtask } from './teamwork-decomposer.js';

const STOP_WORDS = new Set([
  've', 'and', 'ile', 'with', 'for', 'the', 'bir', 'bu', 'da', 'de',
  'hala', 'hâlâ', 'başka', 'daha', 'cok', 'çok', 'ise', 'gibi',
  'tam', 'bununla', 'buna', 'bunu', 'ilgili', 'görevi', 'gorevi',
  'görev', 'gorev', 'üzerine', 'uzerine', 'çalışma', 'calisma',
  'çalış', 'calis', 'duruyor', 'zorluk', 'olan', 'olarak', 'için', 'icin'
]);

const FALLBACK_LABELS = [
  'MultiAgent',
  'TaskSharder',
  'PerformanceRadar',
  'MeshProtocol',
  'GateAudit'
] as const;

function resolveDomainWord(word: string): string | null {
  const lower = word.toLowerCase();
  if (/^(multi|ajan|agent|paralel|team|coklu|çoklu)$/.test(lower)) return 'MultiAgent';
  if (/^(shard|bolmekte|bölmekte|dagitmakta|dağıtmakta|sharder)$/.test(lower)) return 'TaskSharder';
  if (/^(bug|radar|speed)$/.test(lower)) return 'PerformanceRadar';
  return null;
}

function resolveFallbackLabel(title: string): string {
  const lower = title.toLowerCase();
  if (/multi|ajan|agent|paralel|team/.test(lower)) return 'MultiAgent';
  if (/shard|böl|bol|dağıt|dagit|part|parça|parca/.test(lower)) return 'TaskSharder';
  if (/performans|hız|hiz|radar|optimi|speed|bug/.test(lower)) return 'PerformanceRadar';
  if (/mesh|protokol|protocol|iletisim|iletişim|sync/.test(lower)) return 'MeshProtocol';
  if (/audit|gate|kafes|cage|denetim|test/.test(lower)) return 'GateAudit';
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = ((hash << 5) - hash) + title.charCodeAt(i);
    hash |= 0;
  }
  return FALLBACK_LABELS[Math.abs(hash) % FALLBACK_LABELS.length];
}

function splitCompoundSentence(text: string): string[] {
  const lower = text.toLowerCase();
  const splitPoints = [
    ' ve de ', ' hem de ', ' as well as ',
    ' aynı zamanda ', ' bunun yanında ', ' ayrıca ',
    ' ve ', ' and ', ' ile ', ' & '
  ];
  for (const sp of splitPoints) {
    if (lower.includes(sp)) {
      const parts = text.split(new RegExp(sp, 'i')).map(p => p.trim()).filter(p => p.length >= 3);
      if (parts.length > 1) return parts;
    }
  }
  return [text];
}

export function splitObjectiveHelper(objective: string): string[] {
  const trimmed = objective.trim();
  if (!trimmed) return ['Default Task'];

  const numberedRegex = /(?:^|\n|\s+)(?:\d+[\.\)]|\*|-|•)\s+/;
  if (numberedRegex.test(trimmed)) {
    const items = trimmed.split(numberedRegex).map(s => s.trim()).filter(Boolean);
    if (items.length > 1) return items;
  }
  if (trimmed.includes(';') || trimmed.includes(' && ')) {
    const items = trimmed.split(/;|\s+&&\s+/).map(s => s.trim()).filter(Boolean);
    if (items.length > 1) return items;
  }
  if (trimmed.includes('\n')) {
    const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) return lines;
  }
  const sentences = trimmed.split(/[.!?]+(?:\s+|$)/).map(s => s.trim()).filter(s => s.length >= 3);
  if (sentences.length > 1) return sentences;
  if (trimmed.includes(',')) {
    const items = trimmed.split(',').map(s => s.trim().replace(/[.!?]+$/, '')).filter(p => p.length >= 3);
    if (items.length >= 2) return items;
  }
  return splitCompoundSentence(trimmed);
}

export function extractLabelHelper(title: string, role: RoleType): string {
  const cleaned = title.replace(/^(\d+[\.\)]|\*|-|•)\s*/, '').trim();
  const words = cleaned.split(/\s+/).filter(w => !STOP_WORDS.has(w.toLowerCase()));
  if (role === 'ui') return 'UI';
  if (role === 'docs') return 'Docs';
  if (role === 'qa') return 'Audit';
  if (words.length === 0) return resolveFallbackLabel(title);
  const candidate = words[0].replace(/[^a-zA-Z0-9_\u00C0-\u017F]/g, '');
  if (!candidate || candidate.length < 3 || STOP_WORDS.has(candidate.toLowerCase())) {
    return resolveFallbackLabel(title);
  }
  const domainWord = resolveDomainWord(candidate);
  if (domainWord) return domainWord;
  return candidate.charAt(0).toUpperCase() + candidate.slice(1).slice(0, 15);
}

export function classifyRawItemHelper(raw: string): { roleType: RoleType; label: string; title: string } {
  const title = raw.replace(/^(\d+[\.\)]|\*|-|•)\s*/, '').trim();
  const lower = title.toLowerCase();
  let roleType: RoleType = 'solver';
  if (lower.includes('audit') || lower.includes('triage') || lower.includes('kafes') || lower.includes('denetim') || lower.includes('test') || lower.includes('doğrula') || lower.includes('dogrula')) {
    roleType = 'qa';
  } else if (lower.includes('ui') || lower.includes('theme') || lower.includes('hud') || lower.includes('pause menu') || lower.includes('layout') || lower.includes('arayüz') || lower.includes('arayuz') || lower.includes('tema') || lower.includes('görsel') || lower.includes('gorsel') || lower.includes('ekran')) {
    roleType = 'ui';
  } else if (lower.startsWith('doc') || lower.includes('wiki') || lower.includes('rfc') || lower.includes('dokümantasyon') || lower.includes('dokumantasyon') || lower.includes('document') || lower.includes('belge')) {
    roleType = 'docs';
  }
  return { roleType, label: extractLabelHelper(title, roleType), title };
}

export function enrichSubtasksHelper(
  items: Array<{ roleType: RoleType; label: string; title: string }>
): DecomposedSubtask[] {
  const labelsSeen = new Map<string, number>();
  return items.map(item => {
    const count = (labelsSeen.get(item.label) ?? 0) + 1;
    labelsSeen.set(item.label, count);
    return {
      roleType: item.roleType,
      label: count > 1 ? `${item.label}-${count}` : item.label,
      title: item.title,
      targetFiles: []
    };
  });
}
