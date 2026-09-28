"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { ToolIcon } from "@/components/ui/icon";
import { TOOLS, toolHref } from "@/lib/tools/registry";
import { searchTools } from "@/lib/tools/search";
import { cn } from "@/lib/utils/cn";

/** Hero search: "What do you want to do?" with inline suggestions. */
export function DashboardSearch() {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const router = useRouter();
  const listId = useId();
  const results = useMemo(() => searchTools(TOOLS, query, 6), [query]);
  const open = focused && query.trim().length > 0;

  const go = (i: number) => {
    const t = results[i];
    if (t) router.push(toolHref(t));
  };

  return (
    <div className="relative">
      <label htmlFor={`${listId}-input`} className="mb-2 block text-sm font-medium">
        What do you want to do?
      </label>
      <div className="flex h-12 items-center gap-3 rounded-lg border border-border-strong bg-surface px-4 shadow-sm focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15">
        <Search className="size-5 text-subtle" aria-hidden="true" />
        <input
          id={`${listId}-input`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
          value={query}
          placeholder="Compress a PDF"
          autoComplete="off"
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (!open) return;
            if (e.key === "ArrowDown") setActive((a) => Math.min(results.length - 1, a + 1));
            else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
            else if (e.key === "Enter") go(active);
            else if (e.key === "Escape") setQuery("");
            else return;
            e.preventDefault();
          }}
          className="h-full w-full bg-transparent text-base outline-none placeholder:text-subtle"
        />
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-label="Matching tools" className="absolute z-30 mt-2 w-full overflow-hidden rounded-lg border border-border bg-surface p-1.5 shadow-lg animate-fade-in">
          {results.length === 0 ? (
            <li className="px-3 py-4 text-sm text-muted">No matching tools. Try “merge”, “resize” or “invoice”.</li>
          ) : (
            results.map((t, i) => (
              <li
                key={t.slug}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(i)}
                onMouseMove={() => setActive(i)}
                className={cn("flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5", i === active && "bg-bg-subtle")}
              >
                <ToolIcon name={t.icon} size={16} className="text-muted" />
                <span className="text-sm font-medium">{t.name}</span>
                <span className="ml-auto hidden truncate text-xs text-subtle sm:block">{t.description}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
