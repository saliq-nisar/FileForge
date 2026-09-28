import Link from "next/link";
import { ToolIcon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/misc";
import { getCategory } from "@/lib/tools/categories";
import { toolHref } from "@/lib/tools/registry";
import { cn } from "@/lib/utils/cn";
import type { ToolDefinition } from "@/types/tools";

export function ToolCard({ tool, compact }: { tool: ToolDefinition; compact?: boolean }) {
  const color = getCategory(tool.category).color;
  return (
    <Link
      href={toolHref(tool)}
      className={cn(
        "group relative flex gap-3 rounded-lg border border-border bg-surface transition-[border-color,box-shadow,transform] duration-150",
        "hover:border-border-strong hover:shadow-md motion-safe:hover:-translate-y-px",
        compact ? "items-center p-3" : "flex-col p-4",
      )}
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-md"
        style={{ color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
      >
        <ToolIcon name={tool.icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-fg">{tool.name}</span>
          {tool.status === "engine" && <Badge>Server</Badge>}
          {tool.status === "unavailable" && <Badge>Coming later</Badge>}
        </span>
        {!compact && <span className="mt-1 line-clamp-2 block text-[13px] leading-relaxed text-muted">{tool.description}</span>}
      </span>
    </Link>
  );
}

export function ToolGrid({ tools, compact }: { tools: ToolDefinition[]; compact?: boolean }) {
  return (
    <ul className={cn("grid gap-3", compact ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4")}>
      {tools.map((t) => (
        <li key={t.slug} className="flex">
          <div className="w-full [&>a]:h-full">
            <ToolCard tool={t} compact={compact} />
          </div>
        </li>
      ))}
    </ul>
  );
}
