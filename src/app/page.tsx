import Link from "next/link";
import { ArrowRight, Cpu, Lock, Server } from "lucide-react";
import { PageContainer, Section } from "@/components/layout/page-header";
import { DashboardSearch } from "@/components/tools/dashboard-search";
import { ToolGrid } from "@/components/tools/tool-card";
import { ToolIcon } from "@/components/ui/icon";
import { CATEGORIES } from "@/lib/tools/categories";
import { popularTools, toolsInCategory } from "@/lib/tools/registry";

export default function DashboardPage() {
  return (
    <PageContainer>
      <section className="pb-10 pt-4 sm:pb-14 sm:pt-10">
        <p className="mb-3 text-[13px] font-medium text-accent">PDF · Images · Documents · Business · Career</p>
        <h1 className="max-w-3xl text-[32px] font-semibold leading-[1.1] tracking-tight sm:text-5xl">All your files. One powerful workspace.</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
          Convert, compress, edit, merge, split, optimize and transform your PDFs, images and documents from one place.
        </p>
        <div className="mt-8 max-w-2xl">
          <DashboardSearch />
        </div>
        <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-muted">
          <li className="flex items-center gap-1.5">
            <Cpu className="size-4 text-success" aria-hidden="true" /> Most tools run in your browser
          </li>
          <li className="flex items-center gap-1.5">
            <Lock className="size-4 text-success" aria-hidden="true" /> No account required
          </li>
          <li className="flex items-center gap-1.5">
            <Server className="size-4 text-subtle" aria-hidden="true" /> Server tools are clearly labeled
          </li>
        </ul>
      </section>

      <div className="flex flex-col gap-12">
        <Section title="Popular tools" id="popular">
          <ToolGrid tools={popularTools()} />
        </Section>

        <Section title="Categories" id="categories">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {CATEGORIES.map((c) => {
              const count = toolsInCategory(c.id).length;
              const href = c.id === "business" ? "/business" : c.id === "career" ? "/career" : `/tools#${c.id}`;
              return (
                <li key={c.id}>
                  <Link href={href} className="group flex h-full flex-col gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong">
                    <span className="flex size-9 items-center justify-center rounded-md" style={{ color: c.color, backgroundColor: `color-mix(in srgb, ${c.color} 12%, transparent)` }}>
                      <ToolIcon name={c.icon} />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{c.name}</span>
                      <span className="mt-0.5 block text-xs text-muted">{count} tools</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>

        <div className="grid gap-4 md:grid-cols-2">
          <Link href="/career/ats?mode=job" className="group rounded-lg border border-border bg-surface p-6 transition-colors hover:border-border-strong">
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--cat-career)" }}>Career</p>
            <h2 className="mt-2 text-lg font-semibold">Tailor your resume to a job</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">Paste a job description, see which requirements your resume already covers, and export a clean ATS-friendly version. No AI needed, nothing invented.</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
              Start <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </Link>
          <Link href="/business/invoice/new" className="group rounded-lg border border-border bg-surface p-6 transition-colors hover:border-border-strong">
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--cat-business)" }}>Business</p>
            <h2 className="mt-2 text-lg font-semibold">Create an invoice in a minute</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">Automatic totals, multiple taxes, professional templates, PDF and Word export. Your business details can be remembered on this device.</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
              Create invoice <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}
