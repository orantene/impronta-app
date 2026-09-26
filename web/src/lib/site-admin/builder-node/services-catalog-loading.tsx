/**
 * Dedicated `services_catalog` loading skeleton (BRIEF-03 / §14).
 *
 * Layout-matched placeholders so slow networks / pending dataSources do not
 * flash empty copy or a blank band. Used when
 * `dataSources.talentOfferingsLoading` is true, and as a Suspense fallback.
 */

import type { ReactNode } from "react";

export function ServicesCatalogLoadingSkeleton({
  locale,
  showPhoto = true,
  rows = 4,
}: {
  locale: string;
  showPhoto?: boolean;
  rows?: number;
}): ReactNode {
  const es = locale.startsWith("es");
  const label = es ? "Cargando servicios…" : "Loading services…";
  const count = Math.max(1, Math.min(rows, 8));

  return (
    <div
      className="cb-island site-builder-node--services-catalog-loading"
      data-catalog-loading=""
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={label}
    >
      <p className="site-builder-node--services-catalog-loading-label">{label}</p>
      <ul className="site-builder-node--services-catalog-list" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="site-builder-node--services-catalog-row site-builder-node--services-catalog-skel-row">
            {showPhoto ? (
              <span className="site-builder-node--services-catalog-photo site-builder-node--services-catalog-skel" />
            ) : null}
            <span className="site-builder-node--services-catalog-copy">
              <span className="site-builder-node--services-catalog-skel site-builder-node--services-catalog-skel-line site-builder-node--services-catalog-skel-name" />
              <span className="site-builder-node--services-catalog-skel site-builder-node--services-catalog-skel-line site-builder-node--services-catalog-skel-desc" />
              <span className="site-builder-node--services-catalog-skel site-builder-node--services-catalog-skel-line site-builder-node--services-catalog-skel-meta" />
            </span>
            <span className="site-builder-node--services-catalog-price">
              <span className="site-builder-node--services-catalog-skel site-builder-node--services-catalog-skel-line site-builder-node--services-catalog-skel-price" />
            </span>
            <span className="site-builder-node--services-catalog-cta site-builder-node--services-catalog-skel site-builder-node--services-catalog-skel-cta" />
          </li>
        ))}
      </ul>
    </div>
  );
}
