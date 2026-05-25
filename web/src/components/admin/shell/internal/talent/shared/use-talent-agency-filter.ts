"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAdminShell } from "../../state";

/** URL-backed agency filter for unified talent inbox (`?agency=<slug>`). */
export function useTalentAgencyFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { bridgeTalentAgencies } = useAdminShell();

  const filter = searchParams.get("agency") ?? "all";

  const setFilter = useCallback(
    (slug: "all" | string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (slug === "all") params.delete("agency");
      else params.set("agency", slug);
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, searchParams],
  );

  const agencies = bridgeTalentAgencies ?? [];

  const showChips = agencies.length > 1;

  const unreadByAgency = useMemo(() => {
    const map = new Map<string, number>();
    for (const ag of agencies) {
      map.set(ag.agencySlug, 0);
    }
    return map;
  }, [agencies]);

  return { filter, setFilter, agencies, showChips, unreadByAgency };
}

export function matchesAgencyFilter(
  filter: string,
  agencySlug: string | undefined,
): boolean {
  if (filter === "all") return true;
  return agencySlug === filter;
}
