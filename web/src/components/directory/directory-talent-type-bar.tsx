"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";
import type { DirectoryFilterOption } from "@/lib/directory/field-driven-filters";
import { cn } from "@/lib/utils";
import { commitDirectoryListingUrl } from "@/lib/directory/directory-url-navigation";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";

function pillLabel(label: string): string {
  const t = label.trim();
  if (!t) return t;
  return t.toUpperCase();
}

export function DirectoryTalentTypeBar({
  options,
  selectedIds,
  talentType,
}: {
  options: DirectoryFilterOption[];
  selectedIds: string[];
  talentType: DirectoryUiCopy["talentType"];
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

  const setTalentType = (termId: string | null) => {
    const rest = selectedIds.filter((id) => !siblingIds.has(id));
    if (termId) {
      pushTax([...rest, termId]);
    } else {
      pushTax(rest);
    }
  };

  if (options.length === 0) return null;

  return (
    <div
      className={cn(
        "mb-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        pending && "pointer-events-none opacity-60",
      )}
      role="tablist"
      aria-label={talentType.barAria}
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeId == null}
        onClick={() => setTalentType(null)}
        className={cn(
          "shrink-0 rounded-full border px-4 py-2 text-[11px] font-semibold tracking-[0.12em] transition-colors",
          activeId == null
            ? "border-[var(--impronta-gold)] bg-[var(--impronta-gold)] text-black"
            : "border-[var(--impronta-gold-border)] bg-transparent text-[var(--impronta-muted)] hover:border-[var(--impronta-gold-dim)] hover:text-zinc-200",
        )}
      >
        {talentType.all}
      </button>
      {options.map((opt) => {
        const on = activeId === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => setTalentType(on ? null : opt.id)}
            className={cn(
              "max-w-[min(100%,14rem)] shrink-0 truncate rounded-full border px-4 py-2 text-[11px] font-semibold tracking-[0.12em] transition-colors",
              on
                ? "border-[var(--impronta-gold)] bg-[var(--impronta-gold)] text-black"
                : "border-[var(--impronta-gold-border)] bg-transparent text-[var(--impronta-muted)] hover:border-[var(--impronta-gold-dim)] hover:text-zinc-200",
            )}
            title={opt.label}
          >
            {pillLabel(opt.label)}
          </button>
        );
      })}
    </div>
  );
}
