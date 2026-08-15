"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CountBadge } from "@/components/ui/count-badge";
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
        <CountBadge count={count} accentClassName="border-[var(--dir-accent-line)]" />
      </Link>
    </Button>
  );
}

