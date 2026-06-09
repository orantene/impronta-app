// Platform HQ · Catalog · Create new field group (full page).
// Hard-load target. The intercepting route (@drawer/(.)group/new) renders the
// same content inside a slide-over when reached via client navigation from
// the catalog hub.

import { GroupDetailView } from "../group-detail-view";

export const dynamic = "force-dynamic";

export default async function NewFieldGroupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <GroupDetailView group={null} saved={undefined} error={error} variant="page" />
  );
}
