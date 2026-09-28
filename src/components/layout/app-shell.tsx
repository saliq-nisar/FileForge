"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown, CircleHelp, FolderOpen, Grid3x3, Home, Menu, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Search, Settings, ShieldCheck, Sun, User,
} from "lucide-react";
import { ToolIcon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { Kbd } from "@/components/ui/misc";
import { NAVIGATION, SITE, type NavGroup } from "@/lib/constants/navigation";
import { cn } from "@/lib/utils/cn";
import { applyAppearance, useSettings } from "@/stores/settings-store";
import { useUi } from "@/stores/ui-store";
import { CommandPalette } from "./command-palette";
import { Toaster } from "./toaster";

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 rounded-md font-semibold tracking-tight" aria-label={`${SITE.name} home`}>
      <span className="flex size-7 items-center justify-center rounded-md bg-accent text-accent-fg">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 3h8l4 4v14H6z" />
          <path d="M9 13h6M9 17h4" />
        </svg>
      </span>
      {!compact && <span className="hidden text-[15px] min-[360px]:inline">{SITE.name}</span>}
    </Link>
  );
}

function isActive(pathname: string, href: string): boolean {
  const path = href.split("#")[0];
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

function NavTree({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // The group containing the current page is expanded unless the user collapsed it.
  const currentGroup = NAVIGATION.find((g) => g.children?.some((c) => isActive(pathname, c.href) && !c.href.includes("#")))?.id;

  const item = (g: NavGroup) => {
    if (g.href) {
      const active = isActive(pathname, g.href);
      return (
        <Link
          href={g.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          title={collapsed ? g.label : undefined}
          className={cn(
            "flex h-9 items-center gap-3 rounded-md px-2.5 text-sm transition-colors",
            active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-bg-subtle hover:text-fg",
            collapsed && "justify-center px-0",
          )}
        >
          <ToolIcon name={g.icon} size={17} />
          {!collapsed && g.label}
        </Link>
      );
    }
    const expanded = open[g.id] ?? g.id === currentGroup;
    if (collapsed) {
      return (
        <Link href={g.children?.[g.children.length - 1]?.href ?? "/tools"} title={g.label} onClick={onNavigate} className="flex h-9 items-center justify-center rounded-md text-muted hover:bg-bg-subtle hover:text-fg">
          <ToolIcon name={g.icon} size={17} />
          <span className="sr-only">{g.label}</span>
        </Link>
      );
    }
    return (
      <>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={`nav-${g.id}`}
          onClick={() => setOpen((o) => ({ ...o, [g.id]: !expanded }))}
          className="flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-sm text-muted transition-colors hover:bg-bg-subtle hover:text-fg"
        >
          <ToolIcon name={g.icon} size={17} />
          <span className="flex-1 text-left">{g.label}</span>
          <ChevronDown className={cn("size-4 text-subtle transition-transform", expanded && "rotate-180")} aria-hidden="true" />
        </button>
        {expanded && (
          <ul id={`nav-${g.id}`} className="mb-1 ml-[1.35rem] border-l border-border pl-2.5">
            {g.children?.map((c) => {
              const active = isActive(pathname, c.href) && !c.href.includes("#");
              return (
                <li key={c.href + c.label}>
                  <Link
                    href={c.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn("flex h-8 items-center rounded-md px-2 text-[13px] transition-colors", active ? "font-medium text-accent" : "text-muted hover:text-fg")}
                  >
                    {c.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </>
    );
  };

  return (
    <nav aria-label="Main" className="flex flex-1 flex-col">
      <ul className="flex flex-col gap-0.5">
        {NAVIGATION.map((g) => (
          <li key={g.id}>{item(g)}</li>
        ))}
      </ul>
      <div className="mt-auto flex flex-col gap-0.5 border-t border-border pt-3">
        {item({ id: "settings", label: "Settings", icon: "settings", href: "/settings" })}
        {!collapsed && (
          <Link href="/privacy" onClick={onNavigate} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-xs text-subtle hover:text-fg">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Files are processed in your browser
          </Link>
        )}
      </div>
    </nav>
  );
}

function ThemeMenu() {
  const theme = useSettings((s) => s.theme);
  const update = useSettings((s) => s.update);
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <Dropdown
      label="Theme"
      items={[
        { label: "Light", icon: <Sun className="size-4" />, onSelect: () => update({ theme: "light" }) },
        { label: "Dark", icon: <Moon className="size-4" />, onSelect: () => update({ theme: "dark" }) },
        { label: "System", icon: <Monitor className="size-4" />, onSelect: () => update({ theme: "system" }) },
      ]}
      trigger={(p) => (
        <IconButton label={`Theme: ${theme}`} {...p}>
          <Icon className="size-[18px]" />
        </IconButton>
      )}
    />
  );
}

function ProfileMenu() {
  const router = useRouter();
  return (
    <Dropdown
      label="Account"
      items={[
        { label: "Workspace", icon: <FolderOpen className="size-4" />, onSelect: () => router.push("/workspace") },
        { label: "Settings", icon: <Settings className="size-4" />, onSelect: () => router.push("/settings") },
        { label: "Privacy", icon: <ShieldCheck className="size-4" />, onSelect: () => router.push("/privacy") },
      ]}
      trigger={(p) => (
        <button {...p} type="button" aria-label="Account menu — local mode, no account" title="Local mode — no account needed" className="ml-1 flex size-9 items-center justify-center rounded-full border border-border bg-bg-subtle text-muted hover:text-fg">
          <User className="size-4" aria-hidden="true" />
        </button>
      )}
    />
  );
}

/** Keeps <html> class/data attributes in sync with preferences and the OS theme. */
function AppearanceSync() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    void useUi.persist.rehydrate();
    void Promise.resolve(useSettings.persist.rehydrate()).then(() => setHydrated(true));
  }, []);
  const theme = useSettings((s) => s.theme);
  const motion = useSettings((s) => s.motion);
  useEffect(() => {
    if (!hydrated) return; // the inline theme script already applied the saved theme
    applyAppearance(theme, motion);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyAppearance(theme, motion);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [hydrated, theme, motion]);
  return null;
}

const MOBILE_TABS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/tools", label: "Tools", icon: Grid3x3 },
  { href: "#search", label: "Search", icon: Search },
  { href: "/workspace", label: "Files", icon: FolderOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const setCollapsed = useUi((s) => s.setSidebarCollapsed);
  const mobileOpen = useUi((s) => s.mobileNavOpen);
  const setMobileOpen = useUi((s) => s.setMobileNavOpen);
  const setSearchOpen = useUi((s) => s.setSearchOpen);
  const showHints = useSettings((s) => s.showShortcutHints && s.shortcutsEnabled);
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh flex-col">
      <AppearanceSync />
      <a href="#main" className="sr-only z-[70] rounded-md bg-surface px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 flex h-[var(--header-h)] items-center gap-2 border-b border-border bg-surface/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-surface/75 sm:px-4">
        <IconButton label="Open navigation" className="lg:hidden" onClick={() => setMobileOpen(true)}>
          <Menu className="size-5" />
        </IconButton>
        <IconButton label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="hidden lg:inline-flex" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
        </IconButton>
        <Logo />
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="mx-auto hidden h-9 w-full max-w-md items-center gap-2 rounded-md border border-border bg-bg px-3 text-sm text-subtle transition-colors hover:border-border-strong sm:flex"
        >
          <Search className="size-4" aria-hidden="true" />
          <span className="flex-1 text-left">Search tools…</span>
          {showHints && <Kbd>Ctrl K</Kbd>}
        </button>
        <div className="ml-auto flex items-center gap-0.5 sm:ml-0">
          <IconButton label="Search tools" className="sm:hidden" onClick={() => setSearchOpen(true)}>
            <Search className="size-[18px]" />
          </IconButton>
          <Link href="/privacy" aria-label="Help and privacy" title="Help & privacy" className="hidden size-10 items-center justify-center rounded-md text-muted hover:bg-bg-subtle hover:text-fg sm:inline-flex">
            <CircleHelp className="size-[18px]" aria-hidden="true" />
          </Link>
          <ThemeMenu />
          <ProfileMenu />
        </div>
      </header>

      <div className="flex flex-1">
        <aside
          className={cn(
            "sticky top-[var(--header-h)] hidden h-[calc(100dvh-var(--header-h))] shrink-0 flex-col overflow-y-auto border-r border-border bg-surface px-3 py-4 transition-[width] duration-200 lg:flex",
            collapsed ? "w-16" : "w-[var(--sidebar-w)]",
          )}
        >
          <NavTree collapsed={collapsed} />
        </aside>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 pb-20 outline-none lg:pb-0">
          {children}
        </main>
      </div>

      <Dialog open={mobileOpen} onClose={() => setMobileOpen(false)} title="Navigation" variant="left" hideTitle>
        <div className="-mx-2 flex min-h-[calc(100dvh-5rem)] flex-col">
          <div className="mb-4 px-2">
            <Logo />
          </div>
          <NavTree onNavigate={() => setMobileOpen(false)} />
        </div>
      </Dialog>

      <nav aria-label="Quick" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur lg:hidden">
        <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
          {MOBILE_TABS.map((t) => {
            const active = t.href !== "#search" && isActive(pathname, t.href);
            const content = (
              <>
                <t.icon className="size-5" aria-hidden="true" />
                <span className="text-[11px]">{t.label}</span>
              </>
            );
            const cls = cn("flex h-full w-full flex-col items-center justify-center gap-1", active ? "text-accent" : "text-muted");
            return (
              <li key={t.label}>
                {t.href === "#search" ? (
                  <button type="button" className={cls} onClick={() => setSearchOpen(true)}>
                    {content}
                  </button>
                ) : (
                  <Link href={t.href} className={cls} aria-current={active ? "page" : undefined}>
                    {content}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <CommandPalette />
      <Toaster />
    </div>
  );
}
