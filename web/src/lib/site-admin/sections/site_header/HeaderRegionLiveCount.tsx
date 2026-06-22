"use client";

import { usePublicDiscoveryStateOptional } from "@/components/directory/public-discovery-state";

/**
 * WF-5 — live numeric count badge for a freeform header item (inquiry / saved).
 * Reuses the same public discovery state the editorial-split actions use, so an
 * inquiry/cart or saved item dropped into a region shows a live count. Renders
 * nothing until there is a positive count. Keep strictly "use client" with no
 * type re-exports (server/client boundary 500 hazard).
 */
export function HeaderRegionLiveCount({
  kind,
}: {
  kind: "saved" | "favorites";
}) {
  const discovery = usePublicDiscoveryStateOptional();
  const count = discovery
    ? kind === "saved"
      ? discovery.savedCount
      : discovery.favoritesCount
    : 0;
  if (!count || count <= 0) return null;
  return <span className="site-header__es-bdg">{count}</span>;
}
