"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Eye, FolderOpen, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { FilePreview } from "@/components/files/file-preview";
import { IconButton, buttonClasses } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { Badge, EmptyState, LoadingState, Notice } from "@/components/ui/misc";
import { Tabs } from "@/components/ui/tabs";
import { formatOf } from "@/lib/file/formats";
import { formatBytes } from "@/lib/file/size";
import { downloadBlob } from "@/lib/utils/download";
import type { WorkspaceItem } from "@/services/storage/workspace-repository";
import { useSettings } from "@/stores/settings-store";
import { toast } from "@/stores/toast-store";
import { getWorkspaceBlob, useWorkspace } from "@/stores/workspace-store";
import type { FileKind } from "@/types/files";

type Tab = "recent" | "pdf" | "image" | "document" | "converted" | "compressed";

const TABS: Array<{ value: Tab; label: string; match: (i: WorkspaceItem) => boolean }> = [
  { value: "recent", label: "Recent", match: () => true },
  { value: "pdf", label: "PDFs", match: (i) => i.family === "pdf" },
  { value: "image", label: "Images", match: (i) => i.family === "image" },
  { value: "document", label: "Documents", match: (i) => i.family === "document" || i.family === "text" },
  { value: "converted", label: "Converted", match: (i) => i.tags.includes("converted") },
  { value: "compressed", label: "Compressed", match: (i) => i.tags.includes("compressed") },
];

const MIME_KIND: Record<string, FileKind> = { "application/pdf": "pdf", "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "text/plain": "text", "text/csv": "csv" };

export function WorkspaceView() {
  const { items, loaded, load, rename, remove, clear } = useWorkspace();
  const keepFiles = useSettings((s) => s.workspaceKeepFiles);
  const historyOn = useSettings((s) => s.workspaceHistory);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("recent");
  const [preview, setPreview] = useState<{ item: WorkspaceItem; blob: Blob } | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => items.filter(TABS.find((t) => t.value === tab)!.match), [items, tab]);

  const withBlob = async (item: WorkspaceItem, fn: (b: Blob) => void) => {
    const blob = item.hasBlob ? await getWorkspaceBlob(item.id) : undefined;
    if (!blob) return toast.info("This file wasn't kept. Turn on “Keep processed files” in Settings to re-download from the workspace.");
    fn(blob);
  };

  const actions = (item: WorkspaceItem) => [
    { label: "Open", icon: <Eye className="size-4" />, disabled: !item.hasBlob, onSelect: () => void withBlob(item, (blob) => setPreview({ item, blob })) },
    { label: "Download", icon: <Download className="size-4" />, disabled: !item.hasBlob, onSelect: () => void withBlob(item, (blob) => downloadBlob(blob, item.name, item.mime)) },
    {
      label: "Rename",
      icon: <Pencil className="size-4" />,
      onSelect: () => {
        const name = window.prompt("Rename file", item.name);
        if (name?.trim()) void rename(item.id, name.trim());
      },
    },
    { label: "Process again", icon: <RotateCcw className="size-4" />, onSelect: () => router.push(`/tools/${item.toolSlug}`) },
    { label: "Delete", icon: <Trash2 className="size-4" />, danger: true, onSelect: () => void remove(item.id) },
  ];

  if (!loaded) return <LoadingState />;

  return (
    <div className="flex flex-col gap-4">
      {!historyOn && <Notice tone="info">Workspace history is turned off in Settings, so new results aren&apos;t recorded.</Notice>}
      {historyOn && !keepFiles && <Notice tone="info">Only file details are recorded. To re-download results later, turn on “Keep processed files in this browser” in <Link href="/settings" className="underline">Settings</Link>.</Notice>}
      <Tabs label="File filters" value={tab} onChange={setTab} tabs={TABS.map((t) => ({ value: t.value, label: t.label, count: items.filter(t.match).length }))} />
      {visible.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState icon={<FolderOpen className="size-6" />} title="No files yet" description="Upload a PDF, image, or document to get started. Processed files will appear here." action={<Link href="/tools" className={buttonClasses()}>Upload file</Link>} />
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 text-right font-medium">Size</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-2 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((i) => (
                  <tr key={i.id}>
                    <td className="max-w-72 px-4 py-2.5">
                      <p className="truncate font-medium" title={i.name}>{i.name}</p>
                      <p className="truncate text-xs text-muted">{i.toolName}</p>
                    </td>
                    <td className="px-4 py-2.5 text-muted">{formatOf(MIME_KIND[i.mime.split(";")[0]] ?? "unknown").kind === "unknown" ? i.mime.split(";")[0] : formatOf(MIME_KIND[i.mime.split(";")[0]]).label}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatBytes(i.size)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-muted">{new Date(i.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-2.5"><Badge tone={i.status === "completed" ? "success" : "danger"}>{i.status === "completed" ? "Completed" : "Failed"}</Badge></td>
                    <td className="px-2 py-2.5 text-right">
                      <Dropdown label={`Actions for ${i.name}`} items={actions(i)} trigger={(p) => <IconButton {...p} size="sm" label={`Actions for ${i.name}`}><MoreHorizontal className="size-4" /></IconButton>} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden">
            {visible.map((i) => (
              <li key={i.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.name}</p>
                  <p className="truncate text-xs text-muted">{i.toolName} · {formatBytes(i.size)} · {new Date(i.createdAt).toLocaleDateString()}</p>
                </div>
                <Dropdown label={`Actions for ${i.name}`} items={actions(i)} trigger={(p) => <IconButton {...p} size="sm" label={`Actions for ${i.name}`}><MoreHorizontal className="size-4" /></IconButton>} />
              </li>
            ))}
          </ul>
          <button type="button" className="self-start text-xs text-muted underline-offset-2 hover:text-danger hover:underline" onClick={() => { if (window.confirm("Remove every workspace entry and stored file from this browser?")) void clear(); }}>
            Clear workspace
          </button>
        </>
      )}
      <Dialog open={preview !== null} onClose={() => setPreview(null)} title={preview?.item.name ?? ""} size="lg">
        {preview && <FilePreview file={preview.blob} format={formatOf(MIME_KIND[preview.item.mime.split(";")[0]] ?? "unknown")} />}
      </Dialog>
    </div>
  );
}
