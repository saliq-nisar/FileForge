import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { WorkspaceView } from "@/features/workspace/workspace-view";
import { pageMetadata } from "@/lib/seo";

export const metadata = { ...pageMetadata({ title: "Workspace", description: "Your recently processed files.", path: "/workspace" }), robots: { index: false } };

export default function WorkspacePage() {
  return (
    <PageContainer>
      <PageHeader title="Workspace" description="Recently processed files, stored only in this browser. No account needed." />
      <WorkspaceView />
    </PageContainer>
  );
}
