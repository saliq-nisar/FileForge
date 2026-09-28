"use client";

import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useToastStore } from "@/stores/toast-store";

const ICON = { success: CircleCheck, error: CircleAlert, info: Info, warning: TriangleAlert };
const TONE = { success: "text-success", error: "text-danger", info: "text-info", warning: "text-warning" };

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div aria-live="polite" aria-relevant="additions" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end">
      {toasts.map((t) => {
        const Icon = ICON[t.tone];
        return (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm shadow-lg animate-fade-in"
          >
            <Icon className={cn("mt-0.5 size-4 shrink-0", TONE[t.tone])} aria-hidden="true" />
            <p className="min-w-0 flex-1 leading-relaxed">{t.message}</p>
            <button type="button" onClick={() => dismiss(t.id)} className="-mr-1 rounded p-0.5 text-subtle hover:text-fg" aria-label="Dismiss notification">
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
