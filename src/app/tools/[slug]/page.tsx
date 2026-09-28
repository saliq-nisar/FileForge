import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageContainer, PageHeader, Section } from "@/components/layout/page-header";
import { ToolGrid } from "@/components/tools/tool-card";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { ToolIcon } from "@/components/ui/icon";
import { SITE } from "@/lib/constants/navigation";
import { getCategory } from "@/lib/tools/categories";
import { getTool, pageTools, toolsInCategory } from "@/lib/tools/registry";
import { SITE_URL, pageMetadata } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return pageTools().map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: PageProps<"/tools/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) return {};
  return pageMetadata({
    title: tool.ui === "editor" || tool.ui === "ocr" ? tool.name : `${tool.name} Online`,
    description: tool.seoDescription ?? tool.description,
    path: `/tools/${tool.slug}`,
  });
}

export default async function ToolPage({ params }: PageProps<"/tools/[slug]">) {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool || tool.ui === "link") notFound();
  const category = getCategory(tool.category);
  const related = toolsInCategory(tool.category).filter((t) => t.slug !== tool.slug && t.status === "available").slice(0, 6);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: `${tool.name} — ${SITE.name}`,
    url: `${SITE_URL}/tools/${tool.slug}`,
    description: tool.seoDescription ?? tool.description,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any (web browser)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };

  if (tool.ui === "editor") {
    // The editor takes over the viewport with its own professional layout.
    return <ToolWorkspace slug={slug} />;
  }

  return (
    <PageContainer wide>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <PageHeader
        title={tool.name}
        description={tool.description}
        breadcrumbs={[
          { label: "Tools", href: "/tools" },
          { label: category.name, href: `/tools#${category.id}` },
        ]}
        icon={
          <span className="mt-1 hidden size-10 shrink-0 items-center justify-center rounded-lg sm:flex" style={{ color: category.color, backgroundColor: `color-mix(in srgb, ${category.color} 12%, transparent)` }}>
            <ToolIcon name={tool.icon} size={20} />
          </span>
        }
      />
      <ToolWorkspace slug={slug} />
      {related.length > 0 && (
        <div className="mt-14">
          <Section title={`More ${category.name.toLowerCase()} tools`}>
            <ToolGrid tools={related} compact />
          </Section>
        </div>
      )}
    </PageContainer>
  );
}
