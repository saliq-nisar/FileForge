import type { Metadata } from "next";
import { SITE } from "@/lib/constants/navigation";

/** Public site URL (safe to expose). Used for canonical URLs, sitemap and Open Graph. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  const fullTitle = `${title} - ${SITE.name}`;
  return {
    title: { absolute: fullTitle },
    description,
    alternates: { canonical: path },
    openGraph: { title: fullTitle, description, url: path, siteName: SITE.name, type: "website" },
    twitter: { card: "summary", title: fullTitle, description },
  };
}
