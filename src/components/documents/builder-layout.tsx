"use client";

import { useState, type ReactNode } from "react";
import { Eye, PenLine } from "lucide-react";
import { Segmented } from "@/components/ui/form";

/**
 * Split editor/preview layout. Desktop: side by side. Mobile: a toggle switches
 * between the editor and the live preview.
 */
export function BuilderLayout({ editor, preview, previewTitle = "Live preview" }: { editor: ReactNode; preview: ReactNode; previewTitle?: string }) {
  const [view, setView] = useState<"edit" | "preview">("edit");
  return (
    <>
      <div className="mb-4 lg:hidden">
        <Segmented
          label="Editor or preview"
          value={view}
          onChange={setView}
          options={[
            { value: "edit", label: <span className="inline-flex items-center gap-1.5"><PenLine className="size-3.5" aria-hidden="true" />Edit</span> },
            { value: "preview", label: <span className="inline-flex items-center gap-1.5"><Eye className="size-3.5" aria-hidden="true" />Preview</span> },
          ]}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className={view === "edit" ? "min-w-0" : "hidden min-w-0 lg:block"}>{editor}</div>
        <div className={view === "preview" ? "min-w-0" : "hidden min-w-0 lg:block"}>
          <div className="lg:sticky lg:top-[calc(var(--header-h)+1.5rem)]">
            <p className="mb-2 hidden text-xs font-medium text-subtle lg:block">{previewTitle}</p>
            <div className="max-h-[calc(100dvh-var(--header-h)-5rem)] overflow-y-auto rounded-lg bg-bg-subtle p-3 sm:p-5">{preview}</div>
          </div>
        </div>
      </div>
    </>
  );
}
