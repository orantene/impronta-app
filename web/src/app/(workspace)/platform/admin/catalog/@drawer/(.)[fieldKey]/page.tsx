// Intercepting route — when a field is clicked from the Catalog Map list, this
// renders the field editor inside a slide-over drawer over the list instead of
// navigating to the full page. A hard load / refresh of /catalog/[fieldKey]
// bypasses interception and renders the real full page ([fieldKey]/page.tsx).
// Both share <FieldDetailView>. Save actions redirect back to
// /catalog/[fieldKey]?saved=…, which re-intercepts and keeps the drawer open.

import { loadPlatformCatalogFieldDetail } from "../../../../catalog-field-detail-data";
import { FieldDrawer } from "../../field-drawer";
import { FieldDetailView } from "../../[fieldKey]/field-detail-view";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";

export const dynamic = "force-dynamic";

export default async function InterceptedFieldDrawer({
  params,
  searchParams,
}: {
  params: Promise<{ fieldKey: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { fieldKey } = await params;
  const { saved, error } = await searchParams;
  const decoded = decodeURIComponent(fieldKey);
  const detail = await loadPlatformCatalogFieldDetail(decoded);
  const t = createTranslator(await getRequestLocale());

  return (
    <FieldDrawer>
      <FieldDetailView
        detail={detail}
        decoded={decoded}
        saved={saved}
        error={error}
        variant="drawer"
        t={t}
      />
    </FieldDrawer>
  );
}
