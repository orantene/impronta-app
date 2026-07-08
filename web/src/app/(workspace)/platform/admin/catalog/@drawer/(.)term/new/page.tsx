// Intercepting route — when "+ New parent category" or "+ Group" is clicked
// from the Catalog hub types tab, this renders the create form inside a
// slide-over drawer. A hard load / refresh of /catalog/term/new bypasses
// interception and renders the real full page (term/new/page.tsx).

import { FieldDrawer } from "../../../field-drawer";
import { TermDetailView } from "../../../term/term-detail-view";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";

export const dynamic = "force-dynamic";

export default async function InterceptedNewTermDrawer({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; parent?: string; saved?: string; error?: string }>;
}) {
  const { kind, parent, saved, error } = await searchParams;
  const resolvedKind =
    kind === "category_group" ? "category_group" : "parent_category";
  const t = createTranslator(await getRequestLocale());
  const K = "dashboard.platform.catalog";

  return (
    <FieldDrawer title={t(`${K}.termNewDrawerTitle`)} ariaLabel={t(`${K}.termNewDrawerAriaEditor`)}>
      <TermDetailView
        detail={null}
        termId={undefined}
        kind={resolvedKind}
        parentId={parent}
        saved={saved}
        error={error}
        variant="drawer"
        t={t}
      />
    </FieldDrawer>
  );
}
