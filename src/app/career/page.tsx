import { PageContainer, PageHeader, Section } from "@/components/layout/page-header";
import { ToolGrid } from "@/components/tools/tool-card";
import { CareerDashboard } from "@/features/career/career-dashboard";
import { pageMetadata } from "@/lib/seo";
import { toolsInCategory } from "@/lib/tools/registry";

export const metadata = pageMetadata({
  title: "Career documents",
  description: "ATS-friendly resume builder, ATS checker, job matching, bullet analyzer and cover letters — no AI required.",
  path: "/career",
});

export default function CareerPage() {
  return (
    <PageContainer>
      <PageHeader title="Career" description="Build ATS-friendly resumes, tailor them to jobs and write cover letters. Deterministic analysis — nothing is invented about you." />
      <div className="flex flex-col gap-10">
        <Section title="Tools">
          <ToolGrid tools={toolsInCategory("career")} />
        </Section>
        <Section title="Your career documents">
          <CareerDashboard />
        </Section>
      </div>
    </PageContainer>
  );
}
