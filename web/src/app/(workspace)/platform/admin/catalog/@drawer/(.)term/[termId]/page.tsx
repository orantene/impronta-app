// Intercepting route — when a parent_category or category_group row is clicked
// from the Catalog hub types tab, this renders the editor inside a slide-over
// drawer. A hard load / refresh of /catalog/term/[termId] bypasses interception
// and renders the real full page (term/[termId]/page.tsx).

import { loadPlatformTaxonomyTermDetail } from "../../../../../talent-types-data";
import { FieldDrawer } from "../../../field-drawer";
import { TermDetailView } from "../../../term/term-detail-view";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";

export const dynamic = "force-dynamic";

export default async function InterceptedTermDrawer({
  params,
  searchParams,
}: {
  params: Promise<{ termId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { termId } = await params;
  const { saved, error } = await searchParams;
  const detail = await loadPlatformTaxonomyTermDetail(termId);
  const t = createTranslator(await getRequestLocale());
  const K = "dashboard.platform.catalog";

  return (
    <FieldDrawer title={t(`${K}.termDrawerTitle`)} ariaLabel={t(`${K}.termDrawerAriaEditor`)}>
      <TermDetailView
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
