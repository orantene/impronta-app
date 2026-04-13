"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useTransition } from "react";
import { cn } from "@/lib/utils";
import { type DirectorySortValue } from "@/lib/directory/types";
import { commitDirectoryListingUrl } from "@/lib/directory/directory-url-navigation";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";

export function DirectorySort({
  current,
  className,
  sortCopy,
}: {
  current: DirectorySortValue;
  className?: string;
  sortCopy: DirectoryUiCopy["sort"];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const options = useMemo(
    () =>
      [
        { value: "recommended" as const, label: sortCopy.recommended },
        { value: "featured" as const, label: sortCopy.featured },
        { value: "recent" as const, label: sortCopy.recent },
        { value: "updated" as const, label: sortCopy.updated },
      ] as const,
    [sortCopy],
  );

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    startTransition(() => {
      commitDirectoryListingUrl(router, pathname, searchParams.toString(), (params) => {
        if (val === "recommended") {
          params.delete("sort");
        } else {
          params.set("sort", val);
        }
      });
    });
  }

  return (
    <select
      value={current}
      onChange={handleChange}
      className={cn(
        "h-9 rounded-lg border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)] px-3 py-1.5 text-sm text-[var(--impronta-muted)] outline-none transition-colors focus:border-[var(--impronta-gold)] focus:ring-1 focus:ring-[var(--impronta-gold)]/30",
        pending && "opacity-60",
        className,
      )}
      aria-label={sortCopy.aria}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
