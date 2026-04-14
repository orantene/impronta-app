"use client";

import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

export type AIMatchExplanationItem = {
  id: string;
  text: string;
};

type AIMatchExplanationProps = {
  items: AIMatchExplanationItem[];
  className?: string;
  /** Localized accessible name; defaults to English. */
  ariaLabel?: string;
};

export function AIMatchExplanation({
  items,
  className,
  ariaLabel = "Why this match",
}: AIMatchExplanationProps) {
  if (!items.length) return null;
  return (
    <ul
      className={cn("space-y-1.5 text-sm text-muted-foreground", className)}
      aria-label={ariaLabel}
    >
      {items.map((item) => (
        <li key={item.id} className="flex gap-2">
          <Sparkles
            className="mt-0.5 size-3.5 shrink-0 text-primary/70"
            aria-hidden
          />
          <span className="text-foreground/90">{item.text}</span>
        </li>
      ))}
    </ul>
  );
}
