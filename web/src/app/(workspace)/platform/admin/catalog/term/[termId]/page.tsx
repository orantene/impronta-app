// Platform HQ · Catalog · Generic taxonomy term detail (full page).
// Handles parent_category and category_group nodes.
// Hard-load target; the intercepting drawer (@drawer/(.)term/[termId]) renders
// the same content inside a slide-over when reached via client navigation.

import { loadPlatformTaxonomyTermDetail } from "../../../../talent-types-data";
import { TermDetailView } from "../term-detail-view";

export const dynamic = "force-dynamic";

export default async function TaxonomyTermDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ termId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { termId } = await params;
  const { saved, error } = await searchParams;
  const detail = await loadPlatformTaxonomyTermDetail(termId);

  return (
    <TermDetailView
      detail={detail}
      termId={termId}
      saved={saved}
      error={error}
      variant="page"
    />
  );
}
