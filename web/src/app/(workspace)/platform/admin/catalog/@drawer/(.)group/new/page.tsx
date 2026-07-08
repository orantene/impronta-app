// Intercepting route — when "New field group" is clicked from the Catalog hub,
// this renders the create form inside a slide-over drawer instead of navigating
// to the full page. A hard load / refresh of /catalog/group/new bypasses
// interception and renders the real full page.

import { FieldDrawer } from "../../../field-drawer";
import { GroupDetailView } from "../../../group/group-detail-view";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";

export const dynamic = "force-dynamic";

export default async function InterceptedNewGroupDrawer({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const t = createTranslator(await getRequestLocale());
  const K = "dashboard.platform.catalog";

  return (
    <FieldDrawer title={t(`${K}.groupDetailNewTitle`)} ariaLabel={t(`${K}.groupNewDrawerAriaEditor`)}>
      <GroupDetailView group={null} saved={undefined} error={error} variant="drawer" t={t} />
    </FieldDrawer>
  );
}
