export interface FuzzyMatchResult<T> {
  item: T;
  distance: number;
  score: number;
}

export class FuzzyMatcher {
  public static damerauLevenshtein(a: string, b: string): number {
    const s1 = a.toLowerCase();
    const s2 = b.toLowerCase();
    const l1 = s1.length;
    const l2 = s2.length;
    if (s1 === s2) return 0;
    if (l1 === 0) return l2;
    if (l2 === 0) return l1;

    const d: number[][] = Array.from({ length: l1 + 1 }, () => new Array(l2 + 1).fill(0));
    for (let i = 0; i <= l1; i++) d[i][0] = i;
    for (let j = 0; j <= l2; j++) d[0][j] = j;

    for (let i = 1; i <= l1; i++) {
      for (let j = 1; j <= l2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && s1[i - 1] === s2[j - 2] && s1[i - 2] === s2[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[l1][l2];
  }

  public static similarity(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1.0;
    const dist = FuzzyMatcher.damerauLevenshtein(a, b);
    return Math.max(0, parseFloat((1 - dist / maxLen).toFixed(2)));
  }

  public static findMatches<T>(
    query: string,
    candidates: T[],
    keyFn: (item: T) => string,
    maxDistance = 2
  ): FuzzyMatchResult<T>[] {
    const qLower = query.toLowerCase().trim();
    const results: FuzzyMatchResult<T>[] = [];

    for (const item of candidates) {
      const key = keyFn(item);
      const dist = FuzzyMatcher.damerauLevenshtein(qLower, key);
      if (dist <= maxDistance) {
        const score = FuzzyMatcher.similarity(qLower, key);
        results.push({ item, distance: dist, score });
      }
    }

    return results.sort((a, b) => (a.distance !== b.distance ? a.distance - b.distance : b.score - a.score));
  }

  public static suggest(query: string, candidates: string[], maxDistance = 2): string | null {
    const matches = FuzzyMatcher.findMatches(query, candidates, s => s, maxDistance);
    return matches.length > 0 ? matches[0].item : null;
  }
}
