// Platform HQ · Catalog · New generic taxonomy term (full page).
// Handles creation of parent_category and category_group nodes.
// Hard-load target; the intercepting drawer (@drawer/(.)term/new) renders
// the same content inside a slide-over when reached via client navigation.

import { TermDetailView } from "../term-detail-view";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";

export const dynamic = "force-dynamic";

export default async function NewTaxonomyTermPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; parent?: string; saved?: string; error?: string }>;
}) {
  const { kind, parent, saved, error } = await searchParams;
  const resolvedKind =
    kind === "category_group" ? "category_group" : "parent_category";
  const t = createTranslator(await getRequestLocale());

  return (
    <TermDetailView
      detail={null}
      termId={undefined}
      kind={resolvedKind}
      parentId={parent}
      saved={saved}
      error={error}
      variant="page"
      t={t}
    />
  );
}
