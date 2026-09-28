import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { CoverLetterBuilder } from "@/features/career/cover-letter";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "Cover Letter Builder", description: "Write a cover letter from your resume and the job description. Export to PDF or Word.", path: "/career/cover-letter" });

export default function CoverLetterPage() {
  return (
    <PageContainer wide>
      <PageHeader title="Cover Letter" description="Generated only from your resume and what you type — edit it freely before exporting." breadcrumbs={[{ label: "Career", href: "/career" }]} />
      <CoverLetterBuilder />
    </PageContainer>
  );
}
