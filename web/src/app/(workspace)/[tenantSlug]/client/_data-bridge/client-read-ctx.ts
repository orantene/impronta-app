import "server-only";

import { resolveDashboardIdentity } from "@/lib/impersonation/dashboard-identity";
import {
  effectiveReadContext,
  type EffectiveReadContext,
} from "@/lib/impersonation/effective-read";

/**
 * TUL-255. The read context for a client-portal page, built from the verified
 * impersonation helper only (never a request). A throw means "not acting".
 */
export async function clientPageReadCtx(sessionUserId: string): Promise<EffectiveReadContext> {
  return effectiveReadContext(
    sessionUserId,
    await resolveDashboardIdentity().catch(() => null),
  );
}
