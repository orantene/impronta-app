import { cookies } from "next/headers";

import { editCookieNameFor } from "./cookie";

/**
 * Server-side edit-mode probe.
 *
 * Reads the tenant-scoped edit cookie. Does NOT authenticate anything —
 * the preview JWT (checked separately by `isPreviewActiveForTenant`) is
 * what gates draft reads. This probe only tells render whether to wrap
 * sections with edit-mode affordances (data-section-id, hover targets).
 *
 * In the normal flow the two are set together by `enterEditModeAction`,
 * so they move as one. If someone hand-crafts the cookies they'll get a
 * broken, but not privileged, experience.
 */
export async function isEditModeActiveForTenant(
  tenantId: string,
): Promise<boolean> {
  if (!tenantId) return false;
  try {
    const jar = await cookies();
    return jar.get(editCookieNameFor(tenantId))?.value === "1";
  } catch {
    return false;
  }
}
