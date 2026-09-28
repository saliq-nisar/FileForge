import { findSkills } from "./keywords";
import { wordCount } from "./normalize";

export const ACTION_VERBS = new Set(
  (
    "accelerated achieved acquired adapted addressed administered advised advocated analyzed architected arranged assembled assessed audited authored automated " +
    "balanced boosted budgeted built calculated championed clarified coached collaborated completed composed conceived conducted configured consolidated constructed " +
    "consulted contributed converted coordinated created cultivated cut debugged decreased defined delivered deployed designed determined developed devised diagnosed " +
    "directed discovered documented doubled drafted drove edited educated eliminated enabled engineered enhanced established evaluated exceeded executed expanded " +
    "expedited facilitated forecasted formulated founded generated grew guided handled headed identified implemented improved increased influenced initiated innovated " +
    "inspected installed instituted integrated interviewed introduced invented investigated launched led leveraged maintained managed mapped marketed maximized " +
    "measured mentored migrated minimized modernized monitored motivated negotiated operated optimized orchestrated organized oversaw partnered performed persuaded " +
    "pioneered planned prepared presented prioritized processed produced programmed promoted proposed prototyped published raised rebuilt recommended recruited " +
    "redesigned reduced refactored refined reorganized replaced reported researched resolved restructured revamped reviewed revitalized saved scaled scheduled " +
    "secured served shipped simplified solved spearheaded standardized streamlined strengthened structured supervised supported surpassed synthesized taught tested " +
    "trained transformed translated tripled troubleshot unified upgraded utilized validated wrote"
  ).split(/\s+/),
);

const WEAK_OPENERS: Array<[RegExp, string]> = [
  [/^(was )?responsible for\b/i, "“Responsible for” describes a duty, not what you did."],
  [/^(worked|working) on\b/i, "“Worked on” is vague about your contribution."],
  [/^helped( to)?\b/i, "“Helped” undersells your role — say what you did."],
  [/^assisted( with| in)?\b/i, "“Assisted” is passive — describe your specific part."],
  [/^(duties|tasks) (included|include)\b/i, "Listing duties hides achievements."],
  [/^involved in\b/i, "“Involved in” doesn't show impact."],
  [/^participated in\b/i, "“Participated in” doesn't show your contribution."],
  [/^in charge of\b/i, "Prefer a verb such as “Led” or “Managed”, if accurate."],
];

export interface BulletIssue {
  id: "weak-opener" | "no-action-verb" | "no-metric" | "too-short" | "too-long" | "first-person" | "passive" | "filler" | "no-context";
  message: string;
  suggestion: string;
}

export interface BulletAnalysis {
  text: string;
  score: number; // 0-100
  issues: BulletIssue[];
  strengths: string[];
  hasMetric: boolean;
  startsWithActionVerb: boolean;
}

const METRIC = /(\d+(?:[.,]\d+)?\s*(%|percent|x|k|m|b|bn|hours?|hrs?|days?|weeks?|months?|users?|customers?|clients?|people|members|engineers|reports|projects|tickets|\$|€|£)|[$€£₹]\s?\d|\b\d{2,}\b|\b(doubled|tripled|halved)\b)/i;
const FILLERS = /\b(various|several|many|a lot of|lots of|etc\.?|things|stuff|very|really|basically|successfully)\b/i;

export function analyzeBullet(raw: string): BulletAnalysis {
  const text = raw.trim().replace(/^[-•*·▪◦]\s*/, "");
  const words = wordCount(text);
  const first = (text.match(/^[A-Za-z'-]+/)?.[0] ?? "").toLowerCase();
  const startsWithActionVerb = ACTION_VERBS.has(first);
  const hasMetric = METRIC.test(text);
  const issues: BulletIssue[] = [];
  const strengths: string[] = [];

  const weak = WEAK_OPENERS.find(([re]) => re.test(text));
  if (weak) {
    issues.push({ id: "weak-opener", message: weak[1], suggestion: "Start with a strong verb that accurately describes your action, e.g. Built, Led, Reduced, Designed, Automated." });
  } else if (!startsWithActionVerb) {
    issues.push({ id: "no-action-verb", message: "Doesn't start with an action verb.", suggestion: "Lead with what you did: “Implemented…”, “Analyzed…”, “Launched…” — choose the verb that is true for you." });
  } else {
    strengths.push("Starts with an action verb");
  }
  if (!hasMetric) {
    issues.push({ id: "no-metric", message: "No measurable result.", suggestion: "If you know it, add a real number: time saved, % improvement, users served, revenue, team size. Don't estimate figures you can't support." });
  } else {
    strengths.push("Includes a measurable detail");
  }
  if (words < 6) issues.push({ id: "too-short", message: "Very short — lacks context.", suggestion: "Say what you worked on, how, and the outcome." });
  if (words > 35) issues.push({ id: "too-long", message: `Long bullet (${words} words).`, suggestion: "Aim for one line or two: keep the action, the method and the result." });
  if (/\b(i|me|my|we|our)\b/i.test(text)) issues.push({ id: "first-person", message: "Uses first-person pronouns.", suggestion: "Resumes conventionally omit “I/my/we” — start directly with the verb." });
  if (/\b(was|were|been|being)\s+\w+ed\b/i.test(text)) issues.push({ id: "passive", message: "Passive voice.", suggestion: "Rewrite so you are the one acting: “Reduced load time…” instead of “Load time was reduced…”." });
  if (FILLERS.test(text)) issues.push({ id: "filler", message: "Contains vague filler words.", suggestion: "Replace words like “various” or “successfully” with specifics." });
  if (words >= 6 && findSkills(text).length === 0 && !hasMetric) {
    issues.push({ id: "no-context", message: "No tools, methods or scope mentioned.", suggestion: "Name the technology, method or scope involved — only what you actually used." });
  } else if (findSkills(text).length) {
    strengths.push("Mentions specific skills or tools");
  }

  const penalty: Record<BulletIssue["id"], number> = { "weak-opener": 25, "no-action-verb": 18, "no-metric": 20, "too-short": 15, "too-long": 10, "first-person": 8, passive: 10, filler: 6, "no-context": 8 };
  const score = Math.max(0, 100 - issues.reduce((a, i) => a + penalty[i.id], 0));
  return { text, score, issues, strengths, hasMetric, startsWithActionVerb };
}

/** Structural rewrite hint that keeps the user's facts: removes the weak opener only. */
export function restructureHint(raw: string): string | null {
  const text = raw.trim();
  const weak = WEAK_OPENERS.find(([re]) => re.test(text));
  if (!weak) return null;
  const rest = text.replace(weak[0], "").trim().replace(/^(the|a|an)\s+/i, "");
  return rest ? `[Action verb] ${rest}` : null;
}
