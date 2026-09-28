import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { ResumeBuilderClient } from "@/features/career/resume-builder-client";

export const metadata: Metadata = { title: "Resume Builder", robots: { index: false } };

export default async function ResumeBuilderPage({ params }: PageProps<"/career/resume/[id]">) {
  const { id } = await params;
  if (!/^(new|[0-9a-f-]{36})$/i.test(id)) notFound();
  return (
    <PageContainer wide>
      <PageHeader title={id === "new" ? "Build your resume" : "Edit resume"} breadcrumbs={[{ label: "Career", href: "/career" }, { label: "My Resumes", href: "/career/resume" }]} />
      <ResumeBuilderClient id={id} />
    </PageContainer>
  );
}
