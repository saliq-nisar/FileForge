import { Suspense } from "react";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { LoadingState } from "@/components/ui/misc";
import { ResumeCompare } from "@/features/career/resume-compare";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "Compare Resumes", description: "See the differences between two resume versions.", path: "/career/compare" });

export default function ComparePage() {
  return (
    <PageContainer wide>
      <PageHeader title="Compare resumes" breadcrumbs={[{ label: "Career", href: "/career" }, { label: "My Resumes", href: "/career/resume" }]} />
      <Suspense fallback={<LoadingState />}>
        <ResumeCompare />
      </Suspense>
    </PageContainer>
  );
}
