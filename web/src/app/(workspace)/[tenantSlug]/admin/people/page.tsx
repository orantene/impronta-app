/**
 * People — one person, up to three independent hats (W26 to W35, W11).
 *
 * Replaces the stub that forwarded /admin/people to the roster SPA. The
 * roster surface is untouched and still lives at /admin/roster: this page is
 * the surrounding record, not a rewrite of the profile editor.
 *
 * Server component. The whole record set is resolved here so the first paint
 * carries every hat state; nothing on the client derives a hat from data that
 * is not already in the props. The view (Everyone · Talent · Bookable ·
 * Access · Add · How it fits together) is a `view` query the rail's children
 * carry, read here so a hard load lands on the right tab.
 */
import { notFound } from "next/navigation";

import { resolveWorkspaceType } from "@/lib/saas/assert-roster-workspace";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { PeopleClient } from "./PeopleClient";
import { loadPeopleSurface } from "./people-data";
import { parsePeopleView } from "./people-views";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;
type PageSearch = Promise<{ view?: string | string[] }>;

export default async function PeoplePage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: PageSearch;
}) {
  const { tenantSlug } = await params;
  const { view } = await searchParams;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  // "You're on this list too" (W27) is a fact about the signed-in operator,
  // not about the workspace: the account id is read once here and compared
  // against every record's account, never guessed from a name.
  const supabase = await createSupabaseServerClient();
  const viewerAccountId = supabase
    ? ((await supabase.auth.getUser()).data.user?.id ?? null)
    : null;

  // The Applications tab opens the roster's own queue, whose route 404s a
  // business workspace; the tab is drawn only where the route answers.
  const [surface, workspaceType] = await Promise.all([
    loadPeopleSurface(scope.tenantId, viewerAccountId),
    resolveWorkspaceType(scope.tenantId),
  ]);

  return (
    <PeopleClient
      people={surface.people}
      loadFailed={surface.loadFailed}
      workspaceAllowsDirectBooking={surface.workspaceAllowsDirectBooking}
      initialView={parsePeopleView(Array.isArray(view) ? view[0] : view)}
      workspaceType={workspaceType}
    />
  );
}
