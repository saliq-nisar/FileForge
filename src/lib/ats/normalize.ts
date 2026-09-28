/** Text normalization shared by keyword extraction and matching. */

export function normalizeText(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/ /g, " ")
    .toLowerCase();
}

export const STOPWORDS = new Set(
  (
    "a an and are as at be been being but by can could did do does for from had has have having he her here hers him his how i if in into is it its " +
    "just may me more most must my no nor not of on once only or other our ours out over own per same she should so some such than that the their " +
    "theirs them then there these they this those through to too under until up very was we were what when where which while who whom why will with " +
    "within without would you your yours about above across after again against all also am any around because before below between both during each " +
    "few further off onto upon via etc including include includes including using use used able well new work working works job role team teams " +
    "company candidate candidates ideal looking seeking join us opportunity position responsibilities requirements qualifications preferred required " +
    "plus bonus strong excellent good great ability skills skill experience experienced years year knowledge understanding familiarity proficiency " +
    "proficient related relevant equivalent degree field etc e.g i.e day days week weeks month months time full part level based help helping make " +
    "ensure support provide develop build create maintain across within various multiple key new high highly best like least"
  ).split(/\s+/),
);

/** Tokens including tech-style ones: c++, c#, .net, node.js, ci/cd, a/b. */
export function tokenize(s: string): string[] {
  return normalizeText(s).match(/[a-z0-9][a-z0-9+#.\-/]*[a-z0-9+#]|[a-z0-9]|\.net/g) ?? [];
}

/** Light stemming for English plural/verb forms; keeps tech tokens intact. */
export function stem(token: string): string {
  if (token.length <= 4 || /[+#./\d]/.test(token)) return token;
  if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.endsWith("sses")) return token.slice(0, -2);
  if (token.endsWith("s") && !token.endsWith("ss") && !token.endsWith("us") && !token.endsWith("is")) return token.slice(0, -1);
  return token;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-phrase match with boundaries that work for tokens like "c++" and ".net". */
export function containsPhrase(haystackNormalized: string, phrase: string): boolean {
  const p = normalizeText(phrase).trim();
  if (!p) return false;
  const re = new RegExp(`(^|[^a-z0-9+#])${escapeRegExp(p).replace(/\s+/g, "[\\s-]+")}(?![a-z0-9+#])`, "i");
  if (re.test(haystackNormalized)) return true;
  // Simple plural/singular tolerance for single words.
  if (!/\s/.test(p) && p.length > 4 && !/[+#./]/.test(p)) {
    const alt = p.endsWith("s") ? p.slice(0, -1) : `${p}s`;
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(alt)}(?![a-z0-9])`, "i").test(haystackNormalized);
  }
  return false;
}

export function wordCount(s: string): number {
  return (s.match(/[A-Za-z0-9][A-Za-z0-9'+#.-]*/g) ?? []).length;
}
