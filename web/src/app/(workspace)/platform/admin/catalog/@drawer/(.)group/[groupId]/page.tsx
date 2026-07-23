// Intercepting route — when a group row is clicked from the Catalog hub groups
// tab, this renders the editor inside a slide-over drawer instead of navigating
// to the full page. A hard load / refresh of /catalog/group/[groupId] bypasses
// interception and renders the real full page.
// Save actions redirect back to /catalog/group/[groupId]?saved=group which
// re-intercepts and keeps the drawer open with the save notice.

import { loadFieldGroupDetail } from "../../../group/group-detail-data";
import { FieldDrawer } from "../../../field-drawer";
import { GroupDetailView } from "../../../group/group-detail-view";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";

export const dynamic = "force-dynamic";

export default async function InterceptedGroupDrawer({
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
  const K = "dashboard.platform.catalog";

  return (
    <FieldDrawer title={t(`${K}.createFieldGroup`)} ariaLabel={t(`${K}.groupDrawerAriaEditor`)}>
      <GroupDetailView group={group} saved={saved} error={error} variant="drawer" t={t} />
    </FieldDrawer>
  );
}
