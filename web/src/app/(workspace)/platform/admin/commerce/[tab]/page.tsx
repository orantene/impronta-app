/**
 * /platform/admin/commerce/<tab> -> /platform/admin/commerce?tab=<tab>.
 *
 * Commerce is one page with `?tab=` chips, so a guessed or bookmarked
 * `/commerce/revenue` had no route and 404ed (TUL-925). Known tabs redirect to
 * the real URL; anything else stays a 404. Auth is the surrounding
 * /platform/admin layout, which redirects signed-out visitors to /login first.
 */

import { notFound, redirect } from "next/navigation";
import { COMMERCE_TABS } from "../_registry";

export const dynamic = "force-dynamic";

export default async function CommerceTabAlias({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = await params;
  if (!COMMERCE_TABS.some((t) => t.id === tab)) notFound();
  redirect(`/platform/admin/commerce?tab=${tab}`);
}
