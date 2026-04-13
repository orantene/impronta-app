"use client";

import { useEffect, useState } from "react";
import { Bookmark, Sparkles } from "lucide-react";
import { useDirectoryInquiryModal } from "@/components/directory/directory-inquiry-modal-context";
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
  shortlistAria: string;
  shortlistTooltipEmpty: string;
  shortlistTooltipWithCount: string;
  inquirySparklesAriaEmpty: string;
  inquirySparklesAriaWithShortlist: string;
  inquiryTooltipEmpty: string;
  inquiryTooltipWithShortlist: string;
};

export function DirectoryDiscoveryHeaderActions({
  initialCount = 0,
  copy,
}: {
  initialCount?: number;
  copy: DirectoryDiscoveryHeaderCopy;
}) {
  const { savedCount } = usePublicDiscoveryState();
  const { openInquiry, saveCue } = useDirectoryInquiryModal();
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

  const count = mounted ? savedCount : initialCount;
  const hasShortlist = count > 0;

  return (
    <TooltipProvider delayDuration={280}>
    <div className="flex items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative shrink-0"
            onClick={openInquiry}
            aria-label={copy.shortlistAria}
          >
            <Bookmark className="size-5" />
            {count > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full border border-[var(--impronta-gold-border)] bg-black px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--impronta-gold)]">
                {count > 99 ? "99+" : String(count)}
              </span>
            ) : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[220px]">
          {hasShortlist
            ? copy.shortlistTooltipWithCount.replace("{count}", String(count))
            : copy.shortlistTooltipEmpty}
        </TooltipContent>
      </Tooltip>

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
              hasShortlist
                ? copy.inquirySparklesAriaWithShortlist
                : copy.inquirySparklesAriaEmpty
            }
          >
            <Sparkles className="size-5 text-[var(--impronta-gold)]" />
            {hasShortlist ? (
              <span className="absolute bottom-0.5 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-primary/90" />
            ) : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[240px]">
          {hasShortlist
            ? copy.inquiryTooltipWithShortlist
            : copy.inquiryTooltipEmpty}
        </TooltipContent>
      </Tooltip>
    </div>
    </TooltipProvider>
  );
}
