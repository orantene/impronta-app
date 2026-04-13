"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";
import type { TaxonomyFilterOption } from "@/lib/directory/taxonomy-filters";
import { cn } from "@/lib/utils";
import { commitDirectoryListingUrl } from "@/lib/directory/directory-url-navigation";

export function DirectoryTaxonomyBar({
  options,
  selectedIds,
  copy,
}: {
  options: TaxonomyFilterOption[];
  selectedIds: string[];
  copy: { clearFilters: string; groupAria: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const pushTax = useCallback(
    (nextIds: string[]) => {
      startTransition(() => {
        commitDirectoryListingUrl(router, pathname, searchParams.toString(), (p) => {
          if (nextIds.length > 0) {
            p.set("tax", [...nextIds].sort().join(","));
          } else {
            p.delete("tax");
          }
        });
      });
    },
    [router, pathname, searchParams, startTransition],
  );

  const toggle = (id: string) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    pushTax([...next]);
  };

  const clear = () => pushTax([]);

  if (options.length === 0) return null;

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {selectedIds.length > 0 ? (
          <button
            type="button"
            onClick={clear}
            className="text-sm text-[var(--impronta-gold)] underline-offset-4 hover:underline"
          >
            {copy.clearFilters}
          </button>
        ) : null}
      </div>
      <div
        className={cn(
          "flex flex-wrap gap-2",
          pending && "pointer-events-none opacity-60",
        )}
        role="group"
        aria-label={copy.groupAria}
      >
        {options.map((opt) => {
          const on = selectedSet.has(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggle(opt.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                on
                  ? "border-[var(--impronta-gold)] bg-[rgba(212,175,55,0.12)] text-[var(--impronta-gold)]"
                  : "border-[var(--impronta-gold-border)] text-[var(--impronta-muted)] hover:border-[var(--impronta-gold-dim)] hover:text-zinc-200",
              )}
            >
              {opt.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
