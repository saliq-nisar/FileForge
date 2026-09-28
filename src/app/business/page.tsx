import Link from "next/link";
import { FileText, Receipt, ShoppingCart, FileSpreadsheet } from "lucide-react";
import { PageContainer, PageHeader, Section } from "@/components/layout/page-header";
import { ToolGrid } from "@/components/tools/tool-card";
import { KIND_CONFIG } from "@/features/business/model";
import { pageMetadata } from "@/lib/seo";
import { toolsInCategory } from "@/lib/tools/registry";
import { BUSINESS_KINDS } from "./kinds";

export const metadata = pageMetadata({
  title: "Business documents",
  description: "Create invoices, quotes, receipts, purchase orders, proposals and letters. Export to PDF or Word.",
  path: "/business",
});

const ICONS = { invoice: Receipt, quote: FileSpreadsheet, receipt: FileText, "purchase-order": ShoppingCart } as const;

export default function BusinessPage() {
  return (
    <PageContainer>
      <PageHeader title="Business" description="Professional documents without design work. Totals and taxes are calculated for you; exports are real text PDFs and Word files." />
      <div className="flex flex-col gap-10">
        <Section title="Billing documents">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {BUSINESS_KINDS.map((k) => {
              const Icon = ICONS[k];
              return (
                <li key={k} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
                  <span className="flex size-9 items-center justify-center rounded-md" style={{ color: "var(--cat-business)", background: "color-mix(in srgb, var(--cat-business) 12%, transparent)" }}>
                    <Icon className="size-[18px]" aria-hidden="true" />
                  </span>
                  <h2 className="text-sm font-semibold">{KIND_CONFIG[k].plural}</h2>
                  <div className="mt-auto flex gap-2">
                    <Link href={`/business/${k}/new`} className="rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-fg hover:bg-accent-hover">Create</Link>
                    <Link href={`/business/${k}`} className="rounded-md border border-border px-3 py-1.5 text-[13px] text-muted hover:text-fg">History</Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
        <Section title="Templates">
          <ToolGrid tools={toolsInCategory("business").filter((t) => t.href?.startsWith("/business/templates"))} />
        </Section>
      </div>
    </PageContainer>
  );
}
