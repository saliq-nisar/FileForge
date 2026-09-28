import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { BulletAnalyzer } from "@/features/career/bullet-analyzer";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "Resume Bullet Analyzer", description: "Find weak resume bullets and learn how to strengthen them — without inventing anything.", path: "/career/analyzer" });

export default function AnalyzerPage() {
  return (
    <PageContainer wide>
      <PageHeader title="Resume Bullet Analyzer" description="Checks action verbs, measurable impact, context, length and voice for each bullet." breadcrumbs={[{ label: "Career", href: "/career" }]} />
      <BulletAnalyzer />
    </PageContainer>
  );
}
