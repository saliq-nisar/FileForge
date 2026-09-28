import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { TemplateBuilder } from "@/features/business/template-builder";
import { pageMetadata } from "@/lib/seo";
import { LETTER_TEMPLATES, getLetterTemplate } from "@/templates/letters";

export const dynamicParams = false;
export const generateStaticParams = () => LETTER_TEMPLATES.map((t) => ({ slug: t.slug }));

export async function generateMetadata({ params }: PageProps<"/business/templates/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const t = getLetterTemplate(slug);
  return t ? pageMetadata({ title: `${t.name} Template`, description: t.description, path: `/business/templates/${slug}` }) : {};
}

export default async function TemplatePage({ params }: PageProps<"/business/templates/[slug]">) {
  const { slug } = await params;
  const t = getLetterTemplate(slug);
  if (!t) notFound();
  return (
    <PageContainer wide>
      <PageHeader title={t.name} description={t.description} breadcrumbs={[{ label: "Business", href: "/business" }]} />
      <TemplateBuilder slug={slug} />
    </PageContainer>
  );
}
