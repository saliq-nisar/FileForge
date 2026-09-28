"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { IconButton } from "./button";

/**
 * Accessible modal built on native <dialog>: focus is moved inside and trapped by
 * the browser, Escape closes it, and focus returns to the opener on close.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  variant = "center",
  hideTitle,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** center = modal; right/left = side drawer; bottom = bottom sheet (mobile). */
  variant?: "center" | "right" | "left" | "bottom";
  hideTitle?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      const opener = document.activeElement as HTMLElement | null;
      el.showModal();
      return () => {
        if (el.open) el.close();
        opener?.focus?.();
      };
    }
  }, [open]);

  const sizes = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  const placement = {
    center: cn("m-auto w-[calc(100%-2rem)] rounded-xl animate-fade-in", sizes[size]),
    right: "ml-auto mr-0 my-0 h-dvh max-h-dvh w-[min(24rem,100%)] rounded-none border-l",
    left: "mr-auto ml-0 my-0 h-dvh max-h-dvh w-[min(20rem,85%)] rounded-none border-r animate-slide-right",
    bottom: "mb-0 mt-auto mx-auto w-full max-w-2xl max-h-[85dvh] rounded-t-xl rounded-b-none animate-slide-up safe-bottom",
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // backdrop click
      }}
      className={cn("border border-border bg-surface p-0 text-fg shadow-lg backdrop:backdrop-blur-[1px]", placement[variant], className)}
    >
      {open && (
        <div className={cn("flex max-h-[inherit] flex-col", variant !== "center" && "h-full")}>
          <div className={cn("flex items-start justify-between gap-4 px-5 pt-4", hideTitle && "sr-only")}>
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 text-sm text-muted">
                  {description}
                </p>
              )}
            </div>
            <IconButton label="Close" size="sm" onClick={onClose} className="-mr-2 -mt-1">
              <X className="size-4" />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
