// Platform HQ · Catalog · New talent type (full page).
// Hard-load target. The intercepting route (@drawer/(.)type/new) renders the
// same content inside a slide-over when reached via client navigation from
// the catalog hub.

import { TalentTypeDetailView } from "../talent-type-detail-view";

export const dynamic = "force-dynamic";

export default async function NewTalentTypePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;

  return (
    <TalentTypeDetailView
      detail={{ ok: false, notFound: false }}
      termId={undefined}
      saved={saved}
      error={error}
      variant="page"
    />
  );
}
