export const SEMANTIC_STOP_WORDS = new Set([
  'the', 'and', 'with', 'for', 'this', 'that', 'from', 'into', 'over', 'after',
  'bir', 've', 'ile', 'icin', 'olan', 'gibi', 'daha', 'tam', 'bunu', 'buna',
  'make', 'build', 'create', 'update', 'fix', 'refactor', 'test', 'check'
]);

export const TEST_INTENT_WORDS = new Set(['test', 'spec', 'audit', 'triage', 'qa']);
export const TEST_INTENT_RE = /\b(test|spec|audit|triage|qa)\b/i;
export const CODE_EXTS = new Set(['.ts', '.tsx', '.gd', '.py', '.rs', '.go', '.cs', '.cpp']);
export const ALLOWED_EXTS = new Set(['.ts', '.tsx', '.gd', '.py', '.rs', '.go', '.cpp', '.cs', '.tscn', '.tres', '.json', '.md']);
const CAMEL_SPLIT_RE = /([a-z])([A-Z])/g;
const CLEAN_TOKEN_RE = /[^\p{L}\p{N}\s_-]/gu;

export const TURKISH_SYNONYMS: Record<string, string[]> = {
  'sağlık': ['health', 'hp'], 'saglik': ['health', 'hp'], 'oyuncu': ['player'], 'karakter': ['player', 'character'],
  'dövüş': ['combat', 'battle', 'fight'], 'dovus': ['combat', 'battle', 'fight'], 'savaş': ['combat', 'battle'], 'savas': ['combat', 'battle'],
  'envanter': ['inventory'], 'arayüz': ['ui', 'hud', 'interface', 'menu'], 'arayuz': ['ui', 'hud', 'interface', 'menu'], 'tema': ['theme'],
  'denetim': ['audit', 'triage', 'test'], 'görev': ['task', 'mission', 'quest'], 'gorev': ['task', 'mission', 'quest'],
  'ayarlar': ['settings', 'config'], 'ayar': ['setting', 'config'], 'ses': ['audio', 'sound'], 'kamera': ['camera'],
  'düşman': ['enemy'], 'dusman': ['enemy'], 'harita': ['map', 'tilemap'], 'yönetici': ['manager', 'controller'], 'yonetici': ['manager', 'controller'],
  'silah': ['weapon'], 'doküman': ['doc', 'wiki'], 'dokuman': ['doc', 'wiki'], 'dokümantasyon': ['doc', 'docs', 'wiki'], 'dokumantasyon': ['doc', 'docs', 'wiki'],
  'hafıza': ['memory', 'cache'], 'bellek': ['memory', 'cache'], 'çoklu': ['multi', 'teamwork', 'parallel'], 'coklu': ['multi', 'teamwork', 'parallel'],
  'ajan': ['agent', 'subagent', 'teamwork'], 'dağıt': ['shard', 'dispatch', 'distribute'], 'dagit': ['shard', 'dispatch', 'distribute'],
  'böl': ['decompose', 'shard', 'split'], 'bol': ['decompose', 'shard', 'split'], 'performans': ['performance', 'speed', 'optimization']
};

function appendKeyword(kw: string, target: string[]): void {
  if (kw.length < 3 || SEMANTIC_STOP_WORDS.has(kw) || target.includes(kw)) return;
  target.push(kw);
  const syns = TURKISH_SYNONYMS[kw];
  if (!syns) return;
  for (const s of syns) {
    if (!target.includes(s)) target.push(s);
  }
}

export function extractSemanticKeywords(text: string): string[] {
  const rawTokens = text.replace(CLEAN_TOKEN_RE, ' ').split(/\s+/);
  const keywords: string[] = [];
  for (const token of rawTokens) {
    if (!token || token.length < 3) continue;
    const subTokens = token.replace(CAMEL_SPLIT_RE, '$1 $2').replace(/[_-]/g, ' ').toLowerCase().split(' ');
    for (const st of subTokens) {
      appendKeyword(st.trim(), keywords);
    }
  }
  return keywords;
}
