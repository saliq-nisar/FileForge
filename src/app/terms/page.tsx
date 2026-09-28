import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "Terms of use", description: "Terms for using FileForge.", path: "/terms" });

export default function TermsPage() {
  return (
    <PageContainer>
      <PageHeader title="Terms of use" />
      <div className="flex max-w-3xl flex-col gap-4 text-sm leading-relaxed text-muted">
        <p>FileForge is provided “as is”, without warranty of any kind. Keep a copy of important originals before processing them.</p>
        <p>Only process files you have the right to use. The Unlock PDF tool requires the document&apos;s password and must only be used on documents you are authorized to open.</p>
        <p>Generated documents (invoices, letters, resumes, cover letters) are templates. You are responsible for their accuracy and for compliance with the laws that apply to you, including tax and employment regulations.</p>
        <p>Career tools never invent facts about you. Estimated ATS scores are diagnostic and don&apos;t guarantee any outcome with an employer.</p>
        <p>Operators who deploy this software are responsible for their own server configuration, retention settings and legal notices.</p>
      </div>
    </PageContainer>
  );
}
