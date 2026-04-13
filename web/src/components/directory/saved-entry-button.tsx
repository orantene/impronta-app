"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePublicDiscoveryState } from "@/components/directory/public-discovery-state";
import { cn } from "@/lib/utils";

export function SavedEntryButton({
  href,
  initialCount = 0,
  ariaLabel,
  className,
}: {
  href: string;
  initialCount?: number;
  /** Localized label (e.g. from `public.header.savedDirectoryAria`). */
  ariaLabel: string;
  className?: string;
}) {
  const { savedCount } = usePublicDiscoveryState();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const count = mounted ? savedCount : initialCount;

  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className={cn("relative shrink-0", className)}
    >
      <Link href={href} aria-label={ariaLabel}>
        <Bookmark className="size-5" />
        {count > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full border border-[var(--impronta-gold-border)] bg-black px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--impronta-gold)]">
            {count > 99 ? "99+" : String(count)}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}

