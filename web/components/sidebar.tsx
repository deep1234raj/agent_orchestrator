"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, GitBranch, Activity, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Sidebar.
 *
 * Five sections. The current section is marked with an amber bar on
 * the left and elevated background — subtle but unambiguous.
 *
 * Future destinations (Workflows / Runs / Channels / Dashboard) are
 * already wired in even though their pages don't exist yet; clicking
 * them will render Next.js's 404, which is correct: better to show
 * the full IA than to surprise reviewers later.
 */

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/workflows", label: "Workflows", icon: GitBranch },
  { href: "/runs", label: "Runs", icon: Activity },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-surface/40">
      {/* Brand */}
      <div className="px-5 pt-6 pb-8">
        <Link href="/" className="block group">
          <h1 className="font-display text-3xl tracking-tight leading-none text-fg">
            aaop
          </h1>
          <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-fg-subtle font-mono">
            agent orchestration
          </p>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 space-y-0.5">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-elevated text-fg"
                  : "text-fg-muted hover:text-fg hover:bg-elevated/40",
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 bg-accent rounded-r" />
              )}
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-border">
        <p className="text-[10px] font-mono uppercase tracking-wider text-fg-subtle">
          v0.1.0 · local
        </p>
      </div>
    </aside>
  );
}
