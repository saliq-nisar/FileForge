import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { QuickResume } from "@/features/career/quick-resume";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "Create a Resume in 5 Minutes", description: "Enter the essentials and get a clean, ATS-friendly resume as PDF or Word.", path: "/career/resume/quick" });

export default function QuickResumePage() {
  return (
    <PageContainer>
      <PageHeader title="Create a resume in 5 minutes" description="Just the essentials — we structure and format it for applicant tracking systems." breadcrumbs={[{ label: "Career", href: "/career" }]} />
      <QuickResume />
    </PageContainer>
  );
}
