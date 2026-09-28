import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { SettingsView } from "@/features/settings/settings-view";
import { pageMetadata } from "@/lib/seo";

export const metadata = { ...pageMetadata({ title: "Settings", description: "Appearance, processing defaults, privacy and accessibility.", path: "/settings" }), robots: { index: false } };

export default function SettingsPage() {
  return (
    <PageContainer>
      <PageHeader title="Settings" description="Preferences are saved in this browser." />
      <SettingsView />
    </PageContainer>
  );
}
