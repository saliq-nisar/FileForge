import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { DocumentBuilderClient } from "@/features/business/document-builder-client";
import { KIND_CONFIG } from "@/features/business/model";
import { pageMetadata } from "@/lib/seo";
import { isBusinessKind } from "../../kinds";

export async function generateMetadata({ params }: PageProps<"/business/[kind]/[id]">): Promise<Metadata> {
  const { kind } = await params;
  if (!isBusinessKind(kind)) return {};
  const label = KIND_CONFIG[kind].label;
  return {
    ...pageMetadata({ title: `${label} Generator`, description: `Create a professional ${label.toLowerCase()} with automatic totals and taxes. Download as PDF or Word.`, path: `/business/${kind}/new` }),
    robots: { index: false },
  };
}

export default async function BuilderPage({ params }: PageProps<"/business/[kind]/[id]">) {
  const { kind, id } = await params;
  if (!isBusinessKind(kind) || !/^(new|[0-9a-f-]{36})$/i.test(id)) notFound();
  const cfg = KIND_CONFIG[kind];
  return (
    <PageContainer wide>
      <PageHeader title={id === "new" ? `Create ${cfg.label.toLowerCase()}` : `Edit ${cfg.label.toLowerCase()}`} breadcrumbs={[{ label: "Business", href: "/business" }, { label: cfg.plural, href: `/business/${kind}` }]} />
      <DocumentBuilderClient kind={kind} id={id} />
    </PageContainer>
  );
}
