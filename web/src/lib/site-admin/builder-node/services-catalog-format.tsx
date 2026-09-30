import type { ReactNode } from "react";

import type { CatalogNavMode } from "./services-catalog-filter";

/** Rail pill count: a trailing muted number; other navs keep " (n)". */
export function railCount(nav: CatalogNavMode, n: number): ReactNode {
  return nav === "rail" ? (
    <small className="site-builder-node--services-catalog-pill-count">{n}</small>
  ) : (
    ` (${n})`
  );
}

/** "2 h 30 min" / "1 h" / "50 min", without the "estimated" suffix. */
export function catalogDurationShort(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
