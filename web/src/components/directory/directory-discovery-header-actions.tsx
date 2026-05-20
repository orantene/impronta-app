"use client";

import { useEffect, useState } from "react";
import { Bookmark, Send } from "lucide-react";
import { useDirectoryInquiryModal } from "@/components/directory/directory-inquiry-modal-context";
import { useFavoritesDrawer } from "@/components/directory/favorites-drawer-context";
import { usePublicDiscoveryState } from "@/components/directory/public-discovery-state";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type DirectoryDiscoveryHeaderCopy = {
  /** Bookmark icon (opens favorites drawer). */
  favoritesAria: string;
  favoritesTooltipEmpty: string;
  favoritesTooltipWithCount: string;
  /** Plane / Send icon (opens inquiry cart drawer). */
  inquiryAriaEmpty: string;
  inquiryAriaWithCart: string;
  inquiryTooltipEmpty: string;
  inquiryTooltipWithCart: string;
};

/**
 * Two-icon header control surfaced on every public page:
 *
 *   ♥ Bookmark  → opens the **favorites drawer** (personal saves list,
 *                 not yet tied to an inquiry).
 *   ✈ Send      → opens the **inquiry drawer** (current cart, the form
 *                 to submit an inquiry).
 *
 * Counts are independent. The bookmark badge reflects
 * `favoritesCount` (client_favorites + localStorage); the plane badge
 * reflects `savedCount` (saved_talent inquiry cart).
 */
export function DirectoryDiscoveryHeaderActions({
  initialFavoritesCount = 0,
  initialCartCount = 0,
  copy,
}: {
  initialFavoritesCount?: number;
  initialCartCount?: number;
  copy: DirectoryDiscoveryHeaderCopy;
}) {
  const { savedCount, favoritesCount } = usePublicDiscoveryState();
  const { openInquiry, saveCue } = useDirectoryInquiryModal();
  const favoritesDrawer = useFavoritesDrawer();
  const [mounted, setMounted] = useState(false);
  const [cueRing, setCueRing] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (saveCue === 0) return;
    setCueRing(true);
    const t = window.setTimeout(() => setCueRing(false), 1000);
    return () => window.clearTimeout(t);
  }, [saveCue]);

  const favCount = mounted ? favoritesCount : initialFavoritesCount;
  const cartCount = mounted ? savedCount : initialCartCount;
  const hasFavorites = favCount > 0;
  const hasCart = cartCount > 0;

  return (
    <TooltipProvider delayDuration={280}>
      <div className="flex items-center gap-0.5">
        {/* Bookmark / favorites */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="relative shrink-0"
              onClick={() => favoritesDrawer?.open()}
              aria-label={copy.favoritesAria}
              data-discovery-header-favorites
            >
              <Bookmark
                className={cn(
                  "size-5",
                  hasFavorites && "text-[var(--impronta-gold)]",
                )}
                fill={hasFavorites ? "currentColor" : "none"}
              />
              {favCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full border border-[var(--impronta-gold-border)] bg-black px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--impronta-gold)]">
                  {favCount > 99 ? "99+" : String(favCount)}
                </span>
              ) : null}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[220px]">
            {hasFavorites
              ? copy.favoritesTooltipWithCount.replace("{count}", String(favCount))
              : copy.favoritesTooltipEmpty}
          </TooltipContent>
        </Tooltip>

        {/* Plane / inquiry cart */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "relative shrink-0 transition-[box-shadow,transform] duration-500 ease-out",
                cueRing &&
                  "shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--impronta-gold)] scale-105",
              )}
              onClick={openInquiry}
              aria-label={
                hasCart ? copy.inquiryAriaWithCart : copy.inquiryAriaEmpty
              }
              data-discovery-header-inquiry
            >
              <Send
                className={cn(
                  "size-5",
                  hasCart && "text-[var(--impronta-gold)]",
                )}
                fill={hasCart ? "currentColor" : "none"}
              />
              {cartCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full border border-[var(--impronta-gold-border)] bg-black px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--impronta-gold)]">
                  {cartCount > 99 ? "99+" : String(cartCount)}
                </span>
              ) : null}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[240px]">
            {hasCart ? copy.inquiryTooltipWithCart : copy.inquiryTooltipEmpty}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
