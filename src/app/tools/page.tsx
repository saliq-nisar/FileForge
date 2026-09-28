import { PageContainer, PageHeader, Section } from "@/components/layout/page-header";
import { ToolGrid } from "@/components/tools/tool-card";
import { CATEGORIES } from "@/lib/tools/categories";
import { toolsInCategory } from "@/lib/tools/registry";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "All tools",
  description: "Every PDF, image, document, business and career tool in one place.",
  path: "/tools",
});

export default function ToolsPage() {
  return (
    <PageContainer>
      <PageHeader title="All tools" description="Pick a tool — most run entirely in your browser, and nothing needs an account." />
      <nav aria-label="Categories" className="no-scrollbar -mx-4 mb-8 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {CATEGORIES.map((c) => (
          <a key={c.id} href={`#${c.id}`} className="shrink-0 rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] text-muted hover:border-border-strong hover:text-fg">
            {c.name}
          </a>
        ))}
      </nav>
      <div className="flex flex-col gap-12">
        {CATEGORIES.map((c) => (
          <Section key={c.id} id={c.id} title={c.name} description={c.description}>
            <ToolGrid tools={toolsInCategory(c.id)} />
          </Section>
        ))}
      </div>
    </PageContainer>
  );
}
