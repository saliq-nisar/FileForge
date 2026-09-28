import { Suspense } from "react";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { LoadingState } from "@/components/ui/misc";
import { AtsChecker } from "@/features/career/ats-checker";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "ATS Resume Checker",
  description: "Estimate how well your resume reads in applicant tracking systems and compare it with a job description. Transparent scoring, no AI.",
  path: "/career/ats",
});

export default function AtsPage() {
  return (
    <PageContainer wide>
      <PageHeader title="ATS Checker" description="Upload or paste your resume, add a job description, and see exactly what helps or hurts — with documented, deterministic scoring." breadcrumbs={[{ label: "Career", href: "/career" }]} />
      <Suspense fallback={<LoadingState />}>
        <AtsChecker />
      </Suspense>
    </PageContainer>
  );
}
