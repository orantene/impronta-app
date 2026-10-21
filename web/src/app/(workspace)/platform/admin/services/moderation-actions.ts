"use server";

/**
 * Platform Admin: set or clear a service's moderation state (TUL-1713).
 *
 * super_admin only. The decision, validation and audit row live in
 * `@/lib/talent/offering-moderation` (pure, tested with fakes); this file checks the platform role,
 * refuses an impersonated session, and wires the real service-role deps. No type exports: a
 * "use server" module exports only async functions.
 */

import { getCachedActorSession } from "@/lib/server/request-cache";
import { getPlatformRole } from "@/lib/access/platform-role";
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { setOfferingModeration } from "@/lib/talent/offering-moderation";
import { realModerationDeps } from "@/lib/talent/offering-moderation.server";

export async function setServiceModerationAsPlatform(
  offeringId: string,
  state: string,
  reason: string,
): Promise<{ ok: true; changed: boolean; state: string; audited: boolean } | { ok: false; error: string }> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "You must be signed in." };
  if (getPlatformRole(session.profile) !== "super_admin") {
    return { ok: false, error: "Forbidden — platform admin only." };
  }
  const deps = realModerationDeps();
  if (!deps) return { ok: false, error: "Platform service client unavailable." };
  return setOfferingModeration(deps, session.user.id, { offeringId, state, reason });
}
