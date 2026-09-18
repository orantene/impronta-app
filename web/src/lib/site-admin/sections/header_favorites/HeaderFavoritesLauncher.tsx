"use client";

import { usePathname, useRouter } from "next/navigation";
import { Bookmark, Heart } from "lucide-react";
import { clientDirectoryHref } from "@/i18n/client-directory-href";
import { useOptionalDirectoryInquiryModal } from "@/components/directory/directory-inquiry-modal-context";
import { usePublicDiscoveryStateOptional } from "@/components/directory/public-discovery-state";
import { CountBadge } from "@/components/ui/count-badge";
import { cn } from "@/lib/utils";
// Favorite-icon token swap (heart ⇄ bookmark), shared with the card + header icons.
import "@/components/talent-cards/talent-card-actions.css";

/**
 * The published header FAVORITES widget. Opens the ONE favorites surface, the
 * chat dock's Lineup view (Saved shelf + move-to-inquiry), exactly like the
 * heart in <DirectoryDiscoveryHeaderActions>. It used to link to the
 * /client/favorites page, which on a guest session is a dead end and on every
 * session is a second favorites surface (DOCK v2.1 retired that).
 *
 * The site header renders ABOVE the page's inquiry-modal provider, so the
 * context is usually null here; ?inquiry=open is the fallback the in-provider
 * DirectoryInquiryUrlSync turns into an open cue.
 */
export function HeaderFavoritesLauncher({
  ariaLabel,
  initialCount,
}: {
  ariaLabel: string;
  initialCount: number;
}) {
  const discovery = usePublicDiscoveryStateOptional();
  const inquiryModal = useOptionalDirectoryInquiryModal();
  const pathname = usePathname();
  const router = useRouter();
  const count = discovery ? discovery.favoritesCount : initialCount;
  const has = count > 0;

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      data-header-widget="header_favorites"
      data-header-widget-mode="live"
      data-discovery-header-favorites
      className="site-header-widget-embed site-header-widget-embed--favorites relative inline-flex size-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      onClick={() => {
        try {
          window.sessionStorage.setItem("impronta.dockView", "lineup");
        } catch {
          /* private mode */
        }
        if (inquiryModal) {
          inquiryModal.requestOpenChat();
          return;
        }
        router.push(clientDirectoryHref(pathname, "?inquiry=open"));
      }}
    >
      <Heart
        data-favorite-glyph="heart"
        className={cn("size-4", has && "text-[var(--accent-solid)]")}
        fill={has ? "currentColor" : "none"}
        aria-hidden
      />
      <Bookmark
        data-favorite-glyph="bookmark"
        className={cn("size-4", has && "text-[var(--accent-solid)]")}
        fill={has ? "currentColor" : "none"}
        aria-hidden
      />
      <CountBadge count={count} />
    </button>
  );
}
