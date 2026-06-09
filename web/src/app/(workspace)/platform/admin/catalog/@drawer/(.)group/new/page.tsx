// Intercepting route — when "New field group" is clicked from the Catalog hub,
// this renders the create form inside a slide-over drawer instead of navigating
// to the full page. A hard load / refresh of /catalog/group/new bypasses
// interception and renders the real full page.

import { FieldDrawer } from "../../../field-drawer";
import { GroupDetailView } from "../../../group/group-detail-view";

export const dynamic = "force-dynamic";

export default async function InterceptedNewGroupDrawer({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <FieldDrawer title="New field group" ariaLabel="New field group editor">
      <GroupDetailView group={null} saved={undefined} error={error} variant="drawer" />
    </FieldDrawer>
  );
}
