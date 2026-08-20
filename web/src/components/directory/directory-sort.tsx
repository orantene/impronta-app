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
  showTopRated = true,
}: {
  current: DirectorySortValue;
  className?: string;
  sortCopy: DirectoryUiCopy["sort"];
  /**
   * Hide the "Top rated" option on surfaces without the reviews entitlement
   * (rating can never affect order there). The option stays visible while the
   * URL already says sort=top_rated so the select never misrepresents state.
   */
  showTopRated?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const options = useMemo(
    () =>
      (
        [
          { value: "recommended" as const, label: sortCopy.recommended },
          { value: "featured" as const, label: sortCopy.featured },
          { value: "top_rated" as const, label: sortCopy.topRated },
          { value: "recent" as const, label: sortCopy.recent },
          { value: "updated" as const, label: sortCopy.updated },
        ] as const
      ).filter(
        (opt) =>
          opt.value !== "top_rated" || showTopRated || current === "top_rated",
      ),
    [sortCopy, showTopRated, current],
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
        "h-10 sm:h-9 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground outline-none transition-colors focus:border-foreground/40 focus:ring-1 focus:ring-foreground/25",
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
