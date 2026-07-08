// Platform HQ · Catalog · Create new field group (full page).
// Hard-load target. The intercepting route (@drawer/(.)group/new) renders the
// same content inside a slide-over when reached via client navigation from
// the catalog hub.

import { GroupDetailView } from "../group-detail-view";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";

export const dynamic = "force-dynamic";

export default async function NewFieldGroupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const t = createTranslator(await getRequestLocale());

  return (
    <GroupDetailView group={null} saved={undefined} error={error} variant="page" t={t} />
  );
}
