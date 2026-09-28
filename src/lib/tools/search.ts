import type { ToolDefinition } from "@/types/tools";
import { getCategory } from "./categories";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/jpeg/g, "jpg")
    .replace(/[^a-z0-9+#/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface Indexed {
  tool: ToolDefinition;
  name: string;
  haystack: string;
}

const cache = new WeakMap<ToolDefinition[], Indexed[]>();

function index(tools: ToolDefinition[]): Indexed[] {
  let idx = cache.get(tools);
  if (!idx) {
    idx = tools.map((tool) => ({
      tool,
      name: normalize(tool.name),
      haystack: normalize(
        [tool.name, tool.description, ...tool.keywords, getCategory(tool.category).name, tool.slug.replace(/-/g, " ")].join(" "),
      ),
    }));
    cache.set(tools, idx);
  }
  return idx;
}

/**
 * Fast ranked search over tool names, keywords and descriptions.
 * Every query word must match (prefix match on words); name hits rank highest.
 */
export function searchTools(tools: ToolDefinition[], query: string, limit = 20): ToolDefinition[] {
  const q = normalize(query);
  if (!q) return [];
  const terms = q.split(" ");
  const results: Array<{ tool: ToolDefinition; score: number }> = [];
  for (const item of index(tools)) {
    let score = 0;
    let all = true;
    for (const term of terms) {
      const nameWords = item.name.split(" ");
      if (nameWords.includes(term)) score += 10;
      else if (nameWords.some((w) => w.startsWith(term))) score += 7;
      else if (item.haystack.split(" ").some((w) => w.startsWith(term))) score += 3;
      else if (item.haystack.includes(term)) score += 1;
      else {
        all = false;
        break;
      }
    }
    if (!all) continue;
    if (item.name.startsWith(q)) score += 8;
    if (item.name === q) score += 20;
    if (item.tool.status === "available") score += 1;
    if (item.tool.popular) score += 1;
    results.push({ tool: item.tool, score });
  }
  return results
    .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name))
    .slice(0, limit)
    .map((r) => r.tool);
}
