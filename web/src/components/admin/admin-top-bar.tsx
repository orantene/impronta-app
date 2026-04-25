"use client";

/**
 * AdminTopBar — contextual mini-bar for /admin/site-settings/*.
 *
 * The breadcrumb + tier chip + locale + theme + Cmd+K previously lived here
 * (and on a SECOND row above the prototype shell's search bar). The audit
 * refactor consolidated all of that into the shell's single sticky header
 * (`admin-prototype-shell.tsx`). What remains is the contextual
 * "Publish via Composer" pill that surfaces on every /admin/site-settings/*
 * page except the composer itself, and a "Public site" link.
 *
 * Returns null on every other route so we don't add a second band of
 * chrome above page content.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

export function AdminTopBar() {
  const pathname = usePathname() ?? "/admin";
  const isSiteArea = pathname.startsWith("/admin/site-settings");
  const isComposer = pathname.startsWith("/admin/site-settings/structure");
  const showPublishPill = isSiteArea && !isComposer;

  if (!isSiteArea || isComposer) return null;

  return (
    <div
      className={cn(
        "flex w-full items-center justify-end gap-2 border-b border-[rgba(24,24,27,0.06)]",
        "bg-background/80 px-4 py-1.5 backdrop-blur-sm sm:px-6 lg:px-8",
      )}
    >
      {showPublishPill ? (
        <Link
          href="/admin/site-settings/structure"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-foreground/30",
            "bg-foreground/[0.06] px-3 py-1 text-[11px] font-semibold text-foreground",
            "transition-colors hover:border-foreground/50 hover:bg-foreground/10",
          )}
          title="Open the composer to review and publish pending draft changes."
        >
          <Rocket className="size-3" aria-hidden />
          Publish via Composer
        </Link>
      ) : null}
      <a
        href="/"
        target="_blank"
        rel="noreferrer noopener"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border/60",
          "bg-background/70 px-3 py-1 text-[11px] font-medium text-muted-foreground",
          "transition-colors hover:border-foreground/40 hover:text-foreground",
        )}
        title="Open the public site in a new tab"
      >
        <ExternalLink className="size-3" aria-hidden />
        Public site
      </a>
    </div>
  );
}
