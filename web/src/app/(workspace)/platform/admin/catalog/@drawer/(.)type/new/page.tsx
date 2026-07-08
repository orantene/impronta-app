// Intercepting route — when "+ New talent type" is clicked from the Catalog hub
// types tab, this renders the create form inside a slide-over drawer instead of
// navigating to the full page. A hard load / refresh of /catalog/type/new
// bypasses interception and renders the real full page (type/new/page.tsx).

import { FieldDrawer } from "../../../field-drawer";
import { TalentTypeDetailView } from "../../../type/talent-type-detail-view";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";

export const dynamic = "force-dynamic";

export default async function InterceptedNewTalentTypeDrawer({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const t = createTranslator(await getRequestLocale());
  const K = "dashboard.platform.catalog";

  return (
    <FieldDrawer title={t(`${K}.typeNewDrawerTitle`)} ariaLabel={t(`${K}.typeNewDrawerAriaEditor`)}>
      <TalentTypeDetailView
        detail={{ ok: false, notFound: false }}
        termId={undefined}
        saved={saved}
        error={error}
        variant="drawer"
        t={t}
      />
    </FieldDrawer>
  );
}
