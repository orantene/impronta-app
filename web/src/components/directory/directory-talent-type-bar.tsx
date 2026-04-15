"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";
import { FilterChip, FilterChips } from "@/components/ui/filter-chips";
import type { DirectoryFilterOption } from "@/lib/directory/field-driven-filters";
import { cn } from "@/lib/utils";
import { commitDirectoryListingUrl } from "@/lib/directory/directory-url-navigation";
function pillLabel(label: string): string {
  const t = label.trim();
  if (!t) return t;
  return t.toUpperCase();
}

export function DirectoryTalentTypeBar({
  options,
  selectedIds,
  allLabel,
  barAriaLabel,
}: {
  options: DirectoryFilterOption[];
  selectedIds: string[];
  allLabel: string;
  /** Usually the facet label (e.g. “Talent type”, “Skills”) for the pill tablist. */
  barAriaLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const siblingIds = useMemo(() => new Set(options.map((o) => o.id)), [options]);
  const selectedInGroup = useMemo(
    () => selectedIds.filter((id) => siblingIds.has(id)),
    [selectedIds, siblingIds],
  );
  const activeId = selectedInGroup[0] ?? null;

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

  const setActiveTerm = (termId: string | null) => {
    const rest = selectedIds.filter((id) => !siblingIds.has(id));
    if (termId) {
      pushTax([...rest, termId]);
    } else {
      pushTax(rest);
    }
  };

  if (options.length === 0) return null;

  const pillClass = (on: boolean) =>
    cn(
      "snap-start shrink-0 max-w-[min(100%,14rem)] truncate rounded-full border-0 px-4 py-2 text-[11px] font-semibold tracking-[0.12em] shadow-none",
      on
        ? "border border-[var(--impronta-gold)] bg-[var(--impronta-gold)] !text-black"
        : "border border-[var(--impronta-gold-border)] bg-transparent text-[var(--impronta-muted)] hover:border-[var(--impronta-gold-dim)] hover:!text-zinc-200",
    );

  return (
    <FilterChips
      className={cn(
        "mb-4 flex-nowrap snap-x snap-proximity gap-2 overflow-x-auto scroll-pb-1 scroll-pl-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        pending && "pointer-events-none opacity-60",
      )}
      role="tablist"
      aria-label={barAriaLabel}
    >
      <FilterChip
        label={allLabel}
        selected={activeId == null}
        onClick={() => setActiveTerm(null)}
        className={pillClass(activeId == null)}
        role="tab"
        aria-selected={activeId == null}
      />
      {options.map((opt) => {
        const on = activeId === opt.id;
        return (
          <FilterChip
            key={opt.id}
            label={pillLabel(opt.label)}
            selected={on}
            onClick={() => setActiveTerm(on ? null : opt.id)}
            className={pillClass(on)}
            title={opt.label}
            role="tab"
            aria-selected={on}
          />
        );
      })}
    </FilterChips>
  );
}
