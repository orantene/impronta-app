// Platform HQ · Catalog · Field group detail (full page).
// Hard-load / deep-link target. Client navigation from the catalog hub
// intercepts via @drawer/(.)group/[groupId]/page.tsx and renders inside a
// slide-over instead. Both share <GroupDetailView>.

import { loadFieldGroupDetail } from "../group-detail-data";
import { GroupDetailView } from "../group-detail-view";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";

export const dynamic = "force-dynamic";

export default async function FieldGroupDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { groupId } = await params;
  const { saved, error } = await searchParams;
  const group = await loadFieldGroupDetail(groupId);
  const t = createTranslator(await getRequestLocale());

  return (
    <GroupDetailView group={group} saved={saved} error={error} variant="page" t={t} />
  );
}
