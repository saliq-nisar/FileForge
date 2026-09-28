import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { ResumeList } from "@/features/career/resume-list";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "ATS Resume Builder",
  description: "Create ATS-friendly resumes step by step with live preview, an estimated ATS score and PDF/DOCX export.",
  path: "/career/resume",
});

export default function ResumesPage() {
  return (
    <PageContainer>
      <PageHeader title="My Resumes" description="Keep a version for each kind of role you apply to. Stored only in this browser." breadcrumbs={[{ label: "Career", href: "/career" }]} />
      <ResumeList />
    </PageContainer>
  );
}
