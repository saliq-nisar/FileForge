"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** Menu button (WAI-ARIA menu pattern): arrow keys, Home/End, Escape, click-outside. */
export function Dropdown({ trigger, items, label, align = "end" }: { trigger: (props: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "menu"; "aria-controls": string; id: string }) => ReactNode; items: MenuItem[]; label: string; align?: "start" | "end" }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const buttonId = useId();
  const root = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current.find((el) => el && !el.disabled)?.focus();
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    document.getElementById(buttonId)?.focus();
  };

  const move = (dir: number) => {
    const enabled = itemRefs.current.filter((el): el is HTMLButtonElement => Boolean(el && !el.disabled));
    const i = enabled.indexOf(document.activeElement as HTMLButtonElement);
    enabled[(i + dir + enabled.length) % enabled.length]?.focus();
  };

  return (
    <div ref={root} className="relative">
      {trigger({ onClick: () => setOpen((o) => !o), "aria-expanded": open, "aria-haspopup": "menu", "aria-controls": menuId, id: buttonId })}
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          aria-labelledby={buttonId}
          className={cn("absolute z-50 mt-1 min-w-44 rounded-md border border-border bg-surface p-1 shadow-lg animate-fade-in", align === "end" ? "right-0" : "left-0")}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") move(1);
            else if (e.key === "ArrowUp") move(-1);
            else if (e.key === "Escape" || e.key === "Tab") close();
            else return;
            e.preventDefault();
          }}
        >
          {items.map((item, i) => (
            <button
              key={item.label}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              role="menuitem"
              type="button"
              tabIndex={-1}
              disabled={item.disabled}
              onClick={() => {
                close();
                item.onSelect();
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm transition-colors disabled:opacity-40",
                item.danger ? "text-danger hover:bg-danger-soft focus-visible:bg-danger-soft" : "text-fg hover:bg-bg-subtle focus-visible:bg-bg-subtle",
                "focus-visible:outline-none",
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
