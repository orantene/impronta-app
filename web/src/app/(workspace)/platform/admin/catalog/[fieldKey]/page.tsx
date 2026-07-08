// Platform HQ · Catalog · per-field detail (full page).
// Server Component. Platform-admin gated by the (workspace)/platform/admin
// layout (super_admin). This is the hard-navigation / deep-link / refresh
// target; clicking a field from the Catalog Map list intercepts to a drawer
// instead (see catalog/@drawer/(.)[fieldKey]). Both render <FieldDetailView>.

import { loadPlatformCatalogFieldDetail } from "../../../catalog-field-detail-data";
import { FieldDetailView } from "./field-detail-view";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";

export const dynamic = "force-dynamic";

export default async function PlatformCatalogFieldDetailPage({
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
    <FieldDetailView
      detail={detail}
      decoded={decoded}
      saved={saved}
      error={error}
      variant="page"
      t={t}
    />
  );
}
