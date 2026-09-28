"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { ToolIcon } from "@/components/ui/icon";
import { Badge, Kbd } from "@/components/ui/misc";
import { popularTools, TOOLS, toolHref } from "@/lib/tools/registry";
import { searchTools } from "@/lib/tools/search";
import { cn } from "@/lib/utils/cn";
import { useSettings } from "@/stores/settings-store";
import { useUi } from "@/stores/ui-store";

/** Global tool search (Ctrl/⌘ + K). Combobox pattern with arrow-key navigation. */
export function CommandPalette() {
  const open = useUi((s) => s.searchOpen);
  const setOpen = useUi((s) => s.setSearchOpen);
  const shortcuts = useSettings((s) => s.shortcutsEnabled);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // Closing always resets the query so the palette reopens fresh.
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, [setOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shortcuts && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (useUi.getState().searchOpen) close();
        else setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen, shortcuts, close]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const results = useMemo(() => (query.trim() ? searchTools(TOOLS, query, 12) : popularTools()), [query]);

  const go = (i: number) => {
    const tool = results[i];
    if (!tool) return;
    close();
    router.push(toolHref(tool));
  };

  return (
    <Dialog open={open} onClose={close} title="Search tools" hideTitle size="lg" className="sm:mt-[12vh] sm:mb-auto">
      <div className="-mx-5 -mt-4">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-subtle" aria-hidden="true" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${results[active].slug}` : undefined}
            aria-label="What do you want to do?"
            placeholder="What do you want to do? e.g. compress a PDF"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setActive((a) => Math.min(results.length - 1, a + 1));
              else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
              else if (e.key === "Enter") go(active);
              else return;
              e.preventDefault();
            }}
            className="h-14 w-full bg-transparent text-[15px] outline-none placeholder:text-subtle"
          />
          <Kbd>Esc</Kbd>
        </div>
        <p className="px-4 pt-3 text-xs font-medium text-subtle">{query.trim() ? `${results.length} result${results.length === 1 ? "" : "s"}` : "Popular tools"}</p>
        <ul id={listId} role="listbox" aria-label="Tools" className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">No tools match “{query}”. Try “compress”, “merge” or “resume”.</li>}
          {results.map((tool, i) => (
            <li
              key={tool.slug}
              id={`${listId}-${tool.slug}`}
              role="option"
              aria-selected={i === active}
              onMouseMove={() => setActive(i)}
              onClick={() => go(i)}
              className={cn("flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5", i === active && "bg-bg-subtle")}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-muted">
                <ToolIcon name={tool.icon} size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{tool.name}</span>
                <span className="block truncate text-xs text-muted">{tool.description}</span>
              </span>
              {tool.status === "engine" && <Badge>Server</Badge>}
              {tool.status === "unavailable" && <Badge>Not available</Badge>}
              {i === active && <CornerDownLeft className="size-4 shrink-0 text-subtle" aria-hidden="true" />}
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
