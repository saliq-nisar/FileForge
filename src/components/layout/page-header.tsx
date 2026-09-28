import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function PageContainer({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={`mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8 ${wide ? "max-w-[1600px]" : "max-w-6xl"}`}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  icon,
}: {
  title: string;
  description?: ReactNode;
  breadcrumbs?: Array<{ label: string; href: string }>;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <header className="mb-6 sm:mb-8">
      {breadcrumbs && (
        <nav aria-label="Breadcrumb" className="mb-3">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-subtle">
            {breadcrumbs.map((b) => (
              <li key={b.href} className="flex items-center gap-1">
                <Link href={b.href} className="rounded hover:text-fg">
                  {b.label}
                </Link>
                <ChevronRight className="size-3" aria-hidden="true" />
              </li>
            ))}
            <li aria-current="page" className="text-muted">
              {title}
            </li>
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {icon}
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-[28px]">{title}</h1>
            {description && <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Section({ title, description, children, id, action }: { title: string; description?: string; children: ReactNode; id?: string; action?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="scroll-mt-20">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 id={id ? `${id}-title` : undefined} className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
