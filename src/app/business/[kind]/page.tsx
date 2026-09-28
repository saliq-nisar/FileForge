import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { DocumentHistory } from "@/features/business/document-history";
import { KIND_CONFIG } from "@/features/business/model";
import { pageMetadata } from "@/lib/seo";
import { BUSINESS_KINDS, isBusinessKind } from "../kinds";

export const dynamicParams = false;
export const generateStaticParams = () => BUSINESS_KINDS.map((kind) => ({ kind }));

export async function generateMetadata({ params }: PageProps<"/business/[kind]">): Promise<Metadata> {
  const { kind } = await params;
  if (!isBusinessKind(kind)) return {};
  return pageMetadata({ title: KIND_CONFIG[kind].plural, description: `Your saved ${KIND_CONFIG[kind].plural.toLowerCase()}.`, path: `/business/${kind}` });
}

export default async function HistoryPage({ params }: PageProps<"/business/[kind]">) {
  const { kind } = await params;
  if (!isBusinessKind(kind)) notFound();
  const cfg = KIND_CONFIG[kind];
  return (
    <PageContainer>
      <PageHeader
        title={cfg.plural}
        description="Saved on this device. Search, filter, duplicate and re-download."
        breadcrumbs={[{ label: "Business", href: "/business" }]}
        actions={<Link href={`/business/${kind}/new`} className={buttonClasses()}><Plus className="size-4" aria-hidden="true" />New {cfg.label.toLowerCase()}</Link>}
      />
      <DocumentHistory kind={kind} />
    </PageContainer>
  );
}
