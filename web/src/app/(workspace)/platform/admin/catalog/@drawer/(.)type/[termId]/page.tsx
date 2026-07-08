// Intercepting route — when a talent-type row is clicked from the Catalog hub
// types tab, this renders the editor inside a slide-over drawer instead of
// navigating to the full page. A hard load / refresh of /catalog/type/[termId]
// bypasses interception and renders the real full page (type/[termId]/page.tsx).
// Save actions redirect back to /catalog/type/${termId}?saved=… which
// re-intercepts and keeps the drawer open with the save notice.

import { loadPlatformTalentTypeDetail } from "../../../../../talent-types-data";
import { FieldDrawer } from "../../../field-drawer";
import { TalentTypeDetailView } from "../../../type/talent-type-detail-view";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";

export const dynamic = "force-dynamic";

export default async function InterceptedTalentTypeDrawer({
  params,
  searchParams,
}: {
  params: Promise<{ termId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { termId } = await params;
  const { saved, error } = await searchParams;
  const detail = await loadPlatformTalentTypeDetail(termId);
  const t = createTranslator(await getRequestLocale());
  const K = "dashboard.platform.catalog";

  return (
    <FieldDrawer title={t(`${K}.typeDrawerTitle`)} ariaLabel={t(`${K}.typeDrawerAriaEditor`)}>
      <TalentTypeDetailView
        detail={detail}
        termId={termId}
        saved={saved}
        error={error}
        variant="drawer"
        t={t}
      />
    </FieldDrawer>
  );
}
