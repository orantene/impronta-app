import "server-only";

import { revokeTikTokToken } from "@/lib/connection-oauth/tiktok";
import { TIKTOK_INTEGRATION_KEY } from "@/lib/integrations/catalog";
import { getDecryptedSecret } from "@/lib/integrations/repository";
import { logServerError } from "@/lib/server/safe-error";

/**
 * D4 — kill the grant at the vendor BEFORE the local copy goes, or the token
 * stays valid upstream with nobody holding it. Best effort: a failed revoke is
 * logged and the caller's local delete still happens (that delete is the
 * guarantee). Instagram has no revoke endpoint; the drawer tells the operator
 * where to remove access in the Instagram app instead. Every other
 * integration key is a no-op here.
 */
export async function revokeUpstreamGrant(tenantId: string, key: string): Promise<void> {
  if (key !== TIKTOK_INTEGRATION_KEY) return;
  const accessToken = await getDecryptedSecret(tenantId, key, "access_token");
  if (!accessToken) return;
  const revoked = await revokeTikTokToken(accessToken);
  if (!revoked.ok) {
    logServerError("integrations/remove.revoke", {
      key,
      tenantId,
      status: revoked.status ?? null,
      error: revoked.error,
    });
  }
}
