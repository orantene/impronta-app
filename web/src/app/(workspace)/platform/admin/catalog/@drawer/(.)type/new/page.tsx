// Intercepting route — when "+ New talent type" is clicked from the Catalog hub
// types tab, this renders the create form inside a slide-over drawer instead of
// navigating to the full page. A hard load / refresh of /catalog/type/new
// bypasses interception and renders the real full page (type/new/page.tsx).

import { FieldDrawer } from "../../../field-drawer";
import { TalentTypeDetailView } from "../../../type/talent-type-detail-view";

export const dynamic = "force-dynamic";

export default async function InterceptedNewTalentTypeDrawer({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;

  return (
    <FieldDrawer title="New talent type" ariaLabel="New talent type editor">
      <TalentTypeDetailView
        detail={{ ok: false, notFound: false }}
        termId={undefined}
        saved={saved}
        error={error}
        variant="drawer"
      />
    </FieldDrawer>
  );
}
