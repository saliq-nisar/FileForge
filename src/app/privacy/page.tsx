import Link from "next/link";
import { Cpu, HardDrive, Server, Trash2 } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { pageMetadata } from "@/lib/seo";
import { TOOLS, toolHref } from "@/lib/tools/registry";

export const metadata = pageMetadata({
  title: "Privacy & how processing works",
  description: "What happens to your files: which tools run in your browser, which run on the server, and when files are deleted.",
  path: "/privacy",
});

export default function PrivacyPage() {
  const serverTools = TOOLS.filter((t) => t.runtime === "server" && t.status !== "unavailable");
  return (
    <PageContainer>
      <PageHeader title="Privacy & how processing works" description="Plain answers about what happens to your files." />
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-5">
          <Cpu className="size-5 text-success" aria-hidden="true" />
          <h2 className="mt-3 font-semibold">Most tools run in your browser</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            PDF merging, splitting, compression and editing, image conversion and compression, OCR, document conversions to text, HTML, CSV and XLSX, invoices, resumes and ATS analysis all run on your device. Those files are never uploaded. The OCR engine and its English language model are served from this website, not from third-party servers.
          </p>
        </section>
        <section className="rounded-xl border border-border bg-surface p-5">
          <Server className="size-5 text-muted" aria-hidden="true" />
          <h2 className="mt-3 font-semibold">A few tools need the server</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            These are always labeled “Server” and only work if the operator of this deployment has enabled the engine:{" "}
            {serverTools.map((t, i) => (
              <span key={t.slug}>
                {i ? ", " : ""}
                <Link href={toolHref(t)} className="underline">
                  {t.name}
                </Link>
              </span>
            ))}
            . Files are sent over HTTPS, stored in a private temporary folder and processed without being shared.
          </p>
        </section>
        <section className="rounded-xl border border-border bg-surface p-5">
          <Trash2 className="size-5 text-muted" aria-hidden="true" />
          <h2 className="mt-3 font-semibold">When temporary files are deleted</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            For server tools, the uploaded file and the result are deleted as soon as your browser has retrieved the result. If that doesn&apos;t happen (for example, you close the tab), they expire after the retention window configured on the server (60 minutes by default) and are removed by a periodic cleanup.
          </p>
        </section>
        <section className="rounded-xl border border-border bg-surface p-5">
          <HardDrive className="size-5 text-muted" aria-hidden="true" />
          <h2 className="mt-3 font-semibold">What is stored in your browser</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Settings; the workspace list (and result files only if you turn that on); business details only if you ask to remember them; invoices and resumes only when you press Save. Resume drafts live in the current tab only. You can delete all of it from{" "}
            <Link href="/settings" className="underline">
              Settings
            </Link>
            . The application has no accounts, analytics or tracking cookies.
          </p>
        </section>
      </div>
      <section className="mt-8 max-w-3xl text-sm leading-relaxed text-muted">
        <h2 className="text-base font-semibold text-fg">ATS scores</h2>
        <p className="mt-2">ATS scores are estimates, not guarantees. Applicant tracking systems differ by employer, software, configuration and job description. The score is calculated from documented rules shown in the checker and is meant to help you find potential issues.</p>
        <h2 className="mt-6 text-base font-semibold text-fg">AI</h2>
        <p className="mt-2">No feature requires AI, and no core feature sends your data to an AI service. Any future AI features will be optional, clearly labeled, and off unless the operator configures them.</p>
      </section>
    </PageContainer>
  );
}
