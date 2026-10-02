import type { ReactNode } from "react";
import { redirect, notFound } from "next/navigation";

import { isPlatformAdmin } from "@/lib/access/platform-role";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isSupportDeskEnabled } from "@/lib/support/desk-flag";

export const dynamic = "force-dynamic";

/**
 * Dedicated Support Desk chrome (no Platform Admin topbar).
 * Auth: platform admin. Surface: SUPPORT_DESK_ENABLED.
 */
export default async function DeskLayout({ children }: { children: ReactNode }) {
  if (!isSupportDeskEnabled()) notFound();
  const session = await getCachedActorSession();
  if (!session.user) redirect("/login?next=/desk");
  if (!isPlatformAdmin(session.profile)) notFound();
  return children;
}
