"use client";

/**
 * AdminTopBar — contextual mini-bar for /admin/site-settings/*.
 *
 * The breadcrumb + tier chip + locale + theme + Cmd+K previously lived here
 * (and on a SECOND row above the prototype shell's search bar). The audit
 * refactor consolidated all of that into the shell's single sticky header
 * (`admin-prototype-shell.tsx`).
 *
 * What remains is one contextual "Open editor" pill that takes the operator
 * to the in-place storefront editor. The pill links to
 * `/admin/site-settings/structure` — a tiny server route that resolves the
 * tenant preview origin and bounces to `${origin}/?edit=1`. The storefront
 * EditChrome reads `edit=1` and auto-engages edit mode, so it's one click
 * from a settings sub-page into the live canvas on the correct host.
 *
 * The earlier version surfaced TWO pills here ("Open editor" and "Public
 * site"). They pointed to the same href and confused operators about which
 * one was the editing entry; the public-site link is now reached via the
 * tenant domain chip on the admin home, leaving this bar with the single
 * unambiguous editor handoff.
 *
 * Returns null on every other route so we don't add a second band of
 * chrome above page content.
 */

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export function AdminTopBar() {
  const pathname = usePathname() ?? "/admin";
  const isSiteArea = pathname.startsWith("/admin/site-settings");

  if (!isSiteArea) return null;

  return (
    <div
      className={cn(
        "flex w-full items-center justify-end gap-2 border-b border-[rgba(24,24,27,0.06)]",
        "bg-background/80 px-4 py-1.5 backdrop-blur-sm sm:px-6 lg:px-8",
      )}
    >
      <Link
        href="/admin/site-settings/structure"
        target="_blank"
        rel="noreferrer noopener"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-foreground/30",
          "bg-foreground/[0.06] px-3 py-1 text-[11px] font-semibold text-foreground",
          "transition-colors hover:border-foreground/50 hover:bg-foreground/10",
        )}
        title="Open the in-place editor on the storefront"
      >
        <Pencil className="size-3" aria-hidden />
        Open editor
      </Link>
    </div>
  );
}
