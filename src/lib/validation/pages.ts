/**
 * Parse page selections like "1-3, 5, 8-" into zero-based page indices.
 * Returns `null` for invalid input. Empty input means "all pages".
 */
export function parsePageSelection(input: string, pageCount: number): number[] | null {
  const groups = parsePageRanges(input, pageCount);
  if (groups === null) return null;
  const seen = new Set<number>();
  const out: number[] = [];
  for (const g of groups) {
    for (const i of g) {
      if (!seen.has(i)) {
        seen.add(i);
        out.push(i);
      }
    }
  }
  return out;
}

/** Like parsePageSelection but keeps each comma-separated range as its own group. */
export function parsePageRanges(input: string, pageCount: number): number[][] | null {
  const text = input.trim();
  if (!text) return [Array.from({ length: pageCount }, (_, i) => i)];
  const groups: number[][] = [];
  for (const raw of text.split(/[,;]/)) {
    const part = raw.trim().replace(/\s+/g, "");
    if (!part) continue;
    const m = /^(\d+)?(?:(-)(\d+)?)?$/.exec(part);
    if (!m || (!m[1] && !m[3])) return null;
    const start = m[1] ? Number(m[1]) : 1;
    const end = m[2] ? (m[3] ? Number(m[3]) : pageCount) : start;
    if (start < 1 || end < start || end > pageCount) return null;
    const group: number[] = [];
    for (let p = start; p <= end; p++) group.push(p - 1);
    groups.push(group);
  }
  return groups.length ? groups : null;
}

export function describePageError(pageCount: number): string {
  return `Enter pages between 1 and ${pageCount}, for example "1-3, 5".`;
}
