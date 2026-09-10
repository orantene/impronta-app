/**
 * People — one person, up to three independent hats.
 *
 * Replaces the stub that forwarded /admin/people to the roster SPA. The
 * roster surface is untouched and still lives at /admin/roster: this page is
 * the surrounding record, not a rewrite of the profile editor.
 *
 * Server component. The whole record set is resolved here so the first paint
 * carries every hat state; nothing on the client derives a hat from data that
 * is not already in the props.
 */
import { notFound } from "next/navigation";

import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { PeopleClient } from "./PeopleClient";
import { loadPeopleSurface } from "./people-data";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function PeoplePage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const surface = await loadPeopleSurface(scope.tenantId);

  return <PeopleClient people={surface.people} loadFailed={surface.loadFailed} />;
}
