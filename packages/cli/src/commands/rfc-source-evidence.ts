/** Source metadata is descriptive; approval never implies implementation or passing tests. */
export function rfcStatus(content: string): string {
  const match = content.match(/^\s*(?:[-*>]\s*)?(?:\*\*)?(?:Status|Durum):(?:\*\*)?\s*(.+)$/im);
  return match?.[1].replace(/\*\*/g, '').trim() || 'Unspecified';
}

export function sourceWikiArtifact(title: string, slug: string, content: string): {
  title: string; threeBullets: [string, string, string]; cleanContent: string;
} {
  return { title: `${title} — Sistem Mimarisi`, threeBullets: [
    `Source: docs/rfc/${slug}.md`,
    `Declared status: ${rfcStatus(content)}`,
    'Source snapshot; implementation and quality-gate outcomes require separate evidence.'
  ], cleanContent: content };
}
