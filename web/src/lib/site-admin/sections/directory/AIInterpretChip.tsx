"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { commitDirectoryListingUrl } from "@/lib/directory/directory-url-navigation";

/**
 * B6 — AI applied chip.
 *
 * When the hero search's `/api/ai/interpret-search` succeeds it
 * writes the interpretation summary to `?ai_sum=…` and refines the
 * URL in place (via `commitDirectoryListingUrl` → `router.replace`).
 * This chip surfaces the interpretation back to the visitor so they
 * understand WHY the filtered grid looks like it does, with a one-
 * click escape hatch back to the unfiltered roster.
 *
 * Clear behavior: removes every param the AI interpret writes
 * (`ai_sum`, `q`, `tax`, `location`, height/age ranges). Manual
 * filters applied separately (e.g. a sidebar selection that doesn't
 * overlap with the AI's outputs) survive because they live under
 * different params (`ff`, `sort`, etc.).
 */
export function AIInterpretChip({ summary }: { summary: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  if (!summary.trim()) return null;

  const handleClear = () => {
    startTransition(() => {
      commitDirectoryListingUrl(
        router,
        pathname,
        searchParams.toString(),
        (params) => {
          params.delete("ai_sum");
          params.delete("q");
          params.delete("tax");
          params.delete("location");
          params.delete("hmin");
          params.delete("hmax");
          params.delete("amin");
          params.delete("amax");
        },
      );
    });
  };

  return (
    <div
      data-directory-ai-chip
      className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-[12px] leading-snug text-foreground/80"
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden
        className="inline-flex size-1.5 shrink-0 rounded-full bg-[var(--dir-accent)]"
      />
      <span className="min-w-0 flex-1 truncate">
        <span className="mr-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/60">
          AI applied
        </span>
        <span className="text-foreground">{summary}</span>
      </span>
      <button
        type="button"
        onClick={handleClear}
        disabled={pending}
        className="shrink-0 rounded-full border border-border bg-transparent px-3 py-1 text-[11px] font-medium tracking-wide text-muted-foreground outline-none transition-colors hover:border-foreground/35 hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
      >
        Clear AI
      </button>
    </div>
  );
}
