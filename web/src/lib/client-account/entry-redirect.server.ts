import "server-only";

import { getCachedActorSession } from "@/lib/server/request-cache";

import { accountFlagKindForHost, legacyClientEntryRedirect } from "./agency-area-pure";
import { readAccountHost } from "./area-site.server";
import { clientAccountEnabledFor } from "./flag";
import { resolveAccountTenant } from "./tenant.server";

/**
 * Should an old client entry point (`/me`, `/client`, `/{slug}/client`) send
 * this visitor to `/account`? Flag unset (the default) is always `stay`, so the
 * existing pages behave exactly as before. When `slug` is given it must be THIS
 * host's own tenant; a link to another tenant's client area is never rewritten.
 * The flag kind comes from `x-impronta-host-context` (agency / hub), never a
 * hard-coded `app` check.
 */
export async function legacyClientEntryRedirectFor(slug?: string): Promise<"account" | "stay"> {
  const [host, session] = await Promise.all([readAccountHost(), getCachedActorSession()]);
  const flagKind = accountFlagKindForHost(host.hostContext);
  if (!flagKind || !clientAccountEnabledFor(flagKind)) return "stay";
  const decision = legacyClientEntryRedirect({
    flagOn: true,
    hostContext: host.hostContext,
    userId: session.user?.id ?? null,
    appRole: session.profile?.app_role ?? null,
  });
  if (decision === "stay") return "stay";
  if (slug) {
    const tenant = await resolveAccountTenant();
    if (!tenant || tenant.slug !== slug) return "stay";
  }
  return "account";
}
