"use client";

import { cn } from "@/lib/utils";

export type AISuggestionChip = {
  id: string;
  label: string;
};

type AISuggestionChipsProps = {
  chips: AISuggestionChip[];
  onSelect?: (id: string) => void;
  className?: string;
};

/** AI refine / query suggestions — visually softer than directory `FilterChip`. */
export function AISuggestionChips({
  chips,
  onSelect,
  className,
}: AISuggestionChipsProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="list">
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect?.(c.id)}
          className={cn(
            "rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-foreground",
            "transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/10",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
