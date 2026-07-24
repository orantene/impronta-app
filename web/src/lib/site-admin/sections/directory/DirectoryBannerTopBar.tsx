"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { parseTaxonomyParam } from "@/lib/directory/search-params";
import { DirectoryTalentTypeBar } from "@/components/directory/directory-talent-type-bar";
import type { DirectoryFilterOption } from "@/lib/directory/field-driven-filters";
import type { DirectoryCategoryParent } from "@/lib/directory/directory-category-tree";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";

type BannerTopBarProps = {
  options: DirectoryFilterOption[];
  categoryTree?: DirectoryCategoryParent[];
  allLabel: string;
  barAriaLabel: string;
  overflowCopy: DirectoryUiCopy["topBarPills"];
};

function BannerTopBarInner(props: BannerTopBarProps) {
  const sp = useSearchParams();
  const selectedIds = parseTaxonomyParam(sp.get("tax") ?? undefined);
  return <DirectoryTalentTypeBar {...props} selectedIds={selectedIds} />;
}

/**
 * The category quick-link bar hosted INSIDE the lifestyle hero banner
 * (`heroImage` variant). Same interactive two-level pill bar the results
 * toolbar uses — this thin wrapper only reads the live `?tax=` selection so
 * the server-rendered banner can mount it (the results island hides its own
 * copy when the banner owns it).
 */
export function DirectoryBannerTopBar(props: BannerTopBarProps) {
  return (
    <Suspense fallback={null}>
      <BannerTopBarInner {...props} />
    </Suspense>
  );
}
