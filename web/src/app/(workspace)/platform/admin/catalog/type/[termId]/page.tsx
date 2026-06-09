// Platform HQ · Catalog · Talent type detail (full page).
// Hard-load target. The intercepting route (@drawer/(.)type/[termId]) renders
// the same content inside a slide-over when reached via client navigation.

import { loadPlatformTalentTypeDetail } from "../../../../talent-types-data";
import { TalentTypeDetailView } from "../talent-type-detail-view";

export const dynamic = "force-dynamic";

export default async function TalentTypeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ termId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { termId } = await params;
  const { saved, error } = await searchParams;
  const detail = await loadPlatformTalentTypeDetail(termId);

  return (
    <TalentTypeDetailView
      detail={detail}
      termId={termId}
      saved={saved}
      error={error}
      variant="page"
    />
  );
}
