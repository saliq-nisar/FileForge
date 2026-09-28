import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { pageTools } from "@/lib/tools/registry";
import { LETTER_TEMPLATES } from "@/templates/letters";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticPaths = ["", "/tools", "/business", "/career", "/career/resume", "/career/resume/quick", "/career/ats", "/career/analyzer", "/career/cover-letter", "/privacy", "/terms"];
  return [
    ...staticPaths.map((p) => ({ url: `${SITE_URL}${p}`, lastModified: now, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.7 })),
    ...pageTools().map((t) => ({ url: `${SITE_URL}/tools/${t.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: t.popular ? 0.9 : 0.6 })),
    ...["invoice", "quote", "receipt", "purchase-order"].map((k) => ({ url: `${SITE_URL}/business/${k}/new`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 })),
    ...LETTER_TEMPLATES.map((t) => ({ url: `${SITE_URL}/business/templates/${t.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.5 })),
  ];
}
